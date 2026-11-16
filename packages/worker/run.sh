#!/bin/bash
# runner script for AgentCore Runtime
# dependencies:
#   - aws cli

# Security: Set a restricted PATH to prevent PATH manipulation attacks
# Include Lambda-specific paths (/var/lang/bin), nvm node path, and standard system paths
export PATH="/var/lang/bin:/root/.nvm/versions/node/v${NODE_VERSION}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Security: Find node binary explicitly to avoid PATH manipulation
# Check known system locations first, including Lambda-specific paths
NODE_BIN=""
for path in "/var/lang/bin/node" "$NVM_DIR/versions/node/v${NODE_VERSION}/bin/node" "/usr/bin/node" "/usr/local/bin/node"; do
  if [ -x "$path" ]; then
    NODE_BIN="$path"
    break
  fi
done

# Fallback: try command -v (POSIX built-in) if known paths failed
if [ -z "$NODE_BIN" ]; then
  NODE_BIN=$(command -v node 2>/dev/null || true)
fi

# Security: Ensure node binary exists and is executable
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "ERROR: Node.js binary not found or not executable" >&2
  exit 1
fi

if [ -n "$GITHUB_APP_PRIVATE_KEY_PARAMETER_NAME" ]; then
    aws ssm get-parameter \
        --name $GITHUB_APP_PRIVATE_KEY_PARAMETER_NAME \
        --query "Parameter.Value" \
        --output text > /opt/private-key.pem
    export GITHUB_APP_PRIVATE_KEY_PATH="/opt/private-key.pem"
fi

if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN_PARAMETER_NAME" ]; then
    export GITHUB_PERSONAL_ACCESS_TOKEN=$(aws ssm get-parameter --name $GITHUB_PERSONAL_ACCESS_TOKEN_PARAMETER_NAME --query "Parameter.Value" --output text)
fi

if [ -n "$SLACK_BOT_TOKEN_PARAMETER_NAME" ]; then
  export SLACK_BOT_TOKEN=$(aws ssm get-parameter --name $SLACK_BOT_TOKEN_PARAMETER_NAME --query "Parameter.Value" --output text)
fi

exec "$NODE_BIN" --import tsx src/agent-core.ts
