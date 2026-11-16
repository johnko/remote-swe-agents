import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { WorkerBus } from './bus';
import {
  createAssumeCrossAccountAgentRolePolicyStatement,
  createInvokeModelPolicy,
  createTroubleshootingPolicyStatement,
  grantCommonResources,
} from './worker-shared';
import { BlockPublicAccess, Bucket, IBucket } from 'aws-cdk-lib/aws-s3';
import { AssetHashType, DockerImage, RemovalPolicy, Stack, ILocalBundling, BundlingOptions } from 'aws-cdk-lib';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { join } from 'path';
import { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { IStringParameter, StringParameter } from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import { WorkerImageBuilder } from './image-builder';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { Asset, AssetProps } from 'aws-cdk-lib/aws-s3-assets';
import { AgentCoreRuntime } from './agent-core-runtime';
import { IRepository } from 'aws-cdk-lib/aws-ecr';
import { EventTrigger } from './event-trigger';
import { VapidKeys } from '../vapid-keys';
import { UserPool } from 'aws-cdk-lib/aws-cognito';

export interface WorkerProps {
  vpc: ec2.IVpc;
  storageTable: ITableV2;
  imageBucket: IBucket;
  skillBucket: IBucket;
  previewMicrovmImageArn?: string;
  slackBotTokenParameter?: IStringParameter;
  gitHubApp?: {
    privateKeyParameterName: string;
    appId: string;
    installationId: string;
  };
  githubPersonalAccessTokenParameter?: IStringParameter;
  loadBalancing?: {
    awsAccounts: string[];
    roleName: string;
  };
  accessLogBucket: IBucket;
  amiIdParameterName: string;
  amiIdParameter: IStringParameter;
  webappOriginSourceParameter: IStringParameter;
  additionalManagedPolicies?: string[];
  bedrockCriRegionOverride?: string;
  userPool: UserPool;
  cognitoDomainName: string;
  vapidKeys: VapidKeys;
}

export class Worker extends Construct {
  public readonly launchTemplate: ec2.LaunchTemplate;
  public readonly bus: WorkerBus;
  public readonly logGroup: logs.LogGroup;
  public readonly imageBuilder: WorkerImageBuilder;
  public readonly agentCoreRuntime: AgentCoreRuntime;
  public readonly eventTrigger: EventTrigger;
  public readonly ec2Role: iam.Role;

  constructor(scope: Construct, id: string, props: WorkerProps) {
    super(scope, id);

    const { vpc } = props;

    const mcpJsonPath = join('..', 'packages', 'worker', 'mcp.json');
    try {
      JSON.parse(readFileSync(mcpJsonPath).toString());
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error(`${mcpJsonPath} has syntax error! Please fix it.`);
      }
    }

    // Create CloudWatch LogGroup for worker logs
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const privateKey = props.gitHubApp
      ? StringParameter.fromStringParameterAttributes(this, 'GitHubAppPrivateKey', {
          parameterName: props.gitHubApp.privateKeyParameterName,
          forceDynamicReference: true,
        })
      : undefined;

    const sourceBucket = new Bucket(this, 'SourceBucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      enforceSSL: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: props.accessLogBucket,
      serverAccessLogsPrefix: 's3AccessLog/SourceBucket/',
    });

    const bus = new WorkerBus(this, 'Bus', {});
    this.bus = bus;

    const eventTrigger = new EventTrigger(this, 'EventTrigger', {
      storageTable: props.storageTable,
      bus: bus,
      userPool: props.userPool,
      cognitoDomainName: props.cognitoDomainName,
    });
    this.eventTrigger = eventTrigger;

    const assetProps: AssetProps = {
      // we set dummy directory here because all the files are included in the build image.
      path: join('..', 'resources'),
      bundling: {
        command: [
          'sh',
          '-c',
          [
            //
            'cd /asset-input',
            'tar -zcf source.tar.gz -C /build/ .',
            'mkdir -p /asset-output/source',
            'mv source.tar.gz /asset-output/source',
          ].join('&&'),
        ],
        image: DockerImage.fromRegistry('public.ecr.aws/docker/library/alpine'),
        local: {
          tryBundle(outputDir: string, _options: BundlingOptions): boolean {
            try {
              const sourceDir = join(__dirname, '..', '..', '..', '..');
              const outSourceDir = join(outputDir, 'source');
              execSync(`mkdir -p "${outSourceDir}"`, { stdio: 'inherit' });
              execSync(
                [
                  `tar -zcf "${join(outSourceDir, 'source.tar.gz')}"`,
                  '--exclude=./.git',
                  '--exclude=./.github',
                  '--exclude=./cdk',
                  '--exclude=./docs',
                  '--exclude=./resources',
                  '--exclude=./node_modules',
                  '--exclude=*/node_modules',
                  '--exclude=*/dist',
                  '--exclude=*/.next',
                  `-C "${sourceDir}" .`,
                ].join(' '),
                { stdio: 'inherit' }
              );
              return true;
            } catch {
              return false;
            }
          },
        } satisfies ILocalBundling,
      },
      assetHashType: AssetHashType.OUTPUT,
    };
    // Create the source asset with explicit hash type to ensure changes are detected
    const sourceAsset = new Asset(this, 'SourceAssetForHash', assetProps);
    const sourceAssetHash = sourceAsset.assetHash;

    new BucketDeployment(this, 'SourceDeployment', {
      destinationBucket: sourceBucket,
      sources: [Source.asset(assetProps.path, assetProps)],
    });

    // Create a list of managed policies with the base SSM policy and ViewOnlyAccess for troubleshooting
    const managedPolicies = [
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('job-function/ViewOnlyAccess'),
    ];

    // Add any additional AWS managed policies if specified
    if (props.additionalManagedPolicies && props.additionalManagedPolicies.length > 0) {
      props.additionalManagedPolicies.forEach((policy) => {
        if (policy.startsWith('arn:')) {
          managedPolicies.push(
            iam.ManagedPolicy.fromManagedPolicyArn(this, `Policy-${policy.split('/').pop()}`, policy)
          );
        } else {
          managedPolicies.push(iam.ManagedPolicy.fromAwsManagedPolicyName(policy));
        }
      });
    }

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: managedPolicies,
    });

    const launchTemplate = new ec2.LaunchTemplate(this, 'LaunchTemplate', {
      // Use the pre-built worker AMI from ImageBuilder instead of the base Ubuntu AMI.
      // The worker AMI has all dependencies (Docker, Node.js, AWS CLI, etc.) pre-installed.
      // We use the CfnLaunchTemplate construct directly to avoid CDK's machine image lookup
      // which can't handle path-based SSM parameter names properly in this version.
      // The ImageId will be set via override below to use the SSM parameter.
      machineImage: ec2.MachineImage.genericLinux({
        // Placeholder - will be overridden with actual SSM parameter value
        'us-east-1': 'ami-placeholder',
        'us-east-2': 'ami-placeholder',
        'us-west-1': 'ami-placeholder',
        'us-west-2': 'ami-placeholder',
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.LARGE),
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      role,
      requireImdsv2: true,
      instanceMetadataTags: true,
      securityGroup: new ec2.SecurityGroup(this, 'SecurityGroup', {
        vpc,
      }),
    });

    // Override the ImageId to use the worker AMI from SSM parameter.
    // This avoids the CDK issue where fromSsmParameter can't determine the ARN separator
    // for path-based parameter names (like "/StackName/worker-ami-id").
    // Use the SSM parameter name directly with the {{resolve:ssm-secure:...}} syntax.
    (launchTemplate.node.defaultChild as ec2.CfnLaunchTemplate).addPropertyOverride(
      'LaunchTemplateData.ImageId',
      `{{resolve:ssm:${props.amiIdParameterName}}}`
    );

    const userData = launchTemplate.userData!;

    // SECURITY: SHA-256 checksums for external downloads
    // Update these values when upgrading versions to prevent supply chain attacks
    // To get SHA256: curl -fsSL <url> | sha256sum
    const nvmSha256 = 'a909fdd01765379ebc5983674adafb8bc9de6d928bfa188761309d4a0c36be0f';
    const uvSha256 = 'ca1e8196672bf04ccb926519f2071208a8d6c0ce02fb65bc7d0a85be1b684b0f';

    // Tool installation script for Image Builder (AMI creation)
    // This goes into the AMI and should only include tool installations
    const toolInstallationCommands = `
apt-get -o DPkg::Lock::Timeout=-1 update
apt-get -o DPkg::Lock::Timeout=-1 upgrade -y

# Install python3 and jq
apt-get -o DPkg::Lock::Timeout=-1 install -y python3-pip unzip jq
ln -s -f /usr/bin/pip3 /usr/bin/pip
ln -s -f /usr/bin/python3 /usr/bin/python

# Install docker https://docs.docker.com/engine/install/ubuntu/#set-up-the-repository
apt-get -o DPkg::Lock::Timeout=-1 install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  \$(. /etc/os-release && echo "\${UBUNTU_CODENAME:-\$VERSION_CODENAME}") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get -o DPkg::Lock::Timeout=-1 update
apt-get -o DPkg::Lock::Timeout=-1 install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
groupadd docker
usermod -aG docker ubuntu

# Install Node.js via nvm with SHA-256 verification
# SECURITY: Verify installer integrity before execution to prevent supply chain attacks
NVM_INSTALLER_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh"
NVM_INSTALLER_PATH="/tmp/nvm-install.sh"
curl -fsSL "\$NVM_INSTALLER_URL" -o "\$NVM_INSTALLER_PATH"
# Calculate SHA256 and verify against known good value
# NOTE: Update this SHA256 when upgrading nvm version
NVM_SHA256=\$(sha256sum "\$NVM_INSTALLER_PATH" | awk '{print \$1}')
NVM_EXPECTED_SHA256="\${nvmSha256}"
if [ -n "\$NVM_EXPECTED_SHA256" ] && [ "\$NVM_SHA256" != "\$NVM_EXPECTED_SHA256" ]; then
  echo "ERROR: nvm installer SHA256 mismatch! Expected: \$NVM_EXPECTED_SHA256, Got: \$NVM_SHA256" >&2
  rm -f "\$NVM_INSTALLER_PATH"
  exit 1
fi
sudo -u ubuntu bash "\$NVM_INSTALLER_PATH"
rm -f "\$NVM_INSTALLER_PATH"
sudo -u ubuntu bash -c -i "nvm install 22"

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
sudo ./aws/install

# Install Fluent Bit via apt (more secure than curl | sh)
# Fluent Bit provides signed apt packages - GPG verification happens automatically
# First add the Fluent Bit repository with GPG key
curl -fsSL https://packages.fluentbit.io/fluentbit.key | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/fluentbit.gpg
FLUENT_BIT_CODENAME=\$(. /etc/os-release && echo "\$VERSION_CODENAME")
echo "deb https://packages.fluentbit.io/ubuntu/\$FLUENT_BIT_CODENAME \$FLUENT_BIT_CODENAME main" | sudo tee /etc/apt/sources.list.d/fluent-bit.list > /dev/null
apt-get -o DPkg::Lock::Timeout=-1 update
apt-get -o DPkg::Lock::Timeout=-1 install -y fluent-bit

# Install GitHub CLI via apt with GPG verification
# SECURITY: Using apt with GPG-signed packages is more secure than curl | sh
# GitHub CLI provides signed apt packages
type -p wget >/dev/null || apt-get -o DPkg::Lock::Timeout=-1 install -y wget
mkdir -p -m 755 /etc/apt/keyrings
wget -nv -O /etc/apt/keyrings/githubcli-archive-keyring.gpg https://cli.github.com/packages/githubcli-archive-keyring.gpg
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get -o DPkg::Lock::Timeout=-1 update
apt-get -o DPkg::Lock::Timeout=-1 install -y gh

# Configure Git user for ubuntu
sudo -u ubuntu bash -c 'git config --global user.name "remote-swe-app[bot]"'
sudo -u ubuntu bash -c 'git config --global user.email "${
      props.gitHubApp?.appId ?? '123456'
    }+remote-swe-app[bot]@users.noreply.github.com"'

# Install uv (Python package manager) from GitHub releases with SHA-256 verification
# SECURITY: Verify download integrity to prevent supply chain attacks
# uv provides pre-built binaries as tar.gz archives with SHA256 checksums
UV_VERSION="0.7.0"
UV_TAR_URL="https://github.com/astral-sh/uv/releases/download/\${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz"
UV_TEMP_DIR="/tmp/uv-install"
UV_EXPECTED_SHA256="\${uvSha256}"
mkdir -p "\$UV_TEMP_DIR"
curl -fsSL "\$UV_TAR_URL" -o "\$UV_TEMP_DIR/uv.tar.gz"
# Verify SHA256 if configured (prevents supply chain attacks)
if [ -n "\$UV_EXPECTED_SHA256" ]; then
  UV_ACTUAL_SHA256=\$(sha256sum "\$UV_TEMP_DIR/uv.tar.gz" | awk '{print \$1}')
  if [ "\$UV_ACTUAL_SHA256" != "\$UV_EXPECTED_SHA256" ]; then
    echo "ERROR: uv tar.gz SHA256 mismatch! Expected: \$UV_EXPECTED_SHA256, Got: \$UV_ACTUAL_SHA256" >&2
    rm -rf "\$UV_TEMP_DIR"
    exit 1
  fi
fi
tar -xzf "\$UV_TEMP_DIR/uv.tar.gz" -C "\$UV_TEMP_DIR" --strip-components=1
# Move binaries to /usr/local/bin
mv "\$UV_TEMP_DIR/uv" /usr/local/bin/
mv "\$UV_TEMP_DIR/uvx" /usr/local/bin/
rm -rf "\$UV_TEMP_DIR"
    `.trim();

    userData.addCommands(
      `
apt-get -o DPkg::Lock::Timeout=-1 update
apt-get -o DPkg::Lock::Timeout=-1 upgrade -y

# Install python3 and jq
apt-get -o DPkg::Lock::Timeout=-1 install -y python3-pip unzip jq
ln -s -f /usr/bin/pip3 /usr/bin/pip
ln -s -f /usr/bin/python3 /usr/bin/python

# Install docker https://docs.docker.com/engine/install/ubuntu/#set-up-the-repository
apt-get -o DPkg::Lock::Timeout=-1 install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "\${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get -o DPkg::Lock::Timeout=-1 update
apt-get -o DPkg::Lock::Timeout=-1 install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
groupadd docker
usermod -aG docker ubuntu

# Install Node.js via nvm with SHA-256 verification
# SECURITY: Verify installer integrity before execution to prevent supply chain attacks
NVM_INSTALLER_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh"
NVM_INSTALLER_PATH="/tmp/nvm-install.sh"
curl -fsSL "$NVM_INSTALLER_URL" -o "$NVM_INSTALLER_PATH"
# Calculate SHA256 and verify against known good value
# NOTE: Update this SHA256 when upgrading nvm version
NVM_SHA256=$(sha256sum "$NVM_INSTALLER_PATH" | awk '{print $1}')
NVM_EXPECTED_SHA256="${nvmSha256}"
if [ -n "$NVM_EXPECTED_SHA256" ] && [ "$NVM_SHA256" != "$NVM_EXPECTED_SHA256" ]; then
  echo "ERROR: nvm installer SHA256 mismatch! Expected: $NVM_EXPECTED_SHA256, Got: $NVM_SHA256" >&2
  rm -f "$NVM_INSTALLER_PATH"
  exit 1
fi
sudo -u ubuntu bash "$NVM_INSTALLER_PATH"
rm -f "$NVM_INSTALLER_PATH"
sudo -u ubuntu bash -c -i "nvm install 22"

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
sudo ./aws/install

# Install Fluent Bit via apt (more secure than curl | sh)
# Fluent Bit provides signed apt packages - GPG verification happens automatically
# First add the Fluent Bit repository with GPG key
curl -fsSL https://packages.fluentbit.io/fluentbit.key | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/fluentbit.gpg
FLUENT_BIT_CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")
echo "deb https://packages.fluentbit.io/ubuntu/$FLUENT_BIT_CODENAME $FLUENT_BIT_CODENAME main" | sudo tee /etc/apt/sources.list.d/fluent-bit.list > /dev/null
apt-get -o DPkg::Lock::Timeout=-1 update
apt-get -o DPkg::Lock::Timeout=-1 install -y fluent-bit

# Install GitHub CLI via apt with GPG verification
# SECURITY: Using apt with GPG-signed packages is more secure than curl | sh
# GitHub CLI provides signed apt packages
type -p wget >/dev/null || apt-get -o DPkg::Lock::Timeout=-1 install -y wget
mkdir -p -m 755 /etc/apt/keyrings
wget -nv -O /etc/apt/keyrings/githubcli-archive-keyring.gpg https://cli.github.com/packages/githubcli-archive-keyring.gpg
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get -o DPkg::Lock::Timeout=-1 update
apt-get -o DPkg::Lock::Timeout=-1 install -y gh

# Configure Git user for ubuntu
sudo -u ubuntu bash -c 'git config --global user.name "remote-swe-app[bot]"'
sudo -u ubuntu bash -c 'git config --global user.email "${
        props.gitHubApp?.appId ?? '123456'
      }+remote-swe-app[bot]@users.noreply.github.com"'

# Install uv (Python package manager) from GitHub releases with SHA-256 verification
# SECURITY: Verify download integrity to prevent supply chain attacks
# uv provides pre-built binaries as tar.gz archives with SHA256 checksums
UV_VERSION="0.7.0"
UV_TAR_URL="https://github.com/astral-sh/uv/releases/download/\${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz"
UV_TEMP_DIR="/tmp/uv-install"
UV_EXPECTED_SHA256="${uvSha256}"
mkdir -p "$UV_TEMP_DIR"
curl -fsSL "$UV_TAR_URL" -o "$UV_TEMP_DIR/uv.tar.gz"
# Verify SHA256 if configured (prevents supply chain attacks)
if [ -n "$UV_EXPECTED_SHA256" ]; then
  UV_ACTUAL_SHA256=$(sha256sum "$UV_TEMP_DIR/uv.tar.gz" | awk '{print $1}')
  if [ "$UV_ACTUAL_SHA256" != "$UV_EXPECTED_SHA256" ]; then
    echo "ERROR: uv tar.gz SHA256 mismatch! Expected: $UV_EXPECTED_SHA256, Got: $UV_ACTUAL_SHA256" >&2
    rm -rf "$UV_TEMP_DIR"
    exit 1
  fi
fi
tar -xzf "$UV_TEMP_DIR/uv.tar.gz" -C "$UV_TEMP_DIR" --strip-components=1
# Move binaries to /usr/local/bin
mv "$UV_TEMP_DIR/uv" /usr/local/bin/
mv "$UV_TEMP_DIR/uvx" /usr/local/bin/
rm -rf "$UV_TEMP_DIR"
      `.trim()
    );

    if (privateKey) {
      // install gh-token to obtain github token using github apps credentials
      userData.addCommands(
        `
aws ssm get-parameter \
    --name ${privateKey.parameterName} \
    --query "Parameter.Value" \
    --output text > /opt/private-key.pem
# SECURITY: Download gh-token binary with version pinning
GH_TOKEN_VERSION="2.0.4"
GH_TOKEN_URL="https://github.com/Link-/gh-token/releases/download/v$GH_TOKEN_VERSION/linux-amd64"
GH_TOKEN_PATH="/tmp/gh-token"
GH_TOKEN_SHA256="e9a674f5cd7666f2e45966a78cfa4992f505f04700620a718ca0afcd160b1a60"
curl -fsSL "$GH_TOKEN_URL" -o "$GH_TOKEN_PATH"
# Verify SHA256 if configured (prevents supply chain attacks)
if [ -n "$GH_TOKEN_SHA256" ]; then
  ACTUAL_SHA256=$(sha256sum "$GH_TOKEN_PATH" | awk '{print $1}')
  if [ "$ACTUAL_SHA256" != "$GH_TOKEN_SHA256" ]; then
    echo "ERROR: gh-token SHA256 mismatch! Expected: $GH_TOKEN_SHA256, Got: $ACTUAL_SHA256" >&2
    rm -f "$GH_TOKEN_PATH"
    exit 1
  fi
fi
chmod +x "$GH_TOKEN_PATH"
mv "$GH_TOKEN_PATH" /usr/bin/gh-token
      `.trim()
      );
    }

    userData.addCommands(
      `
mkdir -p /opt/myapp && cd /opt/myapp
chown -R ubuntu:ubuntu /opt/myapp

# Install Playwright dependencies
sudo -u ubuntu bash -i -c "npx playwright install-deps"
sudo -u ubuntu bash -i -c "npx playwright install chromium"
# Disable Ubuntu security feature to get chromium working
# https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md
echo 0 | tee /proc/sys/kernel/apparmor_restrict_unprivileged_userns
echo kernel.apparmor_restrict_unprivileged_userns=0 | tee /etc/sysctl.d/60-apparmor-namespace.conf

# Configure GitHub CLI
sudo -u ubuntu bash -c "gh config set prompt disabled"

# Create setup script
mkdir -p /opt/scripts
cat << 'EOF' > /opt/scripts/start-app.sh
#!/bin/bash

# Set S3 bucket name
S3_BUCKET_NAME="${sourceBucket.bucketName}"
ETAG_FILE="/opt/myapp/.source_etag"
SOURCE_TAR_NAME="source.tar.gz"

# Enable strict mode for safety
set -e

# Function to download and extract fresh source files
download_fresh_files() {
  echo "Downloading fresh source files."
  # Clean up existing files
  rm -rf ./{*,.*} 2>/dev/null || echo "Cleaning up existing files"
  
  # Download source code from S3
  aws s3 cp s3://$S3_BUCKET_NAME/source/$SOURCE_TAR_NAME ./$SOURCE_TAR_NAME
  
  # Extract and clean up
  tar -xvzf $SOURCE_TAR_NAME
  rm -f $SOURCE_TAR_NAME
  
  # Install dependencies and build
  npm ci
  npm run build -w packages/agent-core

  # Install Chrome
  cd packages/worker
  npx playwright install chromium
  cd -

  # Save the ETag
  echo "$CURRENT_ETAG" > "$ETAG_FILE"
}

# Get current ETag from S3
CURRENT_ETAG=$(aws s3api head-object --bucket $S3_BUCKET_NAME --key source/$SOURCE_TAR_NAME --query ETag --output text)

# Check if we can use cached source code
if [ -f "$ETAG_FILE" ]; then
  CACHED_ETAG=$(cat $ETAG_FILE)
  
  if [ "$CURRENT_ETAG" == "$CACHED_ETAG" ]; then
    echo "ETag matches. Using existing source files."
    # Files are already in place, no need to do anything
  else
    # ETag doesn't match, need to download fresh files
    download_fresh_files
  fi
else
  # No ETAG file, need to download fresh files
  download_fresh_files
fi

if [ "$NO_START" == "true" ]; then
  echo "NO_START=true is passed. Existing..."
  exit 0
fi

# Set up dynamic environment variables
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 900")
export WORKER_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/RemoteSweWorkerId)
export SLACK_BOT_TOKEN=${
        props.slackBotTokenParameter
          ? `$(aws ssm get-parameter --name ${props.slackBotTokenParameter.parameterName} --query "Parameter.Value" --output text 2>/dev/null || echo "")`
          : '""'
      }
export GITHUB_PERSONAL_ACCESS_TOKEN=${
        props.githubPersonalAccessTokenParameter
          ? `$(aws ssm get-parameter --name ${props.githubPersonalAccessTokenParameter.parameterName} --query \"Parameter.Value\" --output text 2>/dev/null || echo "")`
          : '""'
      }

# Fetch VAPID keys from SSM if configured
if [ -n "$VAPID_PUBLIC_KEY_PARAMETER_NAME" ]; then
  export VAPID_PUBLIC_KEY=$(aws ssm get-parameter --name "$VAPID_PUBLIC_KEY_PARAMETER_NAME" --query "Parameter.Value" --output text 2>/dev/null || echo "")
fi
if [ -n "$VAPID_PRIVATE_KEY_PARAMETER_NAME" ]; then
  export VAPID_PRIVATE_KEY=$(aws ssm get-parameter --name "$VAPID_PRIVATE_KEY_PARAMETER_NAME" --query "Parameter.Value" --output text 2>/dev/null || echo "")
fi

# Start app
cd packages/worker
npx tsx src/main.ts
EOF

# Make script executable and set ownership
chmod +x /opt/scripts/start-app.sh
chown ubuntu:ubuntu /opt/scripts/start-app.sh

# cache worker files
sudo -u ubuntu bash -i -c "NO_START=true /opt/scripts/start-app.sh"

cat << EOF > /etc/systemd/system/myapp.service
[Unit]
Description=My Node.js Application
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/myapp

ExecStart=/bin/bash -i -c /opt/scripts/start-app.sh
Restart=always
RestartSec=10
TimeoutStartSec=600
TimeoutStopSec=10s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=myapp
# Static environment variables
Environment=WORKER_RUNTIME=ec2
Environment="PATH=/root/.nvm/versions/node/v22.23.5/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment=AWS_REGION=${Stack.of(this).region}
Environment=EVENT_HTTP_ENDPOINT=${bus.httpEndpoint}
Environment=GITHUB_APP_PRIVATE_KEY_PATH=${privateKey ? '/opt/private-key.pem' : ''}
Environment=GITHUB_APP_ID=${props.gitHubApp?.appId ?? ''}
Environment=GITHUB_APP_INSTALLATION_ID=${props.gitHubApp?.installationId ?? ''}
Environment=TABLE_NAME=${props.storageTable.tableName}
Environment=BUCKET_NAME=${props.imageBucket.bucketName}
Environment=SKILL_BUCKET_NAME=${props.skillBucket.bucketName}
Environment=WEBAPP_ORIGIN_NAME_PARAMETER=${props.webappOriginSourceParameter.parameterName}
Environment=BEDROCK_AWS_ACCOUNTS=${props.loadBalancing?.awsAccounts.join(',') ?? ''}
Environment=BEDROCK_AWS_ROLE_NAME=${props.loadBalancing?.roleName ?? ''}
Environment=BEDROCK_CRI_REGION_OVERRIDE=${props.bedrockCriRegionOverride ?? ''}
Environment=VAPID_PUBLIC_KEY_PARAMETER_NAME=${props.vapidKeys.publicKeyParameter.parameterName}
Environment=VAPID_PRIVATE_KEY_PARAMETER_NAME=${props.vapidKeys.privateKeyParameter.parameterName}
Environment=EVENT_TRIGGER_SFN_ARN=${eventTrigger.handlerStateMachine.stateMachineArn}
Environment=EVENT_TRIGGER_SFN_ROLE_ARN=${eventTrigger.schedulerRole.roleArn}
Environment=EVENT_TRIGGER_TTL_SFN_ARN=${eventTrigger.ttlStateMachine.stateMachineArn}
Environment=EVENT_TRIGGER_TTL_SFN_ROLE_ARN=${eventTrigger.schedulerRole.roleArn}
Environment=EVENT_TRIGGER_RESOURCE_PREFIX=${eventTrigger.resourcePrefix}

[Install]
WantedBy=multi-user.target
EOF
`.trim()
    );

    userData.addCommands(`
# Configure Fluent Bit for CloudWatch Logs
mkdir -p /etc/fluent-bit
mkdir -p /var/lib/fluent-bit

cat << EOF > /etc/fluent-bit/fluent-bit.conf
[SERVICE]
    Flush        5
    Daemon       Off
    Log_Level    info
    storage.path /var/lib/fluent-bit/

[INPUT]
    Name           systemd
    Tag            myapp
    Systemd_Filter _SYSTEMD_UNIT=myapp.service
    DB             /var/lib/fluent-bit/systemd.db

[FILTER]
    Name         modify
    Match        myapp
    Remove_regex ^(?!MESSAGE).+$

[OUTPUT]
    Name         cloudwatch_logs
    Match        myapp
    region       ${Stack.of(this).region}
    log_group_name    ${this.logGroup.logGroupName}
    log_stream_name   log-\\\${WORKER_ID}
    auto_create_group false
EOF

# Create Fluent Bit startup script
cat << 'EOF' > /opt/scripts/start-fluent-bit.sh
#!/bin/bash

TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 900")
export WORKER_ID=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/RemoteSweWorkerId)

exec /opt/fluent-bit/bin/fluent-bit -c /etc/fluent-bit/fluent-bit.conf
EOF

# Make script executable
chmod +x /opt/scripts/start-fluent-bit.sh

# Create and configure Fluent Bit systemd service
cat << EOF > /etc/systemd/system/fluent-bit.service
[Unit]
Description=Fluent Bit
After=network.target

[Service]
Type=simple
ExecStart=/opt/scripts/start-fluent-bit.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable fluent-bit
systemctl enable myapp
      `);

    const installDependenciesCommand = userData.render();

    userData.addCommands(
      `
systemctl start fluent-bit
systemctl start myapp
      `.trim()
    );

    this.launchTemplate = launchTemplate;

    // Constructed after the launch template and instance role so that the
    // runtime can be granted the capability to launch EC2 workers for child
    // sessions targeting ec2 runtime agents.
    const agentCoreRuntime = new AgentCoreRuntime(this, 'AgentCore', {
      storageTable: props.storageTable,
      imageBucket: props.imageBucket,
      skillBucket: props.skillBucket,
      bus: bus,
      slackBotTokenParameter: props.slackBotTokenParameter,
      gitHubApp: props.gitHubApp,
      gitHubAppPrivateKeyParameter: privateKey,
      githubPersonalAccessTokenParameter: props.githubPersonalAccessTokenParameter,
      loadBalancing: props.loadBalancing,
      accessLogBucket: props.accessLogBucket,
      previewMicrovmImageArn: props.previewMicrovmImageArn,
      amiIdParameter: props.amiIdParameter,
      launchTemplateId: launchTemplate.launchTemplateId!,
      subnetIdListForWorkers: vpc.publicSubnets.map((s) => s.subnetId).join(','),
      workerInstanceRole: role,
      webappOriginSourceParameter: props.webappOriginSourceParameter,
      bedrockCriRegionOverride: props.bedrockCriRegionOverride,
      additionalManagedPolicies: props.additionalManagedPolicies,
      vapidKeys: props.vapidKeys,
      eventTrigger,
    });
    this.agentCoreRuntime = agentCoreRuntime;

    // Grant event trigger management to AgentCore role
    eventTrigger.grantManage(agentCoreRuntime);

    this.imageBuilder = new WorkerImageBuilder(this, 'ImageBuilder', {
      vpc,
      installDependenciesCommand: toolInstallationCommands,
      amiIdParameterName: props.amiIdParameterName,
      amiIdParameter: props.amiIdParameter,
      sourceBucket,
      sourceAssetHash,
    });

    props.webappOriginSourceParameter.grantRead(role);
    role.addToPrincipalPolicy(createInvokeModelPolicy());
    if (props.loadBalancing) {
      role.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['sts:AssumeRole'],
          resources: [`arn:aws:iam::*:role/${props.loadBalancing!.roleName}`],
        })
      );
    }
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ec2:TerminateInstances', 'ec2:StopInstances'],
        resources: ['*'],
        // can only terminate themselves
        conditions: {
          StringEquals: {
            'aws:ARN': '${ec2:SourceInstanceARN}',
          },
        },
      })
    );
    // Add troubleshooting permissions for AWS environment diagnostics
    role.addToPrincipalPolicy(createTroubleshootingPolicyStatement());

    // Add cross-account agent role assumption permissions
    role.addToPrincipalPolicy(createAssumeCrossAccountAgentRolePolicyStatement());

    sourceBucket.grantRead(role);
    grantCommonResources(role, {
      storageTable: props.storageTable,
      imageBucket: props.imageBucket,
      skillBucket: props.skillBucket,
      vapidKeys: props.vapidKeys,
      gitHubAppPrivateKeyParameter: privateKey,
      githubPersonalAccessTokenParameter: props.githubPersonalAccessTokenParameter,
      slackBotTokenParameter: props.slackBotTokenParameter,
      bus: bus,
    });

    this.ec2Role = role;

    // Grant event trigger management permissions to EC2 worker role
    eventTrigger.grantManage(role);

    // Grant permissions to write logs to CloudWatch
    this.logGroup.grantWrite(role);
  }
}
