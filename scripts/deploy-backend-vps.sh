#!/usr/bin/env bash
set -euo pipefail

APP_NAME="memescout-backend"
REPO_URL="https://github.com/edodoyokz/solana.git"
BRANCH="main"
APP_DIR="/opt/memescout"
BACKEND_PORT="3001"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}.conf"
ENV_FILE="${APP_DIR}/backend/.env"
ENV_TEMPLATE="${APP_DIR}/backend/.env.example"

PUBLIC_API_DOMAIN="${PUBLIC_API_DOMAIN:-}"
ENABLE_SSL="${ENABLE_SSL:-0}"
EMAIL_SSL="${EMAIL_SSL:-}"
PREVIOUS_HEAD=""
CURRENT_HEAD=""

log() {
  printf "\n[deploy] %s\n" "$1"
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

install_base_packages() {
  log "Installing base packages"
  apt-get update
  apt-get install -y curl git nginx ca-certificates

  if ! command -v node >/dev/null 2>&1; then
    log "Installing Node.js 20"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    log "Installing PM2"
    npm install -g pm2
  fi

  if [ "$ENABLE_SSL" = "1" ] && ! command -v certbot >/dev/null 2>&1; then
    log "Installing Certbot"
    apt-get install -y certbot python3-certbot-nginx
  fi
}

prepare_app_dir() {
  log "Preparing app directory at ${APP_DIR}"
  mkdir -p "$(dirname "$APP_DIR")"

  if [ -d "${APP_DIR}/.git" ]; then
    log "Updating existing repo"
    PREVIOUS_HEAD="$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || true)"
    git -C "$APP_DIR" fetch origin
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
    CURRENT_HEAD="$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || true)"
  else
    if [ -d "$APP_DIR" ]; then
      log "Removing non-git directory at ${APP_DIR}"
      rm -rf "$APP_DIR"
    fi
    log "Cloning repo"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
    CURRENT_HEAD="$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || true)"
  fi
}

install_dependencies() {
  log "Installing npm dependencies"
  cd "$APP_DIR"
  npm install
}

prepare_env() {
  log "Preparing backend env file"
  mkdir -p "$(dirname "$ENV_FILE")"

  if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_TEMPLATE" ]; then
      cp "$ENV_TEMPLATE" "$ENV_FILE"
    else
      cat > "$ENV_FILE" <<'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-me
ENCRYPTION_KEY=replace-me-with-a-long-random-secret
EOF
    fi
    echo "Created ${ENV_FILE}. Fill in real secrets before using production traffic."
  else
    echo "Existing ${ENV_FILE} found. Keeping it unchanged."
  fi
}

validate_env() {
  log "Checking if backend env placeholders are still present"
  if grep -Eq 'your-project|replace-me|your-service-role-key-here|your-32-char-encryption-key-here' "$ENV_FILE"; then
    echo "Env file still contains placeholder values: $ENV_FILE" >&2
    echo "Edit that file first, then rerun this script." >&2
    exit 1
  fi
}

start_pm2() {
  log "Starting backend with PM2"
  cd "$APP_DIR"

  if [ -f "$APP_DIR/ecosystem.config.cjs" ]; then
    pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --env production
  elif pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start "npx tsx backend/server.ts" --name "$APP_NAME" --cwd "$APP_DIR"
  fi

  pm2 save
}

wait_for_backend() {
  log "Waiting for backend health check"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null 2>&1; then
      echo "Backend is healthy on port ${BACKEND_PORT}"
      return 0
    fi
    sleep 1
  done

  echo "Backend failed health check on port ${BACKEND_PORT}" >&2
  pm2 logs "$APP_NAME" --lines 100 || true
  exit 1
}

write_nginx_config() {
  if [ -z "$PUBLIC_API_DOMAIN" ]; then
    log "Skipping Nginx config because PUBLIC_API_DOMAIN is empty"
    echo "Set PUBLIC_API_DOMAIN=api.yourdomain.com to auto-configure Nginx."
    return 0
  fi

  log "Writing Nginx config for ${PUBLIC_API_DOMAIN}"
  cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    server_name ${PUBLIC_API_DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

  ln -sf "$NGINX_SITE" "$NGINX_ENABLED"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
}

configure_ssl() {
  if [ "$ENABLE_SSL" != "1" ]; then
    return 0
  fi

  if [ -z "$PUBLIC_API_DOMAIN" ]; then
    echo "ENABLE_SSL=1 requires PUBLIC_API_DOMAIN to be set." >&2
    exit 1
  fi

  if [ -z "$EMAIL_SSL" ]; then
    echo "ENABLE_SSL=1 requires EMAIL_SSL to be set." >&2
    exit 1
  fi

  log "Configuring HTTPS with Certbot"
  certbot --nginx --non-interactive --agree-tos -m "$EMAIL_SSL" -d "$PUBLIC_API_DOMAIN" --redirect
}

print_next_steps() {
  log "Deploy completed"
  echo "Repo:        ${APP_DIR}"
  echo "PM2 app:     ${APP_NAME}"
  echo "Backend URL: http://127.0.0.1:${BACKEND_PORT}"
  echo "Env file:    ${ENV_FILE}"
  echo "Git branch:  ${BRANCH}"
  if [ -n "$CURRENT_HEAD" ]; then
    echo "Git commit:  ${CURRENT_HEAD}"
  fi
  if [ -n "$PREVIOUS_HEAD" ] && [ "$PREVIOUS_HEAD" != "$CURRENT_HEAD" ]; then
    echo "Updated:     ${PREVIOUS_HEAD} -> ${CURRENT_HEAD}"
  elif [ -n "$PREVIOUS_HEAD" ]; then
    echo "Updated:     no code change"
  fi
  echo
  echo "Useful commands:"
  echo "  pm2 status"
  echo "  pm2 logs ${APP_NAME}"
  echo "  curl http://127.0.0.1:${BACKEND_PORT}/health"
  if [ -n "$PUBLIC_API_DOMAIN" ]; then
    if [ "$ENABLE_SSL" = "1" ]; then
      echo "  curl https://${PUBLIC_API_DOMAIN}/health"
    else
      echo "  curl http://${PUBLIC_API_DOMAIN}/health"
      echo
      echo "Optional HTTPS step:"
      echo "  sudo ENABLE_SSL=1 EMAIL_SSL=you@example.com PUBLIC_API_DOMAIN=${PUBLIC_API_DOMAIN} bash /tmp/deploy-backend-vps.sh"
    fi
  fi
}

main() {
  ensure_root
  require_cmd curl
  install_base_packages
  prepare_app_dir
  install_dependencies
  prepare_env
  validate_env
  start_pm2
  wait_for_backend
  write_nginx_config
  configure_ssl
  print_next_steps
}

main "$@"
