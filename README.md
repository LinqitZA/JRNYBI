# JRNYBI

**Embedded Business Intelligence & Reporting for JRNY ERP**

JRNYBI is a fork of [Redash](https://redash.io/) (v26.03.0), rebranded and customized as the embedded BI and reporting platform for JRNY ERP. It runs as an independent service with its own Docker image and CI/CD pipeline, deployed alongside JRNY via docker-compose and integrated via JWT SSO + iframe/proxy.

---

## Key Features

- **JWT SSO Authentication** - Seamless login via JRNY ERP tokens (RS256, JWKS validation)
- **Row-Level Security (RLS)** - PostgreSQL `SET LOCAL` session variables enforce org/branch/entity isolation
- **Pre-Built Reports** - Sales, finance, inventory, and procurement dashboards ready out of the box
- **Data Dictionary** - Interactive schema browser with search, copy-to-clipboard, and query shortcuts
- **JRNY Branding** - Custom theme (JRNY Blue #2563eb, Inter font, Slate header/body)
- **Iframe Embedding** - CSP, CORS, and cookie config for seamless embedding in JRNY ERP
- **Schema Auto-Complete** - Query editor prioritizes reporting schema views

---

## Technology Stack

| Layer       | Technology                                  |
|-------------|---------------------------------------------|
| Frontend    | React 16.14, Ant Design 4.4.3, Webpack 5   |
| Styling     | LESS with JRNY theme variables, Inter font  |
| Backend     | Python 3.13, Flask, SQLAlchemy              |
| Database    | PostgreSQL 18 (metadata), Redis 7 (queue)   |
| Data Source | PostgreSQL read-replica (JRNY ERP data, RLS)|
| Auth        | JWT RS256 via JWKS (PyJWT)                  |
| Build       | Docker, Poetry 2.1.4, pnpm 10.30.3         |

---

## Quick Start (Development)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2
- Git

### Setup

```bash
# Clone the repository
git clone <repo-url> jrnybi
cd jrnybi

# Make init script executable and run
chmod +x init.sh
./init.sh
```

The `init.sh` script will:
1. Check prerequisites (Docker, Compose)
2. Generate `.env` with secure random secrets
3. Start PostgreSQL and Redis containers
4. Initialize the database schema (Alembic migrations)
5. Build and start the JRNYBI application

### Access Points

| Service      | URL                           |
|--------------|-------------------------------|
| Application  | http://localhost:5001         |
| API          | http://localhost:5001/api/    |
| Health Check | http://localhost:5001/ping    |
| PostgreSQL   | localhost:15432 (user: postgres) |
| Email UI     | http://localhost:1080         |

### Common Commands

```bash
# View server logs
docker compose logs -f server

# Shell into the server container
docker compose exec server bash

# Run database migrations
docker compose run --rm server manage database create_tables

# Stop all services
docker compose down

# Reset database and restart
./init.sh --reset

# Start without rebuilding
./init.sh --start
```

---

## Project Structure

```
jrnybi/
├── redash/                      # Backend (Python/Flask)
│   ├── authentication/          # Auth handlers (JWT, SAML, etc.)
│   │   └── jwt_auth.py          # JWT token validation + JRNY claims
│   ├── handlers/                # API route handlers
│   │   └── jrny_data_dictionary.py  # Data Dictionary API endpoint
│   ├── query_runner/            # Database query runners
│   │   └── jrny_pg.py          # JRNY PostgreSQL (RLS) runner
│   ├── models/                  # SQLAlchemy models
│   └── settings/                # Configuration
├── client/                      # Frontend (React)
│   └── app/
│       ├── assets/
│       │   ├── images/          # Logo and favicon files
│       │   └── less/            # LESS stylesheets + jrny-theme.less
│       ├── components/          # Shared components
│       ├── pages/
│       │   └── jrny/            # JRNY-specific pages
│       │       └── DataDictionary.jsx
│       └── services/            # API client services
├── seed/                        # Data seeding scripts
│   └── jrny_reports.py          # Pre-built report seed script
├── compose.yaml                 # Docker Compose (development)
├── Dockerfile                   # Multi-stage Docker build
├── init.sh                      # Development setup script
├── manage.py                    # CLI management tool
├── pyproject.toml               # Python dependencies (Poetry)
└── package.json                 # Frontend dependencies (pnpm)
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   JRNY ERP (Host)                   │
│  ┌───────────────────────────────────────────────┐  │
│  │              iframe / proxy                    │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │            JRNYBI (This Repo)           │  │  │
│  │  │                                         │  │  │
│  │  │  React UI ──► Flask API ──► Metadata DB │  │  │
│  │  │                  │                      │  │  │
│  │  │                  ▼                      │  │  │
│  │  │   JRNY PostgreSQL (RLS) Query Runner    │  │  │
│  │  │     SET LOCAL session vars + query       │  │  │
│  │  │                  │                      │  │  │
│  │  └──────────────────┼──────────────────────┘  │  │
│  └─────────────────────┼────────────────────────┘  │
│                        ▼                            │
│         PostgreSQL Read-Replica (RLS enforced)      │
│        ┌──────────────────────────────────┐        │
│        │ reporting │ core │ sales │ finance│        │
│        │ inventory │ procurement │ cashbook│        │
│        └──────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

### JWT Authentication Flow

1. User logs into JRNY ERP
2. JRNY issues JWT with claims: `sub`, `email`, `name`, `org_id`, `branch_id`, `entity_id`, `role`
3. JWT set as `jrny_session` cookie (or `Authorization: Bearer` header)
4. JRNYBI validates JWT via JRNY's JWKS endpoint (RS256)
5. User auto-provisioned/updated in JRNYBI on first/subsequent login
6. Admin role mapped to JRNYBI admin group

### Row-Level Security (RLS) Flow

1. User executes a query via JRNYBI
2. JRNY PostgreSQL runner reads user's JRNY claims from `user.details`
3. `SET LOCAL app.current_org_id = '<uuid>'` (+ branch, entity, user, role) injected in a transaction
4. User's SQL query runs within the same transaction
5. PostgreSQL RLS policies evaluate session variables to filter data
6. Transaction commits, session variables are scoped (no bleed)

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDASH_DATABASE_URL` | JRNYBI metadata DB connection | `postgresql://postgres@postgres/postgres` |
| `REDASH_REDIS_URL` | Redis URL for job queue | `redis://redis:6379/0` |
| `REDASH_JWT_LOGIN_ENABLED` | Enable JWT authentication | `true` |
| `REDASH_JWT_AUTH_ISSUER` | Expected JWT issuer | `jrny-erp` |
| `REDASH_JWT_AUTH_AUDIENCE` | Expected JWT audience | `jrnybi` |
| `REDASH_JWT_AUTH_PUBLIC_CERTS_URL` | JWKS endpoint URL | — |
| `REDASH_JWT_AUTH_COOKIE_NAME` | Cookie containing JWT | `jrny_session` |
| `REDASH_PASSWORD_LOGIN_ENABLED` | Disable password login | `false` |
| `JRNYBI_ALLOWED_FRAME_ANCESTOR` | CSP frame-ancestors origin | `https://app.jrny.co.za` |
| `JRNYBI_JRNY_REPLICA_HOST` | Read-replica hostname | — |
| `JRNYBI_JRNY_REPLICA_USER` | Read-replica user | `jrnybi_reader` |

---

## Contributing

This is a fork of Redash. Changes are intentionally shallow (UI rebrand + one query runner + JWT auth) to minimize drift from upstream.

- **Security patches**: Cherry-pick from upstream Redash
- **New features**: Add in `redash/handlers/jrny_*`, `redash/query_runner/jrny_pg.py`, and `client/app/pages/jrny/`
- **Theme changes**: Edit `client/app/assets/less/jrny-theme.less`

---

## License

Based on [Redash](https://github.com/getredash/redash) — BSD-2-Clause License.
