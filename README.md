<div align="center">

<img src="docs/assets/logo.svg" alt="ScholarHUB logo" width="140" height="140" />

# ScholarHUB

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md)

**A modular, multi-tenant platform for running academic journals, preprint servers, and peer-review workflows.**

Submissions, peer review, publication, catalog, reader, and subscriptions are included out of the box.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12+-3776AB.svg?logo=python&logoColor=white&style=flat-square)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white&style=flat-square)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=white&style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1.svg?logo=postgresql&logoColor=white&style=flat-square)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4.svg?logo=tailwindcss&logoColor=white&style=flat-square)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker&logoColor=white&style=flat-square)](https://docs.docker.com/compose/)

[![Modules](https://img.shields.io/badge/modules-11-6366F1?style=flat-square&logo=modin&logoColor=white)](#modules)
[![E2E Specs](https://img.shields.io/badge/E2E_specs-64-22C55E?style=flat-square&logo=playwright&logoColor=white)](#testing)
[![Unit Tests](https://img.shields.io/badge/unit_tests-479-10B981?style=flat-square&logo=pytest&logoColor=white)](#testing)
[![Mypy strict](https://img.shields.io/badge/mypy-strict-2C5AA0?style=flat-square&logo=python&logoColor=white)](#testing)
[![Status](https://img.shields.io/badge/status-pre--alpha-F59E0B?style=flat-square)](#project-status)
[![Version](https://img.shields.io/badge/version-0.1.3-6B7280?style=flat-square)](VERSION)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square&logo=github&logoColor=white)](CONTRIBUTING.md)

[![GitHub](https://img.shields.io/badge/GitHub-weed33834%2Fscholarhub-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/weed33834/scholarhub)
[![Docs](https://img.shields.io/badge/docs-full-0E7490?style=flat-square&logo=gitbook&logoColor=white)](#documentation)
[![Security](https://img.shields.io/badge/security-policy-DC2626?style=flat-square&logo=dependabot&logoColor=white)](SECURITY.md)

**[Overview](#overview) · [Quick Start](#quick-start) · [Architecture](#architecture) · [Modules](#modules) · [Testing](#testing) · [Docs](#documentation) · [Contributing](#contributing)**

</div>

---

## Overview

ScholarHUB is an **opinionated, batteries-included** foundation for academic publishing — a single codebase that turns the *submit → review → accept → publish → read → subscribe* loop into a working website. It is not a writing tool and it is not a reference manager; it is the actual platform that authors, editors, reviewers, and readers log into.

It is built for the teams who keep rebuilding the same journal scaffold from scratch — labs, departments, conference organizers, and small OA publishers who want a real product instead of yet another custom CMS.

### When ScholarHUB fits

- A research lab or department wants a self-hosted preprint + journal platform.
- A conference needs a complete submission + peer-review pipeline.
- A publisher is piloting an open-access journal without committing to a SaaS lock-in.
- A teaching institution, charity, or government body needs a non-commercial-grade publishing platform they fully control.

### Three user personas

| Persona | What they can do in ScholarHUB |
|---|---|
| **Author** | Register, log in, submit a manuscript with full metadata (title / abstract / subject / keywords / DOI), track status (pending / under review / accepted / rejected / published), upload revisions, reply to reviewer comments, view their published works. |
| **Editor / Reviewer** *(admin)* | Assign reviewers from the admin shell, accept/decline invitations, submit review reports, accept/reject submissions, organize volumes and issues, push accepted items to *published*, manage users and roles, view the audit log. |
| **Reader** | Browse the catalog and article metadata without login; after login: read PDFs in-browser, sync reading progress across devices, build personal reading lists, follow authors/subjects, receive subscription notifications, get personalized recommendations. |

### End-to-end workflow

From manuscript submission to a reader's bookmark, every step runs on a single platform:

<div align="center">
<img src="docs/assets/workflow.svg" alt="Submit → review → publish workflow" width="900" />
</div>

1. The author submits a manuscript with full metadata.
2. The editor assigns reviewers; reviewers accept or decline.
3. Reviewers file reports; the author responds and uploads revisions.
4. The editor accepts or rejects; accepted manuscripts are pushed to *published*.
5. Published items appear in the public catalog; logged-in readers can read, save, follow, and receive recommendations.

---

## Modules

Each domain capability is an independent module — disable, replace, or extend it without touching core.

| Module | Status | What it does |
|---|:---:|---|
| `core` | ✓ shipped | Tenants, users, roles, module registry, admin shell, deployment |
| `catalog` | ✓ shipped | Article metadata, subjects, authors, journals, volumes/issues, tags |
| `submission` | ✓ shipped | Submit → editor assigns → review → accept/reject workflow |
| `review` | ✓ shipped | OJS-style peer-review workflow, reports, reviewer role management |
| `reader` | ✓ shipped | In-browser PDF reader, reading progress, cross-device sync, outline |
| `export` | ✓ shipped | BibTeX / RIS / CSV / JSON citation export, round-trippable |
| `library` | ✓ shipped | User-curated reading lists |
| `follows` | ✓ shipped | Author/subject subscriptions + notification fan-out |
| `notifications` | ✓ shipped | In-app notification stream, per-user isolated |
| `ingest` | ✓ shipped | BibTeX / RIS / CSV batch import + Crossref / arXiv metadata fetch |
| `doi` | ✓ shipped | DOI minting and registration via the DataCite API (config-gated) |
| `recommendations` | ✓ shipped | Personalized recommendations based on reading history + explanations |

---

## Architecture

<div align="center">
<img src="docs/assets/architecture.svg" alt="ScholarHUB system architecture" width="900" />
</div>

### Two-layer tenant isolation

Every domain table carries a `tenant_id`:

1. **Application layer** — every `SELECT` / `UPDATE` / `DELETE` explicitly appends `Model.tenant_id == current_user.tenant_id`.
2. **Database layer** — PostgreSQL Row Level Security runs `SET LOCAL app.current_tenant_id = :tid` in `get_db()`. Even if the application layer forgets the filter, the database refuses cross-tenant rows.

### Module registry

At startup, `app.core.modules.load_all()` loads every module in dependency order, registers its ORM tables on `Base.metadata`, mounts its routes on the FastAPI app, and adds its health checks to the `/health` response. Adding a new module is a single entry in `load_all()` — no core code changes.

---

## Tech stack

Every choice is mainstream and long-term hostable — no exotic dependencies.

### Backend

| Layer | Choice |
|---|---|
| Language | Python 3.12+ (`async/await` + full type hints) |
| Framework | FastAPI 0.115+ |
| ORM | SQLAlchemy 2 (async) |
| Migrations | Alembic |
| Database | PostgreSQL 17 (primary, with Row Level Security) |
| Validation | Pydantic 2 + pydantic-settings |
| Auth | JWT access + httpOnly cookie refresh; PyJWT + bcrypt |
| SSO | authlib (OIDC: Google / GitHub / Generic / Keycloak) |
| HTTP client | httpx |
| Mail | Pluggable: console (dev) / SMTP relay (Mailgun / SendGrid / SES / Postmark) |
| Logging | structlog (JSON output) |
| Toolchain | uv, ruff, mypy (strict), pytest, pytest-asyncio, bandit, pip-audit |

### Frontend

| Layer | Choice |
|---|---|
| Framework | React 19 |
| Language | TypeScript 5.7 |
| Build | Vite 7 |
| Router | TanStack Router v1 (file-based + autoCodeSplitting) |
| Data | TanStack Query v5 |
| State | Zustand (auth store, sessionStorage + BroadcastChannel cross-tab logout) |
| UI | shadcn/ui + Radix primitives, Tailwind CSS v4 |
| Toasts | sonner |
| Icons | lucide-react |
| Toolchain | ESLint, Vitest, TypeScript Project References, Playwright (E2E) |

### Deployment

| Item | Choice |
|---|---|
| Container | Docker Compose (dev + prod) |
| TLS | Caddy (automatic Let's Encrypt) |
| Database | PostgreSQL 17-alpine |
| Images | backend + frontend pinned together, no drift |

---

## Quick start

### Option 1 — Docker Compose (recommended)

```bash
# 1. Generate strong secrets
echo "SCHOLARHUB_SECRET_KEY=$(openssl rand -hex 32)" > .env
echo "SCHOLARHUB_ADMIN_PASSWORD=$(openssl rand -base64 18)" >> .env

# 2. Start the dev stack (Postgres + backend + frontend)
docker compose -f infra/docker-compose.yml up --build

# 3. Open the API docs and the SPA
xdg-open http://localhost:8000/docs
xdg-open http://localhost:5173
```

### Option 2 — Local bare metal (development)

Requires Python 3.12+, Node 20+, and a PostgreSQL 17 instance.

```bash
# Backend
cd apps/backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# Frontend (in another terminal)
cd apps/frontend
npm install
npm run dev
```

### Option 3 — Production deployment

```bash
# 1. Copy and fill in the production env
cp .env .env.prod
# At least SCHOLARHUB_SECRET_KEY and SCHOLARHUB_ADMIN_PASSWORD

# 2. Edit infra/Caddyfile and replace scholarhub.example.com with your domain
# 3. Start the prod stack (Caddy provides automatic TLS)
docker compose -f infra/docker-compose.prod.yml \
  --env-file .env.prod up -d --build
```

> For mail (Mailgun / SendGrid / SES / Postmark) and OIDC SSO (Google / GitHub / Keycloak) integration, see [docs/integrations.md](docs/integrations.md).

---

## Project structure

```
scholarhub/
├── README.md                      # This file (English, default)
├── README.zh.md                   # 简体中文版
├── README.ja.md                   # 日本語版
├── CHANGELOG.md                   # Visible change log
├── CONTRIBUTING.md                # Contribution workflow
├── CODE_OF_CONDUCT.md             # Code of conduct
├── SECURITY.md                    # Security policy
├── SUPPORT.md                     # Getting help
├── LICENSE                        # Apache-2.0
├── VERSION                        # Single source of truth for version
├── apps/
│   ├── backend/                   # FastAPI service (base + modules)
│   │   ├── alembic/versions/      # Per-module migration files
│   │   ├── app/
│   │   │   ├── api/               # Top-level routes (admin/auth/oidc/users/health/modules)
│   │   │   ├── core/              # Startup/config/db/mail/tenancy/tokens/security
│   │   │   ├── middleware/        # rate_limit / security_headers
│   │   │   └── modules/           # 10 domain modules
│   │   ├── tests/                 # pytest + aiosqlite
│   │   └── pyproject.toml         # uv + ruff + mypy + bandit config
│   └── frontend/                  # React 19 SPA
│       ├── src/
│       │   ├── components/         # Generic UI (shadcn-style)
│       │   ├── hooks/api/         # React Query hooks grouped by module
│       │   ├── lib/               # api client / auth store / types
│       │   └── routes/            # TanStack Router file-based routes
│       └── package.json
├── docs/
│   ├── assets/                    # LOGO + architecture + workflow SVGs
│   ├── ARCHITECTURE.md            # Architecture contract
│   └── integrations.md            # Mail + OIDC integration guide
├── infra/
│   ├── Dockerfile.backend         # Backend image
│   ├── docker-compose.yml         # Dev stack
│   ├── docker-compose.prod.yml    # Prod stack (with Caddy)
│   └── Caddyfile                  # TLS template
└── .github/
    ├── workflows/
    │   ├── ci.yml                  # ruff + mypy + pytest + frontend + gitleaks + CodeQL
    │   ├── release.yml             # Tag-driven wheel + Docker image + GitHub Release
    │   └── dependabot-auto-merge.yml
    ├── dependabot.yml             # Weekly pip + npm + GHA + docker updates
    ├── CODEOWNERS                 # Code ownership
    ├── SECURITY-MONITORING.md     # Security automation layers
    └── ISSUE_TEMPLATE/            # Issue templates
```

---

## Configuration

All variables are prefixed `SCHOLARHUB_`. The full list is in [`apps/backend/app/core/config.py`](apps/backend/app/core/config); the most important ones:

| Variable | Required | Description |
|---|:---:|---|
| `SCHOLARHUB_SECRET_KEY` | ✓ | JWT signing key, at least 32 chars; generate with `openssl rand -hex 32` |
| `SCHOLARHUB_PREVIOUS_SECRET_KEYS` | | Comma-separated previous JWT signing keys used during the rotation window |
| `SCHOLARHUB_ADMIN_PASSWORD` | ✓ | Initial admin password, at least 12 chars |
| `SCHOLARHUB_DATABASE_URL` | | PostgreSQL DSN, default `postgresql+asyncpg://scholarhub:scholarhub@localhost:5432/scholarhub` |
| `SCHOLARHUB_TENANCY_MODE` | | `single` (default) / `multi` (host-header resolved; not yet implemented) |
| `SCHOLARHUB_ENVIRONMENT` | | `development` (default) / `staging` / `production` / `test` |
| `SCHOLARHUB_FRONTEND_BASE_URL` | | SPA origin used for deep links in emails, e.g. `https://app.yourdomain.com` |
| `SCHOLARHUB_OIDC_ENABLED` | | `true` enables OIDC SSO (paired with the `OIDC_*` variables); see also `/api/auth/oidc/providers` |
| `SCHOLARHUB_TOTP_ISSUER` | | Issuer string shown in TOTP authenticator apps (default `ScholarHUB`) |
| `SCHOLARHUB_REDIS_URL` | | If set, `RedisRateLimiterStore` is used; otherwise `MemoryRateLimiterStore` (Redis errors auto-fail-open) |
| `SCHOLARHUB_EMAIL_BACKEND` | | `console` (default) / `smtp` |
| `SCHOLARHUB_CORS_ORIGINS` | | Comma-separated list of frontend origins |

Full template: [`apps/backend/.env.example`](apps/backend/.env.example).

---

## Security

Defense in depth is shipped by default — every layer below is enabled when
the backend boots:

- **Authentication.** bcrypt password hashing; JWT access tokens (HS256,
  short-lived) + httpOnly refresh cookie + `token_version` per user.
- **Two-factor authentication (TOTP).** RFC 6238 with per-user secret
  Fernet-encrypted at rest; 10 single-use backup codes SHA-256-hashed.
  Endpoints under `/api/auth/2fa/` (`setup`, `verify-setup`, `status`,
  `authenticate`, `disable`, `backup-codes`).
- **OIDC SSO.** authlib-based; PKCE mandatory; `state` parameter is a
  short-lived JWT to defend against CSRF. Frontend reads the allowed
  providers from `GET /api/auth/oidc/providers` on boot (no client
  hardcoding).
- **JWT key rotation.** `app/core/key_rotation.py` keeps an ordered key
  chain; new tokens sign with the newest key, decode iterates the chain.
  `POST /api/admin/reload-secret-keys` rebuilds the chain in-process —
  zero downtime, no restarts.
- **Rate limit.** Sliding window per IP + route, pluggable store
  (`MemoryRateLimiterStore` default, `RedisRateLimiterStore` when
  `SCHOLARHUB_REDIS_URL` is set). Redis unreachable → auto-fail-open.
- **GDPR endpoints.** `GET /api/users/me/export`, `DELETE /api/users/me`
  (soft delete, 30-day grace, PII anonymised, `token_version` bumped,
  all sessions invalidated), `POST /api/users/me/restore` (within grace).
- **Two-layer tenant isolation.** App-layer query filter + PostgreSQL RLS
  with `SET LOCAL app.current_tenant_id`.
- **Headers.** CSP, HSTS, X-Frame-Options, X-Content-Type,
  Referrer-Policy, Permissions-Policy.
- **CSRF.** Double-submit cookie pattern (configurable, default off for
  API-first deployments). When enabled, state-changing requests must
  present a matching `X-CSRF-Token` header + cookie.
- **RFC 7807.** All error responses follow RFC 7807 `application/problem+json`
  with `type` / `title` / `status` / `detail` / `instance`.
- **Audit log.** Every privileged admin action is recorded per tenant.

See [SECURITY.md](SECURITY.md) for the full policy, threat model, and
incident-response checklist. To scan the repo for leaked secrets:

```bash
gitleaks detect --source . --config .gitleaks.toml
```

---

## Default roles and permissions

`core` auto-creates these roles on startup (assignable from the admin shell):

| Role slug | What they can do |
|---|---|
| `admin` | Full access — admin shell, user management, audit log |
| `editor` | Assign reviewers, organize volumes/issues, accept/reject, push to *published* |
| `reviewer` | View assigned submissions, file review reports |
| `author` | Submit manuscripts, view own status, upload revisions |
| `member` | Read, save, follow, view personalized recommendations |

---

## Testing

### Unit + integration

```bash
# Backend: lint + type + test
cd apps/backend
uv run ruff check .
uv run mypy app
uv run pytest -q

# Backend: RLS isolation tests (requires a real PostgreSQL)
SCHOLARHUB_DATABASE_URL=postgresql+asyncpg://... uv run pytest tests/test_rls_isolation.py -v

# Frontend
cd apps/frontend
npm run lint
npm run typecheck
npm run build
npm run test
```

### End-to-end

12 spec files (64 Playwright test() calls) cover complete user journeys, validating every main flow with real browser clicks:

```bash
# Start the backend (test mode: SQLite + rate_limit skipped)
cd apps/backend
uv run python e2e_run_server.py &

# Start the frontend dev server
cd ../frontend
npm run dev &

# Run the full E2E suite
npx playwright test
```

Coverage spans:

- Admin resource CRUD + user management + role assignment
- Author register / login / email verification / submit / resubmit / upload manuscript
- Reviewer accept/decline invitations + submit review reports
- Reader reading-progress sync (simulated cross-device) / reading list CRUD / follow authors / subscribe to subjects
- Notification center / recommendation engine / citation export (BibTeX / RIS / CSV / JSON)
- Guest catalog browsing / detail pages
- Crossref import / parsing

CI workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Project status

**Version**: `0.1.0-alpha` · **Status**: pre-alpha

All 10 modules are shipped; backend + frontend + database migrations + unit tests + E2E tests + deployment are all in place. The roadmap:

- [x] Two-factor authentication (TOTP) — shipped
- [x] JWT secret rotation (online, zero downtime) — shipped
- [x] Redis-backed distributed rate limit (with in-memory fallback) — shipped
- [x] GDPR endpoints (export + soft delete + 30-day restore) — shipped
- [x] OIDC provider discovery endpoint + PKCE enforcement — shipped
- [x] CI: ruff + mypy + pytest + frontend lint/typecheck/build + gitleaks + CodeQL + pip-audit — shipped
- [x] CSRF protection (double-submit cookie) — shipped
- [x] RFC 7807 error responses (application/problem+json) — shipped
- [x] ORCID iD field (User + author metadata) — shipped
- [x] Discipline/subdiscipline ontology tables — shipped
- [x] Crossref enrichment (publisher / journal abbreviation / volume / issue / page / ISSN) — shipped
- [x] Privacy page + cookie consent banner + retention policy — shipped
- [x] Multi-tenant mode (host-header → tenant mapping) — shipped (`tenant_hosts` admin API + middleware resolution + cache)
- [x] Explicit refresh token denylist — shipped (Redis/memory pluggable, `app/core/token_denylist.py`)
- [ ] WebAuthn / passkeys — backend + API shipped; frontend management UI pending
- [ ] Advanced volume/issue management UI (real endpoints replacing the client-side heuristic)
- [x] DOI registration via DataCite (`doi` module; set `SCHOLARHUB_DATACITE_*` to enable) — shipped
- [ ] DOI cross-linking and display
- [x] Full-text search — shipped as opt-in Meilisearch integration with DB ILIKE fallback
- [x] Switch file storage from local to S3 — shipped (`storage_backend=s3`, MinIO/R2/OSS compatible)
- [ ] Workflow visualization (submit → review → accept)
- [ ] i18n phase 2: migrate catalog / app-shell pages (infrastructure + auth cluster done in 0.2.0)

---

## Documentation

- [Architecture contract](docs/ARCHITECTURE.md) — module dependencies, tenant isolation, module registry, migration strategy
- [Mail / OIDC integration](docs/integrations.md) — Mailgun / SendGrid / SES / Postmark + Google / GitHub / Keycloak
- [Contributing](CONTRIBUTING.md) — branch naming, commit conventions, PR checklist
- [Security policy](SECURITY.md) — vulnerability reporting, built-in security layers, local tooling
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Getting help](SUPPORT.md)
- [Changelog](CHANGELOG.md)

---

## Contributing

Issues and PRs are welcome:

- **GitHub**: https://github.com/weed33834/scholarhub

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and conventions.

---

## Repository

This repository is hosted at:

- **GitHub**: https://github.com/weed33834/scholarhub

---

## License

Copyright © 2026 badhope. Released under the [Apache License 2.0](LICENSE).

You are free to use, modify, and distribute this software under the terms of the Apache License 2.0; see the license text and the [NOTICE](NOTICE) file for details.

The software is provided "as is", without warranty of any kind. See [LICENSE](LICENSE) for the full text.
