#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
node bin/native-launcher.js stop
osascript -e 'display notification "Antigravity Bridge has been stopped." with title "Antigravity Bridge"'
echo "Antigravity Bridge server stopped."
sleep 1
