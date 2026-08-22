<div align="center">

<img src="docs/assets/logo.svg" alt="ScholarHUB logo" width="140" height="140" />

# ScholarHUB

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md)

**学術ジャーナル・プレプリントサーバー・査読ワークフローのためのモジュラー型マルチテナント基盤**

投稿・査読・出版・目録・読者・購読まで、最初から揃っている。

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12+-3776AB.svg?logo=python&logoColor=white&style=flat-square)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white&style=flat-square)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=white&style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1.svg?logo=postgresql&logoColor=white&style=flat-square)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4.svg?logo=tailwindcss&logoColor=white&style=flat-square)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker&logoColor=white&style=flat-square)](https://docs.docker.com/compose/)

[![Modules](https://img.shields.io/badge/modules-11-6366F1?style=flat-square&logo=modin&logoColor=white)](#モジュール一覧)
[![E2E Specs](https://img.shields.io/badge/E2E_specs-64-22C55E?style=flat-square&logo=playwright&logoColor=white)](#テスト)
[![Unit Tests](https://img.shields.io/badge/unit_tests-479-10B981?style=flat-square&logo=pytest&logoColor=white)](#テスト)
[![Mypy strict](https://img.shields.io/badge/mypy-strict-2C5AA0?style=flat-square&logo=python&logoColor=white)](#テスト)
[![Status](https://img.shields.io/badge/status-pre--alpha-F59E0B?style=flat-square)](#プロジェクトステータス)
[![Version](https://img.shields.io/badge/version-0.1.0-6B7280?style=flat-square)](VERSION)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square&logo=github&logoColor=white)](CONTRIBUTING.md)

[![GitHub](https://img.shields.io/badge/GitHub-weed33834%2Fscholarhub-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/weed33834/scholarhub)
[![Docs](https://img.shields.io/badge/docs-full-0E7490?style=flat-square&logo=gitbook&logoColor=white)](#ドキュメント)
[![Security](https://img.shields.io/badge/security-policy-DC2626?style=flat-square&logo=dependabot&logoColor=white)](SECURITY.md)

**[概要](#概要) · [クイックスタート](#クイックスタート) · [アーキテクチャ](#アーキテクチャ) · [モジュール一覧](#モジュール一覧) · [テスト](#テスト) · [ドキュメント](#ドキュメント) · [コントリビュート](#コントリビュート)**

</div>

---

## 概要

ScholarHUB は、学術出版向けの**オピニオン付き・バッテリー同梱**な基盤です。*投稿 → 査読 → 採用 → 出版 → 閲覧 → 購読* というループを一つのコードベースで完結し、実際に動くウェブサイトに仕立てます。執筆ツールでも文献管理ソフトでもなく、著者・編集者・査読者・読者が実際にログインして使うプラットフォームです。

同じジャーナルの足場を毎回ゼロから組み直すチームを想定しています——研究室、学部、会議主催者、小規模な OA 出版者など、独自 CMS の再発明ではなく本物のプロダクトを求める人たちに向いています。

### 適したユースケース

- 研究室や学部がセルフホストのプレプリント + ジャーナル基盤を持ちたい
- 会議主催者が原稿収集 + 査読パイプラインを丸ごと必要としている
- 出版者が SaaS に縛られずオープンアクセス (OA) ジャーナルを小さく試したい
- 教育・慈善・政府機関などが、自ら完全に掌握できる出版プラットフォームを必要としている

### 三つのユーザー、三つのロール

ScholarHUB の全機能はこの三つのユーザーを中心に設計されています。

| ペルソナ | ScholarHUB でできること |
|---|---|
| **著者** | アカウント登録後、ログインして原稿を投稿(タイトル / 要旨 / 分野 / キーワード / DOI)、状態確認(保留中 / 査読中 / 採用 / 却下 / 出版済み)、改訂版アップロード、査読コメントへの返信、出版済み作品の一覧表示 |
| **編集者・査読者** *(管理者)* | 管理シェルから査読者を割り当て、招待の承諾・辞退、査読報告の提出、採用・却下、巻号の編成、採用原稿を「出版済み」に昇格、ユーザー・ロール管理、監査ログ閲覧 |
| **読者** | ログインなしで目録とメタデータを閲覧可能;ログイン後はブラウザ内で PDF を読み、デバイス間で閲読進捗を同期、個人読書リストを作成、著者・分野をフォロー、購読通知の受信、パーソナライズされた推薦の取得 |

### エンドツーエンドのワークフロー

原稿の投稿から読者のブックマークまで、すべてのステップが一つのプラットフォームで完結します。

<div align="center">
<img src="docs/assets/workflow.svg" alt="投稿 → 査読 → 出版ワークフロー" width="900" />
</div>

1. 著者が完全なメタデータを入力して原稿を投稿
2. 編集者が査読者を割り当て、査読者は承諾または辞退
3. 査読者が報告書を提出、著者は返答して改訂版をアップロード
4. 編集者が採用・却下を判断、採用された原稿は「出版済み」に昇格
5. 出版された原稿は目録に公開、ログイン済み読者は閲読・保存・フォロー・推薦の受け取りが可能

---

## モジュール一覧

各ドメイン能力は独立したモジュールで、core に触れずに有効化・置換・拡張できます。

| モジュール | 状態 | 概要 |
|---|:---:|---|
| `core` | ✓ shipped | テナント・ユーザー・ロール・モジュールレジストリ・管理シェル・デプロイ |
| `catalog` | ✓ shipped | 記事メタデータ・分野・著者・ジャーナル・巻号・タグ |
| `submission` | ✓ shipped | 投稿 → 編集者割当 → 査読 → 採用/却下 ワークフロー |
| `review` | ✓ shipped | OJS 風査読ワークフロー・報告書・査読者ロール管理 |
| `reader` | ✓ shipped | ブラウザ内 PDF リーダー・閲読進捗・デバイス間同期・アウトライン |
| `export` | ✓ shipped | BibTeX / RIS / CSV / JSON 引用エクスポート、往復対応 |
| `library` | ✓ shipped | ユーザー自身が整理する読書リスト |
| `follows` | ✓ shipped | 著者・分野のフォロー + 通知ファンアウト |
| `notifications` | ✓ shipped | アプリ内通知ストリーム、ユーザー単位で隔離 |
| `ingest` | ✓ shipped | BibTeX / RIS / CSV 一括インポート + Crossref / arXiv メタデータ取得 |
| `doi` | ✓ shipped | DataCite API による DOI マイニング・登録（設定で有効化） |
| `recommendations` | ✓ shipped | 閲読履歴に基づくパーソナライズ推薦 + 推薦理由 |

---

## アーキテクチャ

<div align="center">
<img src="docs/assets/architecture.svg" alt="ScholarHUB システムアーキテクチャ" width="900" />
</div>

### 二層テナント分離

すべてのドメインテーブルが `tenant_id` を持ちます:

1. **アプリケーション層** — すべての `SELECT` / `UPDATE` / `DELETE` で明示的に `Model.tenant_id == current_user.tenant_id` を付加
2. **データベース層** — PostgreSQL の RLS が `get_db()` で `SET LOCAL app.current_tenant_id = :tid` を実行。アプリケーション層でフィルタを書き漏らしても、データベースがテナント越えの行を拒否します

### モジュールレジストリ

起動時に `app.core.modules.load_all()` が依存順にすべてのモジュールを読み込み、ORM テーブルを `Base.metadata` に登録し、ルートを FastAPI アプリにマウントし、ヘルスチェックを `/health` レスポンスに追加します。新しいモジュールを追加するには `load_all()` に一行を加えるだけで、core のコード変更は不要です。

---

## 技術スタック

すべて主流かつ長期ホスティング可能な選択肢で、マイナーな依存関係はありません。

### バックエンド

| 層 | 選択 |
|---|---|
| 言語 | Python 3.12+(`async/await` + 完全な型ヒント) |
| フレームワーク | FastAPI 0.115+ |
| ORM | SQLAlchemy 2 (async) |
| マイグレーション | Alembic |
| データベース | PostgreSQL 17(主、Row Level Security 有効) |
| バリデーション | Pydantic 2 + pydantic-settings |
| 認証 | JWT access + httpOnly cookie refresh;PyJWT + bcrypt |
| SSO | authlib(OIDC: Google / GitHub / Generic / Keycloak) |
| HTTP クライアント | httpx |
| メール | 差し替え可能:console(dev)/ SMTP relay(Mailgun / SendGrid / SES / Postmark) |
| ログ | structlog(JSON 出力) |
| ツールチェーン | uv、ruff、mypy(strict)、pytest、pytest-asyncio、bandit、pip-audit |

### フロントエンド

| 層 | 選択 |
|---|---|
| フレームワーク | React 19 |
| 言語 | TypeScript 5.7 |
| ビルド | Vite 7 |
| ルーター | TanStack Router v1(file-based + autoCodeSplitting) |
| データ | TanStack Query v5 |
| 状態 | Zustand(auth store、sessionStorage + BroadcastChannel でタブ間ログアウト) |
| UI | shadcn/ui + Radix primitives、Tailwind CSS v4 |
| トースト | sonner |
| アイコン | lucide-react |
| ツールチェーン | ESLint、Vitest、TypeScript Project References、Playwright (E2E) |

### デプロイ

| 項目 | 選択 |
|---|---|
| コンテナ | Docker Compose(dev + prod) |
| TLS | Caddy(Let's Encrypt 自動取得) |
| データベース | PostgreSQL 17-alpine |
| イメージ | backend + frontend を同梱、バージョン漂移なし |

---

## クイックスタート

### 方法 1 — Docker Compose(推奨)

```bash
# 1. 強力なシークレットを生成
echo "SCHOLARHUB_SECRET_KEY=$(openssl rand -hex 32)" > .env
echo "SCHOLARHUB_ADMIN_PASSWORD=$(openssl rand -base64 18)" >> .env

# 2. dev スタックを起動(Postgres + backend + frontend)
docker compose -f infra/docker-compose.yml up --build

# 3. API ドキュメントと SPA を開く
xdg-open http://localhost:8000/docs
xdg-open http://localhost:5173
```

### 方法 2 — ローカルで直接実行(開発)

Python 3.12+、Node 20+、PostgreSQL 17 インスタンスが必要です。

```bash
# バックエンド
cd apps/backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# フロントエンド(別ターミナル)
cd apps/frontend
npm install
npm run dev
```

### 方法 3 — 本番デプロイ

```bash
# 1. 本番用 env を複製して記入
cp .env .env.prod
# 最低でも SCHOLARHUB_SECRET_KEY と SCHOLARHUB_ADMIN_PASSWORD を設定

# 2. infra/Caddyfile の scholarhub.example.com を自分のドメインに書き換え
# 3. 本番スタックを起動(Caddy が自動 TLS を提供)
docker compose -f infra/docker-compose.prod.yml \
  --env-file .env.prod up -d --build
```

> メール(Mailgun / SendGrid / SES / Postmark)と OIDC SSO(Google / GitHub / Keycloak)の統合は [docs/integrations.md](docs/integrations.md) を参照してください。

---

## プロジェクト構造

```
scholarhub/
├── README.md                      # 英語版(デフォルト)
├── README.zh.md                   # 簡体中文版
├── README.ja.md                   # 本ファイル(日本語)
├── CHANGELOG.md                   # 変更履歴
├── CONTRIBUTING.md                # コントリビューション手順
├── CODE_OF_CONDUCT.md             # 行動規範
├── SECURITY.md                    # セキュリティポリシー
├── SUPPORT.md                     # ヘルプ
├── LICENSE                        # Apache-2.0
├── VERSION                        # バージョンの単一ソース
├── apps/
│   ├── backend/                   # FastAPI サービス(base + modules)
│   │   ├── alembic/versions/      # モジュール別マイグレーション
│   │   ├── app/
│   │   │   ├── api/               # トップレベルルート(admin/auth/oidc/users/health/modules)
│   │   │   ├── core/              # 起動/設定/db/メール/テナンシー/tokens/security
│   │   │   ├── middleware/        # rate_limit / security_headers
│   │   │   └── modules/           # 10 個のドメインモジュール
│   │   ├── tests/                 # pytest + aiosqlite
│   │   └── pyproject.toml         # uv + ruff + mypy + bandit 設定
│   └── frontend/                  # React 19 SPA
│       ├── src/
│       │   ├── components/         # 汎用 UI(shadcn スタイル)
│       │   ├── hooks/api/         # モジュール別 React Query hooks
│       │   ├── lib/               # api client / auth store / types
│       │   └── routes/            # TanStack Router file-based ルート
│       └── package.json
├── docs/
│   ├── assets/                    # LOGO + アーキテクチャ + ワークフロー SVG
│   ├── ARCHITECTURE.md            # アーキテクチャ契約
│   └── integrations.md            # メール + OIDC 統合ガイド
├── infra/
│   ├── Dockerfile.backend         # バックエンドイメージ
│   ├── docker-compose.yml         # dev スタック
│   ├── docker-compose.prod.yml    # 本番スタック(Caddy 付き)
│   └── Caddyfile                  # TLS テンプレート
└── .github/
    ├── workflows/
    │   ├── ci.yml                  # ruff + mypy + pytest + frontend + gitleaks + CodeQL
    │   ├── release.yml             # タグ駆動 wheel + Docker イメージ + Release
    │   └── dependabot-auto-merge.yml
    ├── dependabot.yml             # 毎週 pip + npm + GHA + docker 依存更新
    ├── CODEOWNERS                 # コード所有権
    ├── SECURITY-MONITORING.md     # セキュリティ自動化レイヤー
    └── ISSUE_TEMPLATE/            # issue テンプレート
```

---

## 設定

すべての変数に `SCHOLARHUB_` プレフィックスが付きます。完全なリストは [`apps/backend/app/core/config.py`](apps/backend/app/core/config) に、主要なものを以下に示します:

| 環境変数 | 必須 | 説明 |
|---|:---:|---|
| `SCHOLARHUB_SECRET_KEY` | ✓ | JWT 署名キー、32 文字以上、`openssl rand -hex 32` で生成 |
| `SCHOLARHUB_PREVIOUS_SECRET_KEYS` | | ローテーションウィンドウ中の旧 JWT 署名キー(カンマ区切り) |
| `SCHOLARHUB_ADMIN_PASSWORD` | ✓ | 初回起動時の admin パスワード、12 文字以上 |
| `SCHOLARHUB_DATABASE_URL` | | PostgreSQL DSN、デフォルト `postgresql+asyncpg://scholarhub:scholarhub@localhost:5432/scholarhub` |
| `SCHOLARHUB_TENANCY_MODE` | | `single`(デフォルト)/ `multi`(host-header 解決、未実装) |
| `SCHOLARHUB_ENVIRONMENT` | | `development`(デフォルト)/ `staging` / `production` / `test` |
| `SCHOLARHUB_FRONTEND_BASE_URL` | | メール内ディープリンク用の SPA オリジン、例 `https://app.yourdomain.com` |
| `SCHOLARHUB_OIDC_ENABLED` | | `true` で OIDC SSO を有効化(`OIDC_*` 変数と併用); `/api/auth/oidc/providers` も参照 |
| `SCHOLARHUB_TOTP_ISSUER` | | TOTP 認証アプリに表示される発行者 (デフォルト `ScholarHUB`) |
| `SCHOLARHUB_REDIS_URL` | | 設定すると Redis レートリミットが有効、未設定時はメモリ(Redis エラー時は自動フォールバック) |
| `SCHOLARHUB_EMAIL_BACKEND` | | `console`(デフォルト)/ `smtp` |
| `SCHOLARHUB_CORS_ORIGINS` | | フロントエンドオリジンのカンマ区切りリスト |

完全なテンプレート: [`apps/backend/.env.example`](apps/backend/.env.example)。

---

## デフォルトのロールと権限

`core` は起動時に以下のロールを自動作成します(管理シェルから割当可能):

| ロール slug | できること |
|---|---|
| `admin` | 全操作、管理シェル・ユーザー管理・監査ログ含む |
| `editor` | 査読者割当、巻号編成、採用・却下、「出版済み」への昇格 |
| `reviewer` | 割り当てられた原稿の閲覧、査読報告の提出 |
| `author` | 原稿投稿、自分の状態確認、改訂版アップロード |
| `member` | 閲読、保存、フォロー、パーソナライズ推薦の閲覧 |

---

## テスト

### ユニット + 統合

```bash
# バックエンド: lint + type + test
cd apps/backend
uv run ruff check .
uv run mypy app
uv run pytest -q

# バックエンド: RLS 分離テスト(実際の PostgreSQL が必要)
SCHOLARHUB_DATABASE_URL=postgresql+asyncpg://... uv run pytest tests/test_rls_isolation.py -v

# フロントエンド
cd apps/frontend
npm run lint
npm run typecheck
npm run build
npm run test
```

### E2E テスト

12 個の spec ファイル（64 個の Playwright test()）が完全なユーザージャーニーをカバーし、実際のブラウザクリックで各主フローを検証します:

```bash
# バックエンドを起動(テストモード: SQLite + rate_limit スキップ)
cd apps/backend
uv run python e2e_run_server.py &

# フロントエンド dev server を起動
cd ../frontend
npm run dev &

# 全 E2E を実行
npx playwright test
```

カバレッジ:

- 管理者によるリソース CRUD + ユーザー管理 + ロール割当
- 著者登録 / ログイン / メール認証 / 投稿 / 再投稿 / 原稿アップロード
- 査読者の承諾・辞退 + 査読報告の提出
- 読者の閲読進捗同期(デバイス間シミュレーション)/ 読書リスト CRUD / 著者フォロー / 分野購読
- 通知センター / 推薦エンジン / 引用エクスポート(BibTeX / RIS / CSV / JSON)
- ゲストの目録閲覧 / 詳細ページ
- Crossref インポート / パース

CI ワークフロー: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)。

---

## プロジェクトステータス

**バージョン**: `0.1.0-alpha` · **状態**: pre-alpha

10 個のモジュールすべてを出荷済み。バックエンド + フロントエンド + DB マイグレーション + ユニットテスト + E2E テスト + デプロイがすべて揃っています。今後の予定:

- [x] 二要素認証 (TOTP) — shipped
- [x] JWT キーローテーション (オンライン, 無停止) — shipped
- [x] Redis 分散レートリミット (メモリ降格付き) — shipped
- [x] GDPR エンドポイント (エクスポート + ソフト削除 + 30 日復元) — shipped
- [x] OIDC provider discovery エンドポイント + PKCE 強制 — shipped
- [x] CI: ruff + mypy + pytest + frontend lint/typecheck/build + gitleaks + CodeQL + pip-audit — shipped
- [x] CSRF 二重送信 cookie — shipped
- [x] RFC 7807 形式エラー応答 — shipped
- [x] ORCID iD フィールド (ユーザー + 著者メタデータ) — shipped
- [x] 学科/サブ学科 ontology テーブル — shipped
- [x] Crossref リッチ化 (出版社/雑誌略称/巻/号/ページ/ISSN) — shipped
- [x] プライバシーページ + cookie consent banner + 保持ポリシー — shipped
- [ ] マルチテナントモードの実装(host-header → テナントマッピングテーブル)
- [ ] refresh token の明示的 denylist
- [ ] WebAuthn / passkeys による TOTP 2FA の代替
- [ ] 高度な巻号管理 UI
- [x] DOI 登録（DataCite、`doi` モジュール。`SCHOLARHUB_DATACITE_*` の設定で有効化）— shipped
- [ ] DOI 相互リンクと表示
- [ ] フルテキスト検索(PostgreSQL FTS または Meilisearch)
- [ ] ファイルストレージをローカルから S3 に切替
- [ ] ワークフロー可視化(投稿 → 査読 → 採用)

---

## ドキュメント

- [アーキテクチャ契約](docs/ARCHITECTURE.md) — モジュール依存、テナント分離、モジュールレジストリ、マイグレーション戦略
- [メール / OIDC 統合](docs/integrations.md) — Mailgun / SendGrid / SES / Postmark + Google / GitHub / Keycloak
- [コントリビュート](CONTRIBUTING.md) — ブランチ命名、コミット規約、PR チェックリスト
- [セキュリティポリシー](SECURITY.md) — 脆弱性報告、組み込みのセキュリティ層、ローカルツール
- [行動規範](CODE_OF_CONDUCT.md)
- [ヘルプ](SUPPORT.md)
- [変更履歴](CHANGELOG.md)

---

## コントリビュート

issue と PR を歓迎します:

- **GitHub**: https://github.com/weed33834/scholarhub

手順と規約は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

---

## リポジトリ

本リポジトリは以下でホストされています:

- **GitHub**: https://github.com/weed33834/scholarhub

---

## ライセンス

Copyright © 2026 badhope. [Apache License 2.0](LICENSE) の下で公開されています。

Apache License 2.0 の条項に従う限り、本ソフトウェアの使用・変更・配布が自由に行えます。詳細はライセンス本文および [NOTICE](NOTICE) ファイルを参照してください。
