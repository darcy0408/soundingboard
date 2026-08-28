#!/usr/bin/env bash
# Midnight toolchain environment for WSL Ubuntu.
# Source this before any compact/node command:  source ~/mnenv.sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
# Put our toolchain ahead of the Windows interop PATH so npm/node resolve to WSL builds.
export PATH="$HOME/.local/bin:$HOME/.compact/bin:$PATH"
