#!/bin/bash
# Uninstall Antigravity Bridge macOS LaunchAgent

PLIST_NAME="com.antigravity.bridge.plist"
TARGET_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME"

if [ -f "$TARGET_PLIST" ]; then
  launchctl unload "$TARGET_PLIST" 2>/dev/null || true
  rm -f "$TARGET_PLIST"
  echo "✓ Antigravity Bridge background service uninstalled."
else
  echo "Service was not installed in $TARGET_PLIST"
fi
