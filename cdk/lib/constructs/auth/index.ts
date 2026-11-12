import { CfnOutput, CfnResource, CustomResource, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { CfnManagedLoginBranding, ManagedLoginVersion, Mfa, UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Code, Runtime, SingletonFunction } from 'aws-cdk-lib/aws-lambda';
import { CnameRecord, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface AuthProps {
  readonly hostedZone?: IHostedZone;
  readonly sharedCertificate?: ICertificate;
  readonly initialUserEmail?: string;
}

export class Auth extends Construct {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  readonly domainName: string;

  private callbackUrlCount = 0;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);
    const { hostedZone } = props;
    const subDomain = 'auth';
    let domainPrefix = '';
    if (!hostedZone) {
      // When we do not use a custom domain, we must make domainPrefix unique in the AWS region.
      // To avoid a collision, we generate a random string with CFn custom resource.
      const generator = new SingletonFunction(this, 'RandomStringGenerator', {
        runtime: Runtime.NODEJS_24_X,
        handler: 'index.handler',
        timeout: Duration.seconds(5),
        lambdaPurpose: 'RandomStringGenerator',
        uuid: '11e9c903-f11a-4989-833c-985dddef5eb2',
        code: Code.fromInline(readFileSync(join(__dirname, 'prefix-generator.js')).toString()),
      });

      const domainPrefixResource = new CustomResource(this, 'DomainPrefix', {
        serviceToken: generator.functionArn,
        resourceType: 'Custom::RandomString',
        properties: { prefix: 'webapp-', length: 10 },
        serviceTimeout: Duration.seconds(10),
      });
      domainPrefix = domainPrefixResource.getAttString('generated');
    }

    this.domainName = hostedZone
      ? `${subDomain}.${hostedZone.zoneName}`
      : `${domainPrefix}.auth.${Stack.of(this).region}.amazoncognito.com`;

    const userPool = new UserPool(this, 'UserPool', {
      passwordPolicy: {
        requireUppercase: true,
        requireSymbols: true,
        requireDigits: true,
        minLength: 10,
        requireLowercase: true,
        tempPasswordValidity: Duration.days(1),
      },
      selfSignUpEnabled: false,
      signInAliases: {
        username: false,
        email: true,
      },
      // SECURITY: Enable optional MFA via TOTP for additional account protection
      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false, // SMS-based 2FA disabled due to SIM swap risks
        otp: true, // TOTP-based 2FA enabled (authenticator apps)
      },
      // SECURITY: Track sign-ins with device tracking
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: true,
      },
      userInvitation: {
        emailSubject: 'Account Invitation - Remote SWE Agents',
        emailBody: `Hi {username}<br>
<br>
Thank you for registering to Remote SWE Agents.<br>
Here is your login information:<br>
Username: {username}<br>
Temporary password: {####}<br><br>
You can set a new password after logging in.<br><br>
Best regards,<br>
Remote SWE Agents Team
`.trim(),
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const client = userPool.addClient(`Client`, {
      // SECURITY: Reduced token validity from 24 hours to 1 hour for enhanced security
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(7),
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        // NOTE: AWS Cognito validates redirect URIs server-side (exact match required).
        // The localhost URL is for development only; production is protected by Cognito validation.
        callbackUrls: ['http://localhost/dummy'],
        logoutUrls: ['http://localhost/dummy'],
      },
      // SECURITY: Require PKCE for authorization code flow to prevent CSRF attacks
      enableTokenRevocation: true,
    });

    this.client = client;
    this.userPool = userPool;

    const domain = userPool.addDomain('CognitoDomain', {
      ...(hostedZone && props.sharedCertificate
        ? {
            customDomain: {
              domainName: this.domainName,
              certificate: props.sharedCertificate,
            },
          }
        : {
            cognitoDomain: {
              domainPrefix,
            },
          }),
      managedLoginVersion: ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    if (hostedZone) {
      new CnameRecord(this, 'CognitoDomainRecord', {
        zone: hostedZone,
        recordName: subDomain,
        domainName: domain.cloudFrontEndpoint,
      });
    }

    new CfnManagedLoginBranding(this, 'Branding', {
      userPoolId: this.userPool.userPoolId,
      clientId: client.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    if (props.initialUserEmail) {
      new AwsCustomResource(this, 'CreateUser', {
        onUpdate: {
          service: '@aws-sdk/client-cognito-identity-provider',
          action: 'adminCreateUser',
          parameters: {
            UserPoolId: this.userPool.userPoolId,
            Username: props.initialUserEmail,
          },
          physicalResourceId: PhysicalResourceId.of(this.userPool.userPoolId + props.initialUserEmail),
          ignoreErrorCodesMatching: 'UsernameExistsException',
        },
        policy: AwsCustomResourcePolicy.fromSdkCalls({
          resources: [this.userPool.userPoolArn],
        }),
      });
    }

    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
  }

  public addAllowedCallbackUrls(callbackUrl: string, logoutUrl: string) {
    const resource = this.client.node.defaultChild;
    if (!CfnResource.isCfnResource(resource)) {
      throw new Error('Expected CfnResource');
    }
    resource.addPropertyOverride(`CallbackURLs.${this.callbackUrlCount}`, callbackUrl);
    resource.addPropertyOverride(`LogoutURLs.${this.callbackUrlCount}`, logoutUrl);
    this.callbackUrlCount += 1;
  }

  public updateAllowedCallbackUrls(callbackUrls: string[], logoutUrls: string[]) {
    // Lambda depends on userPoolClientId but userPoolClient depends on the CloudFront domain name (callback URL) which depends on Lambda (fURL).
    // To avoid the circular dependency, we update the callback URL after a userPoolClientId is created.
    // We only use this when custom domain is not used.
    new AwsCustomResource(this, 'UpdateCallbackUrls', {
      onUpdate: {
        service: '@aws-sdk/client-cognito-identity-provider',
        action: 'updateUserPoolClient',
        parameters: {
          ClientId: this.client.userPoolClientId,
          UserPoolId: this.userPool.userPoolId,
          AllowedOAuthFlows: ['code'],
          AllowedOAuthFlowsUserPoolClient: true,
          AllowedOAuthScopes: ['profile', 'phone', 'email', 'openid', 'aws.cognito.signin.user.admin'],
          ExplicitAuthFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
          CallbackURLs: callbackUrls,
          LogoutURLs: logoutUrls,
          SupportedIdentityProviders: ['COGNITO'],
          TokenValidityUnits: {
            IdToken: 'minutes',
            AccessToken: 'minutes',
            RefreshToken: 'days',
          },
          IdTokenValidity: 60,
          AccessTokenValidity: 60,
          RefreshTokenValidity: 7,
        },
        physicalResourceId: PhysicalResourceId.of(this.userPool.userPoolId),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [this.userPool.userPoolArn],
      }),
    });
  }
}
