#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Stop bridge using universal multi-manager launcher (NVM, FNM, Volta, ASDF, Mise, Homebrew)
"$DIR/bin/native-launcher.sh" stop
osascript -e 'display notification "Antigravity Bridge has been stopped." with title "Antigravity Bridge"'
echo "Antigravity Bridge server stopped."
sleep 1
