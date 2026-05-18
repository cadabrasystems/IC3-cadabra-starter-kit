#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
GUARD_DIR="$REPO_ROOT/apps/guard"

VM_NAME="guard-test"
VM_IMAGE="24.04"
VM_CPUS="2"
VM_MEMORY="4G"
VM_DISK="20G"
VM_WORKDIR="/workspace/cadabra_apps"
BASE_SNAPSHOT_NAME="node-base"
PHASE="full"
DEBUG=0
KEEP=0
REUSE=0
SHELL_ON_FAIL=0
INSTALL_DEBUG_FLAG=""

TMP_DIR=""
STARTED_DEV=0
STARTED_VM=0

usage() {
  cat <<'EOF'
Usage: bash apps/guard/scripts/multipass-acceptance.sh [options]

Launches a clean Ubuntu VM with Multipass, mounts this repo, bootstraps the
guard app dependencies, runs tests, and optionally performs a dev-stack smoke test.

Options:
  --name <vm-name>          VM name (default: guard-test)
  --image <ubuntu-image>    Multipass image (default: 24.04)
  --cpus <count>            VM CPU count (default: 2)
  --memory <size>           VM memory size (default: 4G)
  --disk <size>             VM disk size (default: 20G)
  --phase <name>            bootstrap | test | dev-smoke | full (default: full)
  --base-snapshot <name>    Cached VM snapshot after system package install (default: node-base)
  --debug                   Run remote scripts with set -x and verbose logs
  --keep                    Keep the VM after success/failure
  --reuse                   Reuse an existing VM instead of recreating it
  --shell-on-fail           Print a ready-to-run shell command if something fails
  --help                    Show this help text

Examples:
  bash apps/guard/scripts/multipass-acceptance.sh --debug --keep
  bash apps/guard/scripts/multipass-acceptance.sh --phase bootstrap --debug --keep
  bash apps/guard/scripts/multipass-acceptance.sh --name guard-clean --phase full
EOF
}

log() {
  printf '[guard-multipass] %s\n' "$*"
}

die() {
  printf '[guard-multipass] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR"
  fi

  if [[ "$KEEP" -eq 0 && "$STARTED_VM" -eq 1 ]]; then
    if snapshot_exists; then
      log "Stopping VM $VM_NAME and preserving cached snapshot $BASE_SNAPSHOT_NAME"
      multipass stop "$VM_NAME" >/dev/null 2>&1 || true
    else
      log "Deleting VM $VM_NAME"
      multipass delete "$VM_NAME" >/dev/null 2>&1 || true
      multipass purge >/dev/null 2>&1 || true
    fi
  fi
}

on_error() {
  local line="$1"
  log "Failure at line $line"
  if [[ "$SHELL_ON_FAIL" -eq 1 ]]; then
    log "Debug shell: multipass shell $VM_NAME"
  fi
}

trap 'on_error $LINENO' ERR
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required host command: $1"
}

create_tmp_dir() {
  local base_dir="$GUARD_DIR/.tmp"
  mkdir -p "$base_dir"
  mktemp -d "$base_dir/multipass-acceptance.XXXXXX"
}

vm_exists() {
  multipass info "$VM_NAME" >/dev/null 2>&1
}

snapshot_exists() {
  multipass info "$VM_NAME.$BASE_SNAPSHOT_NAME" >/dev/null 2>&1
}

ensure_mount() {
  if multipass exec "$VM_NAME" -- test -d "$VM_WORKDIR/apps/guard" >/dev/null 2>&1; then
    return
  fi

  log "Mounting repo into VM"
  multipass mount "$REPO_ROOT" "$VM_NAME:$VM_WORKDIR"
}

run_vm() {
  local label="$1"
  local local_script="$2"
  local remote_script="/home/ubuntu/$(basename "$local_script")"

  log "Running $label inside $VM_NAME"
  multipass transfer "$local_script" "$VM_NAME:$remote_script" >/dev/null
  multipass exec "$VM_NAME" -- bash "$remote_script"
}

write_remote_script() {
  local path="$1"
  local body="$2"

  cat >"$path" <<EOF
#!/usr/bin/env bash
set -euo pipefail
$( [[ "$DEBUG" -eq 1 ]] && printf 'set -x\n' )

REPO_DIR="$VM_WORKDIR"
GUARD_DIR="\$REPO_DIR/apps/guard"

$body
EOF
  chmod +x "$path"
}

launch_vm() {
  if vm_exists; then
    if [[ "$REUSE" -eq 1 ]]; then
      log "Reusing existing VM $VM_NAME"
      ensure_mount
      return
    fi

    if snapshot_exists; then
      log "Restoring VM $VM_NAME from cached snapshot $BASE_SNAPSHOT_NAME"
      multipass stop "$VM_NAME" >/dev/null 2>&1 || true
      multipass restore --destructive "$VM_NAME.$BASE_SNAPSHOT_NAME"
      multipass start "$VM_NAME"
      STARTED_VM=1
      ensure_mount
      return
    fi

    log "Deleting existing VM $VM_NAME before fresh run"
    multipass delete "$VM_NAME"
    multipass purge
  fi

  log "Launching Ubuntu VM $VM_NAME ($VM_IMAGE)"
  multipass launch "$VM_IMAGE" \
    --name "$VM_NAME" \
    --cpus "$VM_CPUS" \
    --memory "$VM_MEMORY" \
    --disk "$VM_DISK"
  STARTED_VM=1
}

create_base_snapshot() {
  local script_path="$TMP_DIR/base-system.sh"

  if snapshot_exists; then
    ensure_mount
    return
  fi

  ensure_mount

  write_remote_script "$script_path" "
bash \"\$GUARD_DIR/scripts/install-linux.sh\" --yes --system-only $INSTALL_DEBUG_FLAG
"

  run_vm "base system bootstrap" "$script_path"

  log "Creating cached snapshot $BASE_SNAPSHOT_NAME"
  multipass stop "$VM_NAME"
  multipass snapshot "$VM_NAME" --name "$BASE_SNAPSHOT_NAME"
  multipass start "$VM_NAME"
  ensure_mount
}

bootstrap_vm() {
  local script_path="$TMP_DIR/bootstrap.sh"

  write_remote_script "$script_path" "
bash \"\$GUARD_DIR/scripts/install-linux.sh\" --yes $INSTALL_DEBUG_FLAG
"

  run_vm "bootstrap" "$script_path"
}

test_vm() {
  local script_path="$TMP_DIR/test.sh"

  write_remote_script "$script_path" '
export PATH="$HOME/.foundry/bin:$PATH"
npm --prefix "$GUARD_DIR" test
'

  run_vm "test" "$script_path"
}

dev_smoke_vm() {
  local script_path="$TMP_DIR/dev-smoke.sh"

  write_remote_script "$script_path" '
export PATH="$HOME/.foundry/bin:$PATH"
LOG_DIR="/tmp/guard-dev"
mkdir -p "$LOG_DIR"

cd "$GUARD_DIR"
bash scripts/dev.sh >"$LOG_DIR/dev.log" 2>&1 &
DEV_PID=$!

cleanup() {
  if kill -0 "$DEV_PID" >/dev/null 2>&1; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
    wait "$DEV_PID" || true
  fi
}

trap cleanup EXIT

for _ in {1..90}; do
  if curl -fsS -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_chainId\",\"params\":[],\"id\":1}" \
    http://127.0.0.1:8545 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for _ in {1..90}; do
  if curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for _ in {1..90}; do
  if curl -fsS http://127.0.0.1:5173 >/tmp/guard-web.html 2>/dev/null; then
    break
  fi
  sleep 1
done

grep -q "Cadabra Guard" /tmp/guard-web.html
printf "Smoke test passed. Logs are in %s\n" "$LOG_DIR"
'

  run_vm "dev smoke" "$script_path"
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name)
        VM_NAME="$2"
        shift 2
        ;;
      --image)
        VM_IMAGE="$2"
        shift 2
        ;;
      --cpus)
        VM_CPUS="$2"
        shift 2
        ;;
      --memory)
        VM_MEMORY="$2"
        shift 2
        ;;
      --disk)
        VM_DISK="$2"
        shift 2
        ;;
      --phase)
        PHASE="$2"
        shift 2
        ;;
      --base-snapshot)
        BASE_SNAPSHOT_NAME="$2"
        shift 2
        ;;
      --debug)
        DEBUG=1
        INSTALL_DEBUG_FLAG="--debug"
        shift
        ;;
      --keep)
        KEEP=1
        shift
        ;;
      --reuse)
        REUSE=1
        shift
        ;;
      --shell-on-fail)
        SHELL_ON_FAIL=1
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

  case "$PHASE" in
    bootstrap|test|dev-smoke|full)
      ;;
    *)
      die "Invalid phase: $PHASE"
      ;;
  esac

  require_command multipass
  require_command bash

  TMP_DIR="$(create_tmp_dir)"

  launch_vm
  create_base_snapshot

  if [[ "$PHASE" == "bootstrap" || "$PHASE" == "full" || "$PHASE" == "test" || "$PHASE" == "dev-smoke" ]]; then
    bootstrap_vm
  fi

  if [[ "$PHASE" == "test" || "$PHASE" == "full" ]]; then
    test_vm
  fi

  if [[ "$PHASE" == "dev-smoke" || "$PHASE" == "full" ]]; then
    dev_smoke_vm
  fi

  log "Completed phase: $PHASE"
  if [[ "$KEEP" -eq 1 ]]; then
    log "VM kept for inspection: multipass shell $VM_NAME"
  fi
}

main "$@"
