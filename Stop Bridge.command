#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Source NVM/FNM if available (bare 'node' may not be in PATH when double-clicked from Finder)
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh" 2>/dev/null
elif [ -s "$HOME/.fnm/fnm" ]; then
  eval "$("$HOME/.fnm/fnm" env)" 2>/dev/null
fi

node bin/native-launcher.js stop
osascript -e 'display notification "Antigravity Bridge has been stopped." with title "Antigravity Bridge"'
echo "Antigravity Bridge server stopped."
sleep 1
