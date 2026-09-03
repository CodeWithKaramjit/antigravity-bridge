#!/bin/bash
# Install and start Antigravity Bridge as a persistent macOS LaunchAgent

PLIST_NAME="com.antigravity.bridge.plist"
SOURCE_PLIST="$(cd "$(dirname "$0")" && pwd)/$PLIST_NAME"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/$PLIST_NAME"

mkdir -p "$TARGET_DIR"

# Stop existing if loaded
launchctl unload "$TARGET_PLIST" 2>/dev/null || true

# Copy plist
cp "$SOURCE_PLIST" "$TARGET_PLIST"

# Load into launchd
launchctl load "$TARGET_PLIST"

echo "✓ Antigravity Bridge installed as background service!"
echo "Server will run on http://localhost:4000 silently in background."
echo "Logs available at: /tmp/antigravity-bridge.log"
