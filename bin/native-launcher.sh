#!/bin/bash

# Resolve Node.js binary path even in clean macOS GUI environments
# Supports: NVM, FNM, Volta, ASDF, Mise, Homebrew (AS + Intel), System
NODE_BIN=""

if [ -n "$HOME" ]; then
  # 1. Check NVM versions (newest first)
  if [ -z "$NODE_BIN" ] && [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NVM=$(ls -d "$HOME/.nvm/versions/node"/* 2>/dev/null | tail -n 1)
    if [ -x "$LATEST_NVM/bin/node" ]; then
      NODE_BIN="$LATEST_NVM/bin/node"
    fi
  fi

  # 2. Check FNM versions (newest first)
  if [ -z "$NODE_BIN" ] && [ -d "$HOME/.fnm/node-versions" ]; then
    LATEST_FNM=$(ls -d "$HOME/.fnm/node-versions"/*/installation 2>/dev/null | tail -n 1)
    if [ -n "$LATEST_FNM" ] && [ -x "$LATEST_FNM/bin/node" ]; then
      NODE_BIN="$LATEST_FNM/bin/node"
    fi
  fi

  # 3. Check Volta
  if [ -z "$NODE_BIN" ] && [ -x "$HOME/.volta/bin/node" ]; then
    NODE_BIN="$HOME/.volta/bin/node"
  fi

  # 4. Check ASDF versions (newest first)
  if [ -z "$NODE_BIN" ] && [ -d "$HOME/.asdf/installs/nodejs" ]; then
    LATEST_ASDF=$(ls -d "$HOME/.asdf/installs/nodejs"/* 2>/dev/null | tail -n 1)
    if [ -n "$LATEST_ASDF" ] && [ -x "$LATEST_ASDF/bin/node" ]; then
      NODE_BIN="$LATEST_ASDF/bin/node"
    fi
  fi

  # 5. Check Mise (formerly rtx) versions (newest first)
  if [ -z "$NODE_BIN" ] && [ -d "$HOME/.local/share/mise/installs/node" ]; then
    LATEST_MISE=$(ls -d "$HOME/.local/share/mise/installs/node"/* 2>/dev/null | tail -n 1)
    if [ -n "$LATEST_MISE" ] && [ -x "$LATEST_MISE/bin/node" ]; then
      NODE_BIN="$LATEST_MISE/bin/node"
    fi
  fi
fi

# 6. Check Homebrew (Apple Silicon & Intel)
if [ -z "$NODE_BIN" ] && [ -x "/opt/homebrew/bin/node" ]; then
  NODE_BIN="/opt/homebrew/bin/node"
fi
if [ -z "$NODE_BIN" ] && [ -x "/usr/local/bin/node" ]; then
  NODE_BIN="/usr/local/bin/node"
fi

# 7. Fallback to command -v node
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node 2>/dev/null)"
fi

LOG="/tmp/antigravity-native-host.log"
echo "--- [SH] $(date) ---" >> "$LOG"
echo "Args: $@" >> "$LOG"
echo "Resolved NODE_BIN: $NODE_BIN" >> "$LOG"

# Guard: exit with error if no Node.js found anywhere
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found. Install Node.js via NVM, FNM, Volta, ASDF, Mise, or Homebrew." >> "$LOG"
  exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$(dirname "$NODE_BIN"):$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec "$NODE_BIN" "$DIR/native-launcher.js" "$@" 2>> "$LOG"
