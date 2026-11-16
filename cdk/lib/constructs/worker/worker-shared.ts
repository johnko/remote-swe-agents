import { PolicyStatement, IRole, AccountPrincipal } from 'aws-cdk-lib/aws-iam';
import { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { IStringParameter } from 'aws-cdk-lib/aws-ssm';
import { VapidKeys } from '../vapid-keys';
import { WorkerBus } from './bus';

/**
 * Shared troubleshooting permissions for worker roles.
 * Applied to both EC2 worker instances and AgentCore runtime.
 */
export function createTroubleshootingPolicyStatement(): PolicyStatement {
  return new PolicyStatement({
    actions: [
      'bedrock:ListFoundationModels',
      'ce:GetCostAndUsage',
      'ce:GetCostForecast',
      'ce:GetUsageForecast',
      'cloudformation:ContinueUpdateRollback',
      'cloudformation:DescribeStackEvents',
      'cloudformation:DescribeStackResource',
      'ecr:DescribeImages',
      'ecr:DescribeRepositories',
      'lambda:GetFunction',
      'lambda:GetFunctionCode',
      'logs:DescribeLogStreams',
      'logs:DescribeLogGroups',
      'logs:GetLogEvents',
      'logs:FilterLogEvents',
      's3:ListBucket',
      's3:GetBucketLocation',
      's3:GetBucketVersioning',
      's3:ListBucket',
      'ssm:DescribeParameters',
      'ssm:GetServiceSetting',
      'ssm:ListTagsForResource',
    ],
    resources: ['*'],
  });
}

/**
 * Policy for invoking Bedrock models and getting caller identity.
 * Used by both AgentCore runtime and Worker EC2 instances.
 */
export function createInvokeModelPolicy(): PolicyStatement {
  return new PolicyStatement({
    actions: ['bedrock:InvokeModel', 'sts:GetCallerIdentity'],
    resources: ['*'],
  });
}

/**
 * Allowed cross-account agent role assumption accounts.
 */
export const CROSS_ACCOUNT_AGENT_ROLE_ACCOUNTS = [
  '034259613105',
  '764858776402',
  '083792476388',
  '082114243833',
  '987988470805',
];

/**
 * Policy statement that allows assuming the CrossAccountAgentRole in specific accounts.
 * This is used for cross-account agent role assumption.
 */
export function createAssumeCrossAccountAgentRolePolicyStatement(): PolicyStatement {
  return new PolicyStatement({
    actions: ['sts:AssumeRole'],
    resources: CROSS_ACCOUNT_AGENT_ROLE_ACCOUNTS.map((account) => `arn:aws:iam::${account}:role/CrossAccountAgentRole`),
  });
}

/**
 * Common grants for shared resources across both AgentCore and Worker.
 * Grants read/write access to storage, images, skills, optional parameters, and event bus.
 */
export function grantCommonResources(
  role: IRole,
  resources: {
    storageTable: ITableV2;
    imageBucket: IBucket;
    skillBucket: IBucket;
    vapidKeys: VapidKeys;
    gitHubAppPrivateKeyParameter?: IStringParameter;
    githubPersonalAccessTokenParameter?: IStringParameter;
    slackBotTokenParameter?: IStringParameter;
    bus?: WorkerBus;
  }
): void {
  resources.storageTable.grantReadWriteData(role);
  resources.imageBucket.grantReadWrite(role);
  resources.skillBucket.grantReadWrite(role);
  resources.vapidKeys.grantRead(role);
  resources.gitHubAppPrivateKeyParameter?.grantRead(role);
  resources.githubPersonalAccessTokenParameter?.grantRead(role);
  resources.slackBotTokenParameter?.grantRead(role);
  resources.bus?.api.grantPublishAndSubscribe(role);
  resources.bus?.api.grantConnect(role);
}
