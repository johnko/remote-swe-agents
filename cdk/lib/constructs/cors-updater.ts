import { Construct } from 'constructs';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface CorsUpdaterProps {
  /**
   * The CloudFront domain to add to CORS
   */
  cloudFrontDomain: string;
  
  /**
   * Bucket name (can be a token/Fn::GetAtt)
   */
  imageBucketName: string;
  
  /**
   * Bucket name (can be a token/Fn::GetAtt)
   */
  skillBucketName: string;
}

/**
 * Updates S3 bucket CORS configuration using bucket names instead of references.
 * This avoids circular dependencies because it doesn't create resource dependencies
 * on the S3 bucket objects themselves - just uses their names.
 */
export class CorsUpdater extends Construct {
  constructor(scope: Construct, id: string, props: CorsUpdaterProps) {
    super(scope, id);

    const allowedOrigins = [props.cloudFrontDomain];
    
    // CORS configuration for both buckets
    const corsRules = [
      {
        AllowedOrigins: allowedOrigins,
        AllowedMethods: ['GET', 'HEAD'],
        AllowedHeaders: ['authorization', 'content-type', 'x-amz-content-sha256', 'x-amz-date', 'x-requested-with'],
        MaxAgeSeconds: 3000,
      },
    ];

    // Update image bucket CORS using bucket name
    new AwsCustomResource(this, 'UpdateImageBucketCors', {
      onCreate: {
        service: 'S3',
        action: 'putBucketCors',
        parameters: {
          Bucket: props.imageBucketName,
          CORSConfiguration: {
            CORSRules: corsRules,
          },
        },
        physicalResourceId: PhysicalResourceId.of(`${id}-image-cors`),
      },
      onUpdate: {
        service: 'S3',
        action: 'putBucketCors',
        parameters: {
          Bucket: props.imageBucketName,
          CORSConfiguration: {
            CORSRules: corsRules,
          },
        },
        physicalResourceId: PhysicalResourceId.of(`${id}-image-cors`),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['s3:PutBucketCors'],
          resources: ['*'], // Use wildcards since we reference by name not ARN
        }),
      ]),
    });

    // Update skill bucket CORS using bucket name
    new AwsCustomResource(this, 'UpdateSkillBucketCors', {
      onCreate: {
        service: 'S3',
        action: 'putBucketCors',
        parameters: {
          Bucket: props.skillBucketName,
          CORSConfiguration: {
            CORSRules: corsRules,
          },
        },
        physicalResourceId: PhysicalResourceId.of(`${id}-skill-cors`),
      },
      onUpdate: {
        service: 'S3',
        action: 'putBucketCors',
        parameters: {
          Bucket: props.skillBucketName,
          CORSConfiguration: {
            CORSRules: corsRules,
          },
        },
        physicalResourceId: PhysicalResourceId.of(`${id}-skill-cors`),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['s3:PutBucketCors'],
          resources: ['*'], // Use wildcards since we reference by name not ARN
        }),
      ]),
    });
  }
}
