<div align="center">

<img src="docs/assets/logo.svg" alt="ScholarHUB logo" width="140" height="140" />

# ScholarHUB

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md)

**一套面向学术期刊、预印本平台与同行评审的模块化多租户基座**

投稿、审稿、发表、目录、读者与订阅,开箱即用。

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12+-3776AB.svg?logo=python&logoColor=white&style=flat-square)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white&style=flat-square)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=white&style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1.svg?logo=postgresql&logoColor=white&style=flat-square)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4.svg?logo=tailwindcss&logoColor=white&style=flat-square)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker&logoColor=white&style=flat-square)](https://docs.docker.com/compose/)

[![Modules](https://img.shields.io/badge/modules-11-6366F1?style=flat-square&logo=modin&logoColor=white)](#模块清单)
[![E2E Specs](https://img.shields.io/badge/E2E_specs-64-22C55E?style=flat-square&logo=playwright&logoColor=white)](#测试)
[![Unit Tests](https://img.shields.io/badge/unit_tests-479-10B981?style=flat-square&logo=pytest&logoColor=white)](#测试)
[![Mypy strict](https://img.shields.io/badge/mypy-strict-2C5AA0?style=flat-square&logo=python&logoColor=white)](#测试)
[![Status](https://img.shields.io/badge/status-pre--alpha-F59E0B?style=flat-square)](#项目状态)
[![Version](https://img.shields.io/badge/version-0.1.3-6B7280?style=flat-square)](VERSION)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square&logo=github&logoColor=white)](CONTRIBUTING.md)

[![GitHub](https://img.shields.io/badge/GitHub-weed33834%2Fscholarhub-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/weed33834/scholarhub)
[![Docs](https://img.shields.io/badge/docs-full-0E7490?style=flat-square&logo=gitbook&logoColor=white)](#文档)
[![Security](https://img.shields.io/badge/security-policy-DC2626?style=flat-square&logo=dependabot&logoColor=white)](SECURITY.md)

**[一句话定位](#一句话定位) · [快速开始](#快速开始) · [系统架构](#系统架构) · [模块清单](#模块清单) · [测试](#测试) · [文档](#文档) · [参与贡献](#贡献)**

</div>

---

## 一句话定位

ScholarHUB 是一套**开箱即用、自带电池**的学术出版基座——把"投稿 → 审稿 → 录用 → 发表 → 阅读 → 订阅"这条主流程做完整,变成一个能跑的网站。它不是论文写作工具,也不是文献管理软件,而是作者、编辑、审稿人、读者真正会登录进去用的那个平台。

它面向的是那些反复从头搭一套期刊脚手架的团队——实验室、学院、会议组织方、小型 OA 出版商——他们要的是一个真正的产品,而不是又一次定制 CMS 的重复劳动。

### 适合的场景

- 实验室或学院想自建一个内部预印本与正刊平台
- 会议组织方需要一套完整的稿件收集 + 同行评审流水线
- 出版人想小步试水开放获取(OA)期刊,不想被 SaaS 锁死
- 教学、慈善、政府等机构需要一个自己完全掌控的非商业级出版平台

### 三类用户,三种身份

ScholarHUB 的所有功能都围绕这三类用户设计:

| 身份 | 在 ScholarHUB 上能做什么 |
|---|---|
| **作者** | 注册账号、登录后投递稿件(标题 / 摘要 / 学科 / 关键词 / DOI)、查看状态(待审 / 审稿中 / 录用 / 拒稿 / 已发表)、上传修改稿、回复审稿意见、查看已发表作品 |
| **编辑 / 审稿人**(管理员) | 在 admin 后台分配审稿人、接稿 / 拒稿、提交审稿报告、录用 / 拒稿、组织卷期、把稿件推到"已发表"、管理用户与角色、查看审计日志 |
| **读者** | 不登录就能浏览目录与文章元数据;登录后可阅读 PDF、跨设备同步阅读进度、构建个人阅读列表、订阅作者 / 学科、接收订阅通知、获取个性化推荐 |

### 端到端主流程

从投稿到读者收藏,所有环节都在一个平台上闭环:

<div align="center">
<img src="docs/assets/workflow.svg" alt="投稿审稿发表主流程" width="900" />
</div>

1. 作者投递稿件,填好完整元数据
2. 编辑分配审稿人,审稿人接稿 / 拒稿
3. 审稿人撰写意见并提交,作者收到反馈后可上传修改稿
4. 编辑做出录用 / 拒稿决定;录用的稿件推到"已发表"
5. 已发表的稿件自动进入目录,公开可见;登录读者可阅读 PDF、收藏、订阅、获取推荐

---

## 模块清单

每个领域能力都是独立模块,可单独启用、替换或扩展,不触碰 core。

| 模块 | 状态 | 描述 |
|---|:---:|---|
| `core` | ✓ shipped | 租户、用户、角色、模块注册表、admin shell、部署 |
| `catalog` | ✓ shipped | 文章元数据、学科、作者、期刊、卷期、tag |
| `submission` | ✓ shipped | 投稿 → 编辑分配 → 审稿 → 录用 / 拒稿 主流程 |
| `review` | ✓ shipped | OJS 风格审稿工作流、审稿意见、审稿人角色管理 |
| `reader` | ✓ shipped | 浏览器内 PDF 阅读、阅读进度、跨设备同步、大纲 |
| `export` | ✓ shipped | BibTeX / RIS / CSV / JSON 引用导出,支持往返 |
| `library` | ✓ shipped | 用户自己策展的阅读列表 |
| `follows` | ✓ shipped | 作者 / 学科订阅 + 通知 fan-out |
| `notifications` | ✓ shipped | 站内通知流、按用户隔离 |
| `ingest` | ✓ shipped | BibTeX / RIS / CSV 批量导入 + Crossref / arXiv 元数据抓取 |
| `doi` | ✓ shipped | 通过 DataCite API 注册与铸造 DOI（需配置后启用） |
| `recommendations` | ✓ shipped | 基于阅读历史的个性化推荐 + 推荐理由 |

---

## 系统架构

<div align="center">
<img src="docs/assets/architecture.svg" alt="ScholarHUB 系统架构" width="900" />
</div>

### 双层租户隔离

每个领域表都带 `tenant_id`:

1. **应用层** — 每个 `SELECT` / `UPDATE` / `DELETE` 显式追加 `Model.tenant_id == current_user.tenant_id`
2. **数据库层** — PostgreSQL RLS 在 `get_db()` 中执行 `SET LOCAL app.current_tenant_id = :tid`,即使应用层漏写过滤,数据库也会拒掉跨租户行

### 模块注册表

启动时 `app.core.modules.load_all()` 按依赖顺序加载所有模块,把它们的 ORM 表注册到 `Base.metadata`、把它们的路由挂到 FastAPI app、把它们的 health 检查加入 `/health` 响应。新增模块只要在 `load_all()` 注册即可,无需改动 core。

---

## 技术栈

每一项都选用主流、长期可托管的方案,不放任何冷门依赖。

### 后端

| 层 | 选型 |
|---|---|
| 语言 | Python 3.12+(`async/await` + 完整 type hints) |
| 框架 | FastAPI 0.115+ |
| ORM | SQLAlchemy 2(async) |
| 迁移 | Alembic |
| 数据库 | PostgreSQL 17(主库,启用 Row Level Security) |
| 校验 | Pydantic 2 + pydantic-settings |
| 鉴权 | JWT access + httpOnly cookie refresh;PyJWT + bcrypt |
| SSO | authlib(OIDC:Google / GitHub / Generic / Keycloak) |
| HTTP 客户端 | httpx |
| 邮件 | 可插拔:console(dev)/ SMTP relay(Mailgun / SendGrid / SES / Postmark) |
| 日志 | structlog(JSON 输出) |
| 工具链 | uv、ruff、mypy(strict)、pytest、pytest-asyncio、bandit、pip-audit |

### 前端

| 层 | 选型 |
|---|---|
| 框架 | React 19 |
| 语言 | TypeScript 5.7 |
| 构建 | Vite 7 |
| 路由 | TanStack Router v1(file-based + autoCodeSplitting) |
| 数据 | TanStack Query v5 |
| 状态 | Zustand(auth store,sessionStorage 持久化 + BroadcastChannel 跨标签页登出) |
| UI | shadcn / ui + Radix primitives、Tailwind CSS v4 |
| 通知 | sonner toasts |
| 图标 | lucide-react |
| 工具链 | ESLint、Vitest、TypeScript Project References、Playwright(E2E) |

### 部署

| 项 | 选型 |
|---|---|
| 容器 | Docker Compose(dev + prod) |
| TLS | Caddy(自动 Let's Encrypt) |
| 数据库 | PostgreSQL 17-alpine |
| 镜像 | backend + frontend 同镜像,版本不会漂移 |

---

## 快速开始

### 方式一:Docker Compose(推荐)

```bash
# 1. 生成强密钥
echo "SCHOLARHUB_SECRET_KEY=$(openssl rand -hex 32)" > .env
echo "SCHOLARHUB_ADMIN_PASSWORD=$(openssl rand -base64 18)" >> .env

# 2. 启动 dev stack(Postgres + backend + frontend)
docker compose -f infra/docker-compose.yml up --build

# 3. 打开 OpenAPI 文档与前端
xdg-open http://localhost:8000/docs
xdg-open http://localhost:5173
```

### 方式二:本地裸跑(开发)

需要 Python 3.12+、Node 20+、一个 PostgreSQL 17 实例。

```bash
# 后端
cd apps/backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# 前端(另开一个终端)
cd apps/frontend
npm install
npm run dev
```

### 方式三:生产部署

```bash
# 1. 复制并填好生产 env
cp .env .env.prod
# 至少设置 SCHOLARHUB_SECRET_KEY 与 SCHOLARHUB_ADMIN_PASSWORD

# 2. 改 infra/Caddyfile,把 scholarhub.example.com 换成你的域名
# 3. 启动 prod stack(带 Caddy 自动 TLS)
docker compose -f infra/docker-compose.prod.yml \
  --env-file .env.prod up -d --build
```

> 邮件(Mailgun / SendGrid / SES / Postmark)与 OIDC SSO(Google / GitHub / Keycloak)的接入,见 [docs/integrations.md](docs/integrations.md)。

---

## 项目结构

```
scholarhub/
├── README.md                      # 英文版(默认)
├── README.zh.md                   # 本文件(简体中文)
├── README.ja.md                   # 日本語版
├── CHANGELOG.md                   # 可见变更记录
├── CONTRIBUTING.md                # 贡献流程
├── CODE_OF_CONDUCT.md             # 行为准则
├── SECURITY.md                    # 安全策略
├── SUPPORT.md                     # 获取帮助
├── LICENSE                        # Apache-2.0
├── VERSION                        # 单一版本号源
├── apps/
│   ├── backend/                   # FastAPI 服务(base + 模块)
│   │   ├── alembic/versions/      # 迁移文件,每模块一份
│   │   ├── app/
│   │   │   ├── api/               # 顶层路由(admin/auth/oidc/users/health/modules)
│   │   │   ├── core/              # 启动/配置/db/邮件/租户/tokens/security
│   │   │   ├── middleware/        # rate_limit / security_headers
│   │   │   └── modules/           # 10 个领域模块
│   │   ├── tests/                 # pytest + aiosqlite
│   │   └── pyproject.toml         # uv + ruff + mypy + bandit 配置
│   └── frontend/                  # React 19 SPA
│       ├── src/
│       │   ├── components/         # 通用 UI(shadcn 风格)
│       │   ├── hooks/api/         # 按模块分组的 React Query hooks
│       │   ├── lib/               # api client / auth store / types
│       │   └── routes/            # TanStack Router file-based 路由
│       └── package.json
├── docs/
│   ├── assets/                    # LOGO + 架构图 + 流程图
│   ├── ARCHITECTURE.md            # 架构契约
│   └── integrations.md            # 邮件 + OIDC 接入
├── infra/
│   ├── Dockerfile.backend         # backend 镜像
│   ├── docker-compose.yml         # dev stack
│   ├── docker-compose.prod.yml    # prod stack(带 Caddy)
│   └── Caddyfile                  # TLS 模板
└── .github/
    ├── workflows/
    │   ├── ci.yml                  # ruff + mypy + pytest + frontend + gitleaks + CodeQL
    │   ├── release.yml             # Tag 驱动 wheel + Docker 镜像 + Release
    │   └── dependabot-auto-merge.yml
    ├── dependabot.yml             # 每周 pip + npm + GHA + docker 依赖更新
    ├── CODEOWNERS                 # 代码归属
    ├── SECURITY-MONITORING.md     # 安全自动化层级文档
    └── ISSUE_TEMPLATE/            # issue 模板
```

---

## 配置

所有变量以 `SCHOLARHUB_` 为前缀。完整列表见 [`apps/backend/app/core/config.py`](apps/backend/app/core/config),最关键的几项:

| 环境变量 | 必填 | 说明 |
|---|:---:|---|
| `SCHOLARHUB_SECRET_KEY` | ✓ | JWT 签名密钥,至少 32 字符,`openssl rand -hex 32` 生成 |
| `SCHOLARHUB_PREVIOUS_SECRET_KEYS` | | 密钥轮换窗口内的旧 JWT 密钥,逗号分隔 |
| `SCHOLARHUB_ADMIN_PASSWORD` | ✓ | 首次启动创建的 admin 账户密码,至少 12 字符 |
| `SCHOLARHUB_DATABASE_URL` | | PostgreSQL 连接串,默认 `postgresql+asyncpg://scholarhub:scholarhub@localhost:5432/scholarhub` |
| `SCHOLARHUB_TENANCY_MODE` | | `single`(默认,单租户)/ `multi`(host-header 解析,未实现) |
| `SCHOLARHUB_ENVIRONMENT` | | `development`(默认)/ `staging` / `production` / `test` |
| `SCHOLARHUB_FRONTEND_BASE_URL` | | 邮件深链的 SPA origin,如 `https://app.yourdomain.com` |
| `SCHOLARHUB_OIDC_ENABLED` | | `true` 启用 OIDC SSO(配合下方 OIDC_* 变量);另见 `/api/auth/oidc/providers` |
| `SCHOLARHUB_TOTP_ISSUER` | | TOTP 验证器中显示的签发方(默认 `ScholarHUB`) |
| `SCHOLARHUB_REDIS_URL` | | 设置后启用 Redis 限流,未设置则使用内存存储(Redis 失败自动降级) |
| `SCHOLARHUB_EMAIL_BACKEND` | | `console`(默认)/ `smtp` |
| `SCHOLARHUB_CORS_ORIGINS` | | 前端 origin 列表,逗号分隔 |

完整模板见 [`apps/backend/.env.example`](apps/backend/.env.example)。

---

## 默认角色与权限

启动时 core 会自动创建以下角色(可在 admin 后台再分配):

| 角色 slug | 能做什么 |
|---|---|
| `admin` | 全部操作,含 admin 后台、用户管理、审计日志 |
| `editor` | 分配审稿人、组织卷期、录用 / 拒稿、把稿件推到"已发表" |
| `reviewer` | 查看分配给自己的稿件、提交审稿意见 |
| `author` | 投递稿件、查看自己稿件状态、上传修改稿 |
| `member` | 阅读、收藏、订阅、查看个性化推荐 |

---

## 测试

### 单元 + 集成

```bash
# 后端:lint + type + test
cd apps/backend
uv run ruff check .
uv run mypy app
uv run pytest -q

# 后端:RLS 隔离测试(需要真实 PostgreSQL)
SCHOLARHUB_DATABASE_URL=postgresql+asyncpg://... uv run pytest tests/test_rls_isolation.py -v

# 前端
cd apps/frontend
npm run lint
npm run typecheck
npm run build
npm run test
```

### E2E 测试

12 个 spec 文件（64 个 Playwright test()）覆盖完整用户旅程,以真实浏览器点击的方式验证每条主流程:

```bash
# 启动后端(测试模式,SQLite + rate_limit 跳过)
cd apps/backend
uv run python e2e_run_server.py &

# 启动前端 dev server
cd ../frontend
npm run dev &

# 跑全部 E2E
npx playwright test
```

覆盖范围:

- admin 资源 CRUD + 用户管理 + 角色分配
- 作者注册 / 登录 / 邮箱验证 / 投稿 / 重投 / 上传稿件
- 审稿人接稿 / 拒稿 / 提交审稿报告
- 读者阅读进度同步(跨设备模拟)/ 阅读列表 CRUD / 关注作者 / 订阅学科
- 通知中心 / 推荐引擎 / 引用导出(BibTeX / RIS / CSV / JSON)
- 访客浏览目录 / 详情
- Crossref 导入 / 解析

GitHub Actions workflow 见 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)。

---

## 项目状态

**版本**:`0.1.0-alpha` · **状态**:pre-alpha

10 个模块全部 shipped,前后端 + 数据库迁移 + 单元测试 + E2E 测试 + 部署都已就绪。后续规划:

- [x] 双因素认证 (TOTP) — shipped
- [x] JWT 密钥轮换 (在线,零停机) — shipped
- [x] Redis 分布式限流 (带内存降级) — shipped
- [x] GDPR 端点 (数据导出 + 软删除 + 30 天恢复) — shipped
- [x] OIDC provider discovery 端点 + PKCE 强制 — shipped
- [x] CI: ruff + mypy + pytest + 前端 lint/typecheck/build + gitleaks + CodeQL + pip-audit — shipped
- [x] CSRF 双重提交 cookie — shipped
- [x] RFC 7807 格式错误响应 — shipped
- [x] ORCID iD 字段 (用户 + 作者元数据) — shipped
- [x] 学科/子学科 ontology 表 — shipped
- [x] Crossref 富集 (出版者/期刊缩写/卷/期/页/ISSN) — shipped
- [x] 隐私页 + cookie consent banner + 保留策略 — shipped
- [x] 多租户模式落地(host-header → tenant 映射) — shipped(`tenant_hosts` 管理 API + 中间件解析 + 缓存)
- [x] refresh token 显式 denylist — shipped(Redis/内存可插拔,`app/core/token_denylist.py`)
- [ ] WebAuthn / passkeys — 后端与 API 已完成,前端管理界面待做
- [ ] 卷期(volume / issue)的高级管理界面(以真实端点替代客户端启发式)
- [x] DOI 注册(DataCite,`doi` 模块;配置 `SCHOLARHUB_DATACITE_*` 后启用) — shipped
- [ ] DOI 互链与展示
- [x] 全文检索 — 已实现为可选 Meilisearch 集成,未配置时回退 DB ILIKE
- [x] 文件存储本地 → S3 — shipped(`storage_backend=s3`,兼容 MinIO/R2/OSS)
- [ ] 工作流可视化(投稿 → 审稿 → 录用)
- [ ] i18n 第二阶段:迁移目录浏览 / 应用外壳等页面(0.2.0 已交付基础设施 + auth 集群)

---

## 文档

- [架构契约](docs/ARCHITECTURE.md) — 模块依赖、租户隔离、模块注册表、迁移策略
- [邮件 / OIDC 集成](docs/integrations.md) — Mailgun / SendGrid / SES / Postmark + Google / GitHub / Keycloak
- [贡献流程](CONTRIBUTING.md) — 分支命名、提交规范、PR 检查表
- [安全策略](SECURITY.md) — 漏洞上报、内置安全层、本地工具
- [行为准则](CODE_OF_CONDUCT.md)
- [获取帮助](SUPPORT.md)
- [变更记录](CHANGELOG.md)

---

## 贡献

欢迎提 issue 或 PR:

- **GitHub**:https://github.com/weed33834/scholarhub

流程与规范见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 仓库地址

本仓库托管在:

- **GitHub**:https://github.com/weed33834/scholarhub

---

## License

Copyright © 2026 badhope. Released under the [Apache License 2.0](LICENSE).

在遵守 Apache License 2.0 条款的前提下,你可以自由使用、修改、分发本软件;详见许可证正文与 [NOTICE](NOTICE) 文件。

本软件按"现状"提供,不附带任何担保。完整文本见 [LICENSE](LICENSE)。
