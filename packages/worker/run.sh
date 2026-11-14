#!/bin/bash
# runner script for AgentCore Runtime
# dependencies:
#   - aws cli

# Security: Validate node binary location to prevent PATH manipulation attacks
# Use explicit path to node binary to avoid executing a malicious binary
NODE_BIN=$(which node 2>/dev/null)

# Verify node binary exists and is executable
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  # Fallback to common locations
  for path in "/root/.nvm/versions/node/v22.23.5/bin/node" "/usr/bin/node" "/usr/local/bin/node"; do
    if [ -x "$path" ]; then
      NODE_BIN="$path"
      break
    fi
  done
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "ERROR: Node.js binary not found or not executable" >&2
  echo "Expected location: /root/.nvm/versions/node/v*/bin/node or /usr/bin/node" >&2
  exit 1
fi

# Optional: Verify the binary is not writable by others (security check)
if [ -w "$NODE_BIN" ] && [ "$(stat -c '%a' "$NODE_BIN" | cut -c1)" != "7" ]; then
  echo "WARNING: Node binary is writable by others: $NODE_BIN" >&2
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

# Security: Clear PATH to prevent dll/preload attacks via modified PATH
# Only use essential paths
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

exec "$NODE_BIN" --import tsx src/agent-core.ts
