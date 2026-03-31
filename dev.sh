#!/usr/bin/env bash
# ── MemeScout Dev Runner ──
# Starts both backend (port 3001) and frontend (port 3000) concurrently.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$PROJECT_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

# Cleanup on exit
cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null && echo "  Backend stopped"
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null && echo "  Frontend stopped"
  rm -rf "$LOG_DIR" 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         MemeScout — Dev Runner              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required but not found."
  exit 1
fi

# Install deps if needed
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo -e "${YELLOW}Installing dependencies...${NC}"
  npm install --prefix "$PROJECT_DIR"
  echo ""
fi

# ── Start Backend ──
echo -e "${GREEN}Starting backend on http://localhost:3001 ...${NC}"
(cd "$PROJECT_DIR/backend" && npx tsx watch "$PROJECT_DIR/backend/server.ts" > "$LOG_DIR/backend.log" 2>&1) &
BACKEND_PID=$!
echo "  PID: $BACKEND_PID"

# Wait for backend to be ready
echo -n "  Waiting for backend"
for i in $(seq 1 15); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    echo " ready!"
    break
  fi
  sleep 0.5
  echo -n "."
  if [ "$i" -eq 15 ]; then
    echo ""
    echo -e "${YELLOW}  Backend not responding after 7.5s — check logs: $LOG_DIR/backend.log${NC}"
  fi
done

# ── Start Frontend ──
echo -e "${GREEN}Starting frontend on http://localhost:3000 ...${NC}"
npx --prefix "$PROJECT_DIR" vite --config "$PROJECT_DIR/vite.config.ts" > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "  PID: $FRONTEND_PID"

# Wait briefly for frontend
sleep 2
echo ""

echo -e "${CYAN}┌─────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│  Frontend: http://localhost:3000            │${NC}"
echo -e "${CYAN}│  Backend:  http://localhost:3001            │${NC}"
echo -e "${CYAN}│  Health:   http://localhost:3001/health     │${NC}"
echo -e "${CYAN}│                                             │${NC}"
echo -e "${CYAN}│  Press Ctrl+C to stop both servers          │${NC}"
echo -e "${CYAN}└─────────────────────────────────────────────┘${NC}"
echo ""
echo -e "Logs: ${YELLOW}$LOG_DIR/${NC}"
echo ""

# Stream logs
tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" 2>/dev/null &
TAIL_PID=$!

wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
kill "$TAIL_PID" 2>/dev/null
