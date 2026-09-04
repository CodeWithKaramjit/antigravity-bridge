#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Launch bridge using universal multi-manager launcher (NVM, FNM, Volta, ASDF, Mise, Homebrew)
"$DIR/bin/native-launcher.sh" start
osascript -e 'display notification "Antigravity Bridge is now running on port 4000." with title "Antigravity Bridge" subtitle "Ready to inspect"'
echo "Antigravity Bridge is running on http://localhost:4000"
echo "You can close this terminal window anytime."
sleep 1
