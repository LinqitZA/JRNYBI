#!/usr/bin/env bash
# ============================================================================
# JRNYBI - Development Environment Setup & Launcher
# ============================================================================
# This script initializes and starts the JRNYBI development environment.
# It is used by both humans and autonomous coding agents.
#
# Usage:
#   ./init.sh          # Full setup + start
#   ./init.sh --start  # Start only (skip dependency install)
#   ./init.sh --reset  # Reset database and restart
# ============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[JRNYBI]${NC} $*"; }
ok()    { echo -e "${GREEN}[JRNYBI]${NC} $*"; }
warn()  { echo -e "${YELLOW}[JRNYBI]${NC} $*"; }
err()   { echo -e "${RED}[JRNYBI]${NC} $*" >&2; }

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
check_prerequisites() {
  info "Checking prerequisites..."

  local missing=0

  if ! command -v docker &>/dev/null; then
    err "Docker is not installed. Please install Docker: https://docs.docker.com/get-docker/"
    missing=1
  fi

  if ! docker compose version &>/dev/null 2>&1; then
    if ! command -v docker-compose &>/dev/null; then
      err "Docker Compose is not available. Please install Docker Compose."
      missing=1
    fi
  fi

  if [ "$missing" -eq 1 ]; then
    err "Missing prerequisites. Please install the above and try again."
    exit 1
  fi

  ok "Prerequisites satisfied."
}

# ---------------------------------------------------------------------------
# Environment file setup
# ---------------------------------------------------------------------------
setup_env() {
  if [ ! -f .env ]; then
    info "Creating .env file with secure random secrets..."

    # Generate secrets using Python (available in most environments)
    local cookie_secret
    local secret_key
    cookie_secret=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64)
    secret_key=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64)

    cat > .env <<EOF
# JRNYBI Environment Configuration (auto-generated)
REDASH_COOKIE_SECRET=${cookie_secret}
REDASH_SECRET_KEY=${secret_key}

# JWT Authentication (JRNY Integration)
REDASH_JWT_LOGIN_ENABLED=true
REDASH_JWT_AUTH_ISSUER=jrny-erp
REDASH_JWT_AUTH_AUDIENCE=jrnybi
REDASH_JWT_AUTH_PUBLIC_CERTS_URL=http://jrny-api:4000/api/v1/auth/.well-known/jwks.json
REDASH_JWT_AUTH_COOKIE_NAME=jrny_session
REDASH_JWT_AUTH_ALGORITHMS=RS256
REDASH_PASSWORD_LOGIN_ENABLED=false

# Embedding
JRNYBI_ALLOWED_FRAME_ANCESTOR=https://app.jrny.co.za
REDASH_CORS_ACCESS_CONTROL_ALLOW_ORIGIN=https://app.jrny.co.za
EOF
    ok ".env file created."
  else
    ok ".env file already exists."
  fi
}

# ---------------------------------------------------------------------------
# Docker services
# ---------------------------------------------------------------------------
start_services() {
  info "Starting Docker services (PostgreSQL, Redis)..."
  docker compose up -d redis postgres --remove-orphans

  info "Waiting for PostgreSQL to be ready..."
  local retries=30
  while [ $retries -gt 0 ]; do
    if docker compose exec -T postgres pg_isready -U postgres &>/dev/null; then
      break
    fi
    retries=$((retries - 1))
    sleep 1
  done

  if [ $retries -eq 0 ]; then
    err "PostgreSQL failed to start within 30 seconds."
    exit 1
  fi
  ok "PostgreSQL is ready."
}

# ---------------------------------------------------------------------------
# Database initialization
# ---------------------------------------------------------------------------
init_database() {
  info "Checking if database needs initialization..."

  # Check if the organizations table exists (indicates DB is already initialized)
  local db_exists
  db_exists=$(docker compose exec -T -u postgres postgres psql postgres --csv \
    -1tqc "SELECT table_name FROM information_schema.tables WHERE table_name = 'organizations'" 2>/dev/null || echo "")

  if echo "$db_exists" | grep -q "organizations"; then
    ok "Database already initialized."
  else
    info "Creating database tables..."
    docker compose run --rm server create_db
    ok "Database tables created."
  fi

  # Seed JRNY read-replica data source (idempotent — skips if already exists)
  info "Ensuring JRNY read-replica data source exists..."
  docker compose run --rm server manage ds seed_jrny || warn "Data source seeding skipped (server may not be ready yet)."
}

# ---------------------------------------------------------------------------
# Build and start application
# ---------------------------------------------------------------------------
start_app() {
  info "Building and starting JRNYBI application..."
  COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker compose up -d --build --remove-orphans

  info "Waiting for JRNYBI server to be ready..."
  local retries=60
  local port=5001
  while [ $retries -gt 0 ]; do
    if curl -sf "http://localhost:${port}/ping" &>/dev/null; then
      break
    fi
    retries=$((retries - 1))
    sleep 2
  done

  if [ $retries -eq 0 ]; then
    warn "Server may still be starting. Check logs with: docker compose logs -f server"
  else
    ok "JRNYBI server is running!"
  fi
}

# ---------------------------------------------------------------------------
# Reset (optional)
# ---------------------------------------------------------------------------
reset_database() {
  warn "Resetting database..."
  docker compose down -v
  start_services
  info "Re-creating database..."
  docker compose run --rm server create_db
  ok "Database reset complete."
}

# ---------------------------------------------------------------------------
# Print summary
# ---------------------------------------------------------------------------
print_summary() {
  echo ""
  echo -e "${GREEN}============================================================${NC}"
  echo -e "${GREEN}  JRNYBI Development Environment${NC}"
  echo -e "${GREEN}============================================================${NC}"
  echo ""
  echo -e "  ${BLUE}Application:${NC}  http://localhost:5001"
  echo -e "  ${BLUE}API:${NC}          http://localhost:5001/api/"
  echo -e "  ${BLUE}Health:${NC}       http://localhost:5001/ping"
  echo -e "  ${BLUE}PostgreSQL:${NC}   localhost:15432 (user: postgres)"
  echo -e "  ${BLUE}Email UI:${NC}     http://localhost:1080"
  echo ""
  echo -e "  ${YELLOW}Useful commands:${NC}"
  echo -e "    docker compose logs -f server    # Stream server logs"
  echo -e "    docker compose logs -f worker    # Stream worker logs"
  echo -e "    docker compose exec server bash  # Shell into server"
  echo -e "    docker compose down              # Stop all services"
  echo -e "    ./init.sh --reset                # Reset database"
  echo ""
  echo -e "${GREEN}============================================================${NC}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  local mode="${1:-full}"

  echo ""
  info "JRNYBI Development Environment Setup"
  echo ""

  case "$mode" in
    --start)
      check_prerequisites
      start_services
      start_app
      print_summary
      ;;
    --reset)
      check_prerequisites
      setup_env
      reset_database
      start_app
      print_summary
      ;;
    *)
      check_prerequisites
      setup_env
      start_services
      init_database
      start_app
      print_summary
      ;;
  esac
}

main "$@"
