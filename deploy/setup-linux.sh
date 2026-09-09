#!/usr/bin/env bash
#=============================================================================
#  TracingLight - Linux deployment (physical machine + pm2)
#
#  Usage:
#    sudo ./deploy/setup-linux.sh                # first-time install (idempotent)
#    sudo ./deploy/setup-linux.sh deploy          # incremental update: pull + build + reload
#
#  After install, the app runs under pm2 as service "tracinglight",
#  reachable at http://<server-ip>:5000
#=============================================================================
set -euo pipefail

PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PORT="${PORT:-5000}"
NODE_MAJOR="${NODE_MAJOR:-20}"
APP_USER="${APP_USER:-tracinglight}"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/public/uploads" "$PROJECT_DIR/data"

# ----------------------------------------------------------------------------
# 1. System deps (better-sqlite3 may compile from source; pm2 runs as a service)
# ----------------------------------------------------------------------------
install_sys_deps() {
  log "Installing system dependencies (git curl build tools)..."
  if command_exists apt-get; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y >/dev/null
    apt-get install -y --no-install-recommends git curl ca-certificates \
      build-essential python3 make g++ >/dev/null
  elif command_exists yum; then
    yum install -y git curl gcc gcc-c++ make python3 >/dev/null
  else
    log "WARN: unknown package manager; install Node 20+ and build tools manually."
  fi
}

# ----------------------------------------------------------------------------
# 2. Node.js (via nvm) + pnpm (via corepack)
# ----------------------------------------------------------------------------
ensure_node() {
  if command_exists node; then
    NODE_VER=$(node -v)
    log "Node.js found: $NODE_VER (already installed)"
    return
  fi
  log "Installing Node.js v$NODE_MAJOR via nvm..."
  if [ ! -s "$HOME/.nvm/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck source=/dev/null
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install "$NODE_MAJOR" >/dev/null
  nvm alias default "$NODE_MAJOR" >/dev/null
  log "Node.js v$NODE_MAJOR installed."
}

ensure_pnpm() {
  if command_exists pnpm; then return; fi
  log "Enabling pnpm via corepack..."
  corepack enable
  corepack prepare pnpm@9.0.0 --activate
}

# ----------------------------------------------------------------------------
# 3. Install JS deps & build
# ----------------------------------------------------------------------------
install_app() {
  log "Installing JS dependencies (pnpm install)..."
  ( cd "$PROJECT_DIR" && pnpm install --frozen-lockfile )
  log "Building production bundle (next build)..."
  ( cd "$PROJECT_DIR" && pnpm build )
}

# ----------------------------------------------------------------------------
# 4. .env (only if missing) with a random JWT secret
# ----------------------------------------------------------------------------
ensure_env() {
  if [ -f "$PROJECT_DIR/.env" ]; then
    log ".env already exists, keeping it."
    return
  fi
  log "Generating .env with random JWT secret..."
  node -e '
    const fs=require("fs"),c=require("crypto");
    const s=c.randomBytes(32).toString("hex");
    const env=[
      "# TracingLight environment","",
      "# ZHIPU AI (https://open.bigmodel.cn)",
      "ZHIPU_API_KEY=your_zhipu_api_key_here",
      "ZHIPU_MODEL=glm-4-flash",
      "", "# JWT Auth", "JWT_SECRET="+s, "",
      "# Database","DATABASE_PATH=./data/tracinglight.db", "",
      "# Server","NODE_ENV=production","PORT="+'"$PORT"',""
    ].join("\n")+"\n";
    fs.writeFileSync(process.cwd()+"/.env",env);
  '
}

# ----------------------------------------------------------------------------
# 5. Seed demo data only when DB is empty
# ----------------------------------------------------------------------------
seed() {
  if [ -f "$PROJECT_DIR/data/tracinglight.db" ]; then
    log "tracinglight.db exists, keeping existing data."
    return
  fi
  log "Seeding demo data (first run)..."
  ( cd "$PROJECT_DIR" && pnpm exec tsx src/storage/database/seed.ts )
}

# ----------------------------------------------------------------------------
# 6. pm2: install, start / reload the service
# ----------------------------------------------------------------------------
ensure_pm2() {
  if ! command_exists pm2; then
    log "Installing pm2 globally..."
    npm install -g pm2
  fi
}

pm2_start() {
  ensure_pm2
  mkdir -p "$PROJECT_DIR/logs"
  if pm2 describe tracinglight >/dev/null 2>&1; then
    log "Reloading running service 'tracinglight'..."
    ( cd "$PROJECT_DIR" && pm2 reload ecosystem.config.cjs --update-env )
  else
    log "Starting pm2 service 'tracinglight'..."
    ( cd "$PROJECT_DIR" && pm2 start ecosystem.config.cjs )
  fi
  pm2 save >/dev/null 2>&1 || true
  log "pm2 startup enabled (sudo only) - run: pm2 startup && pm2 save"
}

# ----------------------------------------------------------------------------
# dispatch
# ----------------------------------------------------------------------------
case "${1:-install}" in
  install)
    if [ "$(id -u)" -ne 0 ]; then err "run with sudo for first install:  sudo ./deploy/setup-linux.sh"; fi
    install_sys_deps
    ensure_node; ensure_pnpm; ensure_pm2   # pm2 needs a global npm to exist first sometimes
    install_app; ensure_env; seed; pm2_start
    log "DONE. App is running on http://<this-server-ip>:$PORT  (pm2 name: tracinglight)"
    ;;
  deploy)
    log "Pulling latest code..."
    ( cd "$PROJECT_DIR" && git pull --ff-only )
    install_app
    pm2_start
    log "DONE. Update deployed & service reloaded."
    ;;
  *)
    err "unknown subcommand: $1   (use: install | deploy)"
    ;;
esac