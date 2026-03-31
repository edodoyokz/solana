#!/usr/bin/env bash
set -euo pipefail

APP_NAME="memescout-backend"
APP_DIR="/opt/memescout"
BRANCH="main"
BACKEND_PORT="3001"
USE_ECOSYSTEM="${USE_ECOSYSTEM:-1}"

log() {
  printf "\n[redeploy] %s\n" "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

ensure_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    echo "Please run this script as root (sudo)." >&2
    exit 1
  fi
}

ensure_repo() {
  if [ ! -d "${APP_DIR}/.git" ]; then
    echo "Repo not found at ${APP_DIR}. Run full deploy first." >&2
    exit 1
  fi
}

update_repo() {
  log "Updating repo"
  local old_head new_head
  old_head="$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || true)"
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  new_head="$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || true)"
  echo "Old: ${old_head}"
  echo "New: ${new_head}"
}

install_dependencies() {
  log "Installing npm dependencies"
  cd "$APP_DIR"
  npm install
}

restart_backend() {
  log "Restarting backend"
  cd "$APP_DIR"
  if [ "$USE_ECOSYSTEM" = "1" ] && [ -f "$APP_DIR/ecosystem.config.cjs" ]; then
    pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --env production
  else
    if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
      pm2 restart "$APP_NAME" --update-env
    else
      pm2 start "npx tsx backend/server.ts" --name "$APP_NAME" --cwd "$APP_DIR"
    fi
  fi
  pm2 save
}

health_check() {
  log "Checking backend health"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
      echo "Backend healthy on port ${BACKEND_PORT}"
      return 0
    fi
    sleep 1
  done
  echo "Backend health check failed" >&2
  pm2 logs "$APP_NAME" --lines 100 || true
  exit 1
}

main() {
  ensure_root
  require_cmd git
  require_cmd npm
  require_cmd curl
  require_cmd pm2
  ensure_repo
  update_repo
  install_dependencies
  restart_backend
  health_check
}

main "$@"
