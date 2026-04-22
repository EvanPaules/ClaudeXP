#!/usr/bin/env bash
# ClaudeXP installer (macOS / Linux)
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/EvanPaules/ClaudeXP/main/install.sh | bash

set -e

if [ -n "$CLAUDEXP_REPO" ]; then
  SOURCE="github:$CLAUDEXP_REPO"
  echo
  echo "⚡  Installing ClaudeXP from $SOURCE"
else
  SOURCE="claudexp"
  echo
  echo "⚡  Installing ClaudeXP from npm"
fi
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required. Install from https://nodejs.org and re-run."
  exit 1
fi

NODE_VER=$(node --version | sed 's/v//')
NODE_MAJOR=${NODE_VER%%.*}
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node $NODE_VER found — ClaudeXP needs 18+. Upgrade: https://nodejs.org"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found (should come bundled with Node.js)."
  exit 1
fi

npm install -g "$SOURCE"

echo
echo "✓  ClaudeXP installed. Running setup..."
echo

# When piped (curl ... | bash), our stdin is the bash pipe, not a TTY.
# Re-attach the user's terminal so `claudexp setup` can prompt; if no TTY
# is reachable, setup falls back to non-interactive mode and derives a
# username from $USER.
if [ -r /dev/tty ]; then
  claudexp setup </dev/tty
else
  claudexp setup
fi
