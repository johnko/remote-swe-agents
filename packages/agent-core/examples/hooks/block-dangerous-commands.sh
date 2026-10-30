#!/bin/bash
# Example hook: Block dangerous or suspicious patterns in tool inputs
# Demonstrates permission blocking for security

set -e

# Read JSON payload from stdin
PAYLOAD=$(cat)

# Extract tool input
TOOL_INPUT=$(echo "$PAYLOAD" | jq -r '.toolInput // empty')
TOOL_NAME=$(echo "$PAYLOAD" | jq -r '.toolName')

# Define dangerous patterns
DANGEROUS_PATTERNS=(
  "rm -rf"
  "sudo mkfs"
  "dd if=/dev/zero"
  "curl.*\| bash"
  "curl.*\| sh"
)

# Check if input matches any dangerous pattern
DENIED=0
REASON=""

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$TOOL_INPUT" | grep -qE "$pattern"; then
    DENIED=1
    REASON="Blocked dangerous pattern: $pattern"
    break
  fi
done

# Return response
if [ $DENIED -eq 1 ]; then
  cat <<EOF
{
  "permission": "deny",
  "reason": "$REASON"
}
EOF
else
  cat <<EOF
{
  "permission": "allow"
}
EOF
fi
