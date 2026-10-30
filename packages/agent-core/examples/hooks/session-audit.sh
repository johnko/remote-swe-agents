#!/bin/bash
# Example hook: Audit session lifecycle events
# Demonstrates observation of session start/end for cost tracking or notifications

set -e

# Read JSON payload from stdin
PAYLOAD=$(cat)

# Extract event details
EVENT=$(echo "$PAYLOAD" | jq -r '.event')
SESSION_ID=$(echo "$PAYLOAD" | jq -r '.sessionId')
USER_ID=$(echo "$PAYLOAD" | jq -r '.userId // empty')
DURATION=$(echo "$PAYLOAD" | jq -r '.duration // empty')

# Define audit file
AUDIT_FILE="${HOME}/.rswea-hooks/session-audit.log"
mkdir -p "${HOME}/.rswea-hooks"

# Log based on event type
if [ "$EVENT" = "sessionStart" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] SESSION_START session=$SESSION_ID user=$USER_ID" >> "$AUDIT_FILE"
  
  # Example: You could send a notification here
  # curl -X POST https://your-webhook.example.com/session-start \
  #   -H "Content-Type: application/json" \
  #   -d "{\"sessionId\": \"$SESSION_ID\", \"userId\": \"$USER_ID\"}"
  
elif [ "$EVENT" = "sessionEnd" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] SESSION_END session=$SESSION_ID user=$USER_ID duration=${DURATION}ms" >> "$AUDIT_FILE"
  
  # Example: Log session costs
  # echo "$DURATION" | awk '{print $1 / 1000}' | xargs echo "Session duration (seconds):"
fi

# Return success response (passive observation)
cat <<EOF
{
  "permission": "allow"
}
EOF
