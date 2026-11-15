#!/bin/bash -x

# Security: Set a restricted PATH to prevent PATH manipulation attacks
# Include Lambda-specific paths (/var/lang/bin) and standard system paths
export PATH="/var/lang/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Security: Find node binary explicitly to avoid PATH manipulation
# Check known system locations first, including Lambda-specific paths
NODE_BIN=""
for path in "/var/lang/bin/node" "/usr/bin/node" "/usr/local/bin/node"; do
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

[ ! -d '/tmp/cache' ] && mkdir -p /tmp/cache

exec "$NODE_BIN" packages/webapp/server.js
