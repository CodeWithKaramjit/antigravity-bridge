#!/bin/bash

# Resolve Node.js binary path even in clean macOS GUI environments
NODE_BIN=""

if [ -n "$HOME" ]; then
  # 1. Check NVM versions (newest first)
  if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NVM=$(ls -d "$HOME/.nvm/versions/node"/* 2>/dev/null | tail -n 1)
    if [ -x "$LATEST_NVM/bin/node" ]; then
      NODE_BIN="$LATEST_NVM/bin/node"
    fi
  fi
fi

# 2. Check Homebrew (Apple Silicon & Intel)
if [ -z "$NODE_BIN" ] && [ -x "/opt/homebrew/bin/node" ]; then
  NODE_BIN="/opt/homebrew/bin/node"
fi
if [ -z "$NODE_BIN" ] && [ -x "/usr/local/bin/node" ]; then
  NODE_BIN="/usr/local/bin/node"
fi

# 3. Fallback to command -v node
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node 2>/dev/null)"
fi

LOG="/tmp/antigravity-native-host.log"
echo "--- [SH] $(date) ---" >> "$LOG"
echo "Args: $@" >> "$LOG"
echo "Resolved NODE_BIN: $NODE_BIN" >> "$LOG"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$(dirname "$NODE_BIN"):$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec "$NODE_BIN" "$DIR/native-launcher.js" "$@" 2>> "$LOG"
