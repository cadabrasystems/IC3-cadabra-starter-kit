#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

AUTO_CONFIRM=0
DEBUG=0
SYSTEM_ONLY=0

usage() {
  cat <<'EOF'
Usage: bash apps/guard/scripts/install-linux.sh [options]

Prepares a plain Linux machine for local Guard testing.
By default, it asks for confirmation before installing anything.

Options:
  --yes     Skip the confirmation prompt
  --debug   Run with set -x
  --system-only
            Install only base Linux packages needed to run Node/npm.
  --help    Show this help text
EOF
}

log() {
  printf '[guard-install] %s\n' "$*"
}

die() {
  printf '[guard-install] ERROR: %s\n' "$*" >&2
  exit 1
}

confirm() {
  if [[ "$AUTO_CONFIRM" -eq 1 ]]; then
    return
  fi

  printf '%s [y/N] ' "$1"
  read -r answer
  case "$answer" in
    y|Y|yes|YES)
      ;;
    *)
      die "Installation cancelled."
      ;;
  esac
}

require_linux() {
  local kernel
  kernel="$(uname -s)"
  if [[ "$kernel" != "Linux" ]]; then
    die "Guard local testing requires Linux. Detected platform: $kernel"
  fi
}

install_system_packages() {
  export DEBIAN_FRONTEND=noninteractive

  sudo apt-get update
  sudo apt-get install -y \
    curl \
    git \
    ca-certificates \
    build-essential \
    pkg-config \
    libssl-dev \
    xz-utils \
    nodejs \
    npm
}

install_foundry() {
  curl -fsSL https://foundry.paradigm.xyz | bash
  export PATH="$HOME/.foundry/bin:$PATH"
  "$HOME/.foundry/bin/foundryup"

  if ! grep -q '.foundry/bin' "$HOME/.bashrc"; then
    printf '\nexport PATH="$HOME/.foundry/bin:$PATH"\n' >>"$HOME/.bashrc"
  fi
}

install_guard_deps() {
  export PATH="$HOME/.foundry/bin:$PATH"
  npm --prefix "$GUARD_DIR/contracts" install
  npm --prefix "$GUARD_DIR/orchestrator" install
  npm --prefix "$GUARD_DIR/web" install
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes)
        AUTO_CONFIRM=1
        shift
        ;;
      --debug)
        DEBUG=1
        shift
        ;;
      --system-only)
        SYSTEM_ONLY=1
        shift
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        usage
        die "Unknown option: $1"
        ;;
    esac
  done

  if [[ "$DEBUG" -eq 1 ]]; then
    set -x
  fi

  require_linux
  command -v sudo >/dev/null 2>&1 || die "Missing required command: sudo"
  command -v apt-get >/dev/null 2>&1 || die "This installer currently supports apt-based Linux distributions only."

  local package_summary="curl git ca-certificates build-essential pkg-config libssl-dev xz-utils nodejs npm"
  local install_summary=()

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    install_summary+=("system packages: $package_summary")
  fi

  if [[ "$SYSTEM_ONLY" -eq 0 ]] && { ! command -v forge >/dev/null 2>&1 || ! command -v anvil >/dev/null 2>&1; }; then
    install_summary+=("Foundry (forge + anvil)")
  fi

  if [[ "$SYSTEM_ONLY" -eq 0 ]]; then
    install_summary+=("Guard npm dependencies")
  fi

  log "This installer will prepare the machine for Guard local testing."
  for item in "${install_summary[@]}"; do
    log "Will install: $item"
  done

  confirm "Continue?"

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    install_system_packages
  fi

  if [[ "$SYSTEM_ONLY" -eq 1 ]]; then
    log "Installed base tool versions:"
    node --version
    npm --version
    exit 0
  fi

  if ! command -v forge >/dev/null 2>&1 || ! command -v anvil >/dev/null 2>&1; then
    install_foundry
  fi

  install_guard_deps

  export PATH="$HOME/.foundry/bin:$PATH"
  log "Installed tool versions:"
  node --version
  npm --version
  forge --version
  anvil --version
}

main "$@"
