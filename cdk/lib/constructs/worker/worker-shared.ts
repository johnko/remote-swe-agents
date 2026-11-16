import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

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
