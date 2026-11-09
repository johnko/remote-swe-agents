import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, Billing, TableV2, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';
import { BlockPublicAccess, Bucket, HttpMethods, IBucket, CfnBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageProps {
  accessLogBucket: IBucket;
  /**
   * Additional allowed origins for CORS configuration.
   * These origins will be merged with CORS_ALLOWED_ORIGINS env var.
   * Useful for injecting CloudFront domain at deployment time.
   */
  additionalAllowedOrigins?: string[];
}

export class Storage extends Construct {
  public readonly table: TableV2;
  public readonly bucket: Bucket;
  public readonly skillBucket: Bucket;
  private _allowedOrigins: string[];

  constructor(scope: Construct, id: string, props: StorageProps) {
    super(scope, id);

    const table = new TableV2(this, 'History', {
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billing: Billing.onDemand(),
      timeToLiveAttribute: 'TTL',
      removalPolicy: RemovalPolicy.DESTROY,
      localSecondaryIndexes: [
        {
          indexName: 'LSI1',
          sortKey: { name: 'LSI1', type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
        },
      ],
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'SK', type: AttributeType.STRING },
          sortKey: { name: 'PK', type: AttributeType.STRING },
          projectionType: ProjectionType.KEYS_ONLY,
        },
      ],
    });

    // Security: Restrict CORS to specific allowed origins
    // Configure CORS_ALLOWED_ORIGINS env var with comma-separated domains
    // Plus any additional origins passed via props (e.g., CloudFront domain)
    const envOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',').filter(Boolean) || [];
    const additionalOrigins = props.additionalAllowedOrigins || [];
    this._allowedOrigins = [...new Set([...envOrigins, ...additionalOrigins])];
    
    if (this._allowedOrigins.length === 0) {
      console.warn('[Storage] No CORS_ALLOWED_ORIGINS or additionalAllowedOrigins configured - CORS will not be functional');
    }

    const bucket = new Bucket(this, 'ImageBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: props.accessLogBucket,
      serverAccessLogsPrefix: 's3AccessLog/ImageBucket/',
      cors: [
        {
          // SECURITY FIX: Remove wildcard origins - explicit whitelist only
          allowedOrigins: this._allowedOrigins.length > 0 ? this._allowedOrigins : ['https://placeholder.example.com'],
          // SECURITY FIX: Restrict to minimal required headers only
          allowedHeaders: ['authorization', 'content-type', 'x-amz-content-sha256', 'x-amz-date', 'x-requested-with'],
          // SECURITY FIX: Remove PUT/POST - only allow read operations via CORS
          // Uploads should use presigned POST URLs or server-side proxying
          allowedMethods: [HttpMethods.GET, HttpMethods.HEAD],
          maxAge: 3000,
        },
      ],
    });

    // Dedicated bucket for skill packages. Non-prod defaults to DESTROY +
    // autoDeleteObjects; production stacks override to RETAIN via
    // RemovalPolicies.of(stack).retain() in bin/cdk.ts.
    const skillBucket = new Bucket(this, 'SkillBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: Duration.days(90),
        },
      ],
      serverAccessLogsBucket: props.accessLogBucket,
      serverAccessLogsPrefix: 's3AccessLog/SkillBucket/',
      cors: [
        {
          // SECURITY FIX: Remove wildcard origins - explicit whitelist only
          allowedOrigins: this._allowedOrigins.length > 0 ? this._allowedOrigins : ['https://placeholder.example.com'],
          // SECURITY FIX: Restrict to minimal required headers only
          allowedHeaders: ['authorization', 'content-type', 'x-amz-content-sha256', 'x-amz-date', 'x-requested-with'],
          // SECURITY FIX: Only allow read operations via CORS
          allowedMethods: [HttpMethods.GET, HttpMethods.HEAD],
          maxAge: 3000,
        },
      ],
    });

    this.table = table;
    this.bucket = bucket;
    this.skillBucket = skillBucket;

    new CfnOutput(this, 'TableName', { value: table.tableName });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'SkillBucketName', { value: skillBucket.bucketName });
  }

  /**
   * Add additional allowed origins to the CORS configuration.
   * This must be called before the stack is synthesized.
   * Useful for adding CloudFront domain after Storage is created.
   */
  public addAllowedOrigins(origins: string[]): void {
    if (origins.length === 0) return;
    
    // Merge with existing origins and deduplicate
    const newOrigins = [...new Set([...this._allowedOrigins, ...origins])];
    this._allowedOrigins = newOrigins;

    // Update the underlying CfnBucket CORS configuration via escape hatch
    const imageBucketCfn = this.bucket.node.defaultChild as CfnBucket;
    const skillBucketCfn = this.skillBucket.node.defaultChild as CfnBucket;

    const corsConfiguration = {
      corsRules: [
        {
          allowedOrigins: newOrigins.length > 0 ? newOrigins : ['https://placeholder.example.com'],
          allowedHeaders: ['authorization', 'content-type', 'x-amz-content-sha256', 'x-amz-date', 'x-requested-with'],
          allowedMethods: ['GET', 'HEAD'],
          maxAge: 3000,
        },
      ],
    };

    imageBucketCfn.addPropertyOverride('CorsConfiguration', corsConfiguration);
    skillBucketCfn.addPropertyOverride('CorsConfiguration', corsConfiguration);

    console.log(`[Storage] Updated CORS allowed origins: ${newOrigins.join(', ')}`);
  }
}
