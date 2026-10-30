#!/bin/bash
# Example hook: Log all tool executions to a file for audit purposes
# Demonstrates passive observation without blocking

set -e

# Read JSON payload from stdin
PAYLOAD=$(cat)

# Extract tool name and session ID
TOOL_NAME=$(echo "$PAYLOAD" | jq -r '.toolName')
SESSION_ID=$(echo "$PAYLOAD" | jq -r '.sessionId')
EVENT=$(echo "$PAYLOAD" | jq -r '.event')
TIMESTAMP=$(echo "$PAYLOAD" | jq -r '.timestamp')

# Define log file (you could use S3, CloudWatch, etc.)
LOG_FILE="${HOME}/.rswea-hooks/tool-usage.log"
mkdir -p "${HOME}/.rswea-hooks"

# Append to log
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] EVENT=$EVENT TOOL=$TOOL_NAME SESSION=$SESSION_ID" >> "$LOG_FILE"

# Return success response (passive observation)
cat <<EOF
{
  "permission": "allow"
}
EOF
