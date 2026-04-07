# REMi — Project Rules

## Security Gate (HARD RULES — NEVER VIOLATE)

This is a **public** GitHub repo (`crn13b/remi`). Before ANY `git add`, `git commit`, `git push`, or PR creation, you MUST verify the staged changes do not contain or reveal any of the following. If a check fails, STOP and tell the user — do not commit.

### 1. Proprietary Trading & Scoring Logic — NEVER COMMIT
- Anything from `~/remi-engine/` or sourced via `REMI_ENGINE_SRC`
- `supabase/functions/_shared/remi-score/engines/` (gitignored — verify it stays that way)
- `components/founder/` (gitignored — verify it stays that way)
- Divergence detection algorithms, RSI anchor logic, reset thresholds, tracking windows
- Score → sentiment band thresholds, divergence strength formulas, scoring weights
- Backtest results, parameter tuning data, performance metrics of strategies
- Indicator weights, signal generation rules

### 2. Secrets & Credentials — NEVER COMMIT
- Any `.env*` file except `.env.example` (must contain only dummy values)
- API keys: Twelve Data, Binance, GeckoTerminal, OpenAI, Anthropic, Stripe, etc.
- Supabase service role key, JWT secrets, anon keys
- DB connection strings, passwords, OAuth client secrets
- Webhook signing secrets, deploy keys, SSH private keys
- `.npmrc` / `.pypirc` with auth tokens

### 3. Infrastructure Identifiers — NEVER COMMIT
- Supabase project ref / project URL (use `<project-ref>` placeholder in docs)
- Cron job IDs, webhook URLs not meant to be public
- Internal hostnames, IPs, S3 bucket names, cloud account IDs
- Internal filesystem paths that reveal repo structure (e.g. `~/remi-engine/src`)

### 4. Business & Financial Data — NEVER COMMIT
- Revenue numbers, MRR, user counts, churn, retention
- Pricing experiments not yet public
- Customer lists, email lists, user IDs, wallet addresses
- Stripe customer IDs, transaction logs
- Cost structure, infra spend, runway

### 5. User & PII Data — NEVER COMMIT
- Real emails, names, wallet addresses tied to users
- Session tokens or cookies in test fixtures
- Real user data in seed files or test snapshots
- Playwright auth state files

### 6. Internal Docs & Planning — NEVER COMMIT
- Roadmaps with unreleased features
- Investor decks, financial models
- Security audits, pen test results, vulnerability lists
- Incident postmortems with sensitive context
- Customer support tickets with PII

## Pre-Commit Checklist (run mentally before every commit)

1. Run `git diff --cached` and scan for: API keys, project refs, hardcoded paths under `~/remi-engine`, scoring formulas, threshold numbers tied to scoring bands, revenue/user metrics
2. Verify no file under `components/founder/`, `supabase/functions/_shared/remi-score/engines/`, or any `.env*` (except `.env.example`) is staged
3. Verify `.gitignore` still ignores: `.env*`, `components/founder/`, `supabase/functions/_shared/remi-score/engines/`, `.worktrees/`, `.claude/`, `docs/superpowers/`
4. If touching `docs/`, scan for hardcoded project refs, real URLs, real keys
5. If touching `scripts/`, scan for hardcoded internal paths

## If a Check Fails

- STOP. Do not commit.
- Tell the user exactly what failed and where.
- Suggest the fix (placeholder, env var, gitignore addition, etc.).
- Wait for user confirmation before proceeding.

## Reminders

- PR refs (`refs/pull/N/head`) survive branch deletion. Force-push does NOT scrub leaked secrets — rotation is the only real fix.
- Two-codebase split: `~/remi/` is public, `~/remi-engine/` is private local-only. Never reference `remi-engine` paths in committed files.
- The `remi-engine-stub/` directory in this repo is the public-safe placeholder. Never replace stub values with real engine values.
- The deploy script and superpowers planning docs live in `~/remi-private-docs/`, NOT in this repo.
- Score → sentiment label thresholds in `supabase/functions/_shared/remi-score/engine.ts` (`scoreToSentiment`, `scoreToColor`) are intentionally public — they only map the final score to a display label, not engine internals.

## Enforcement Layers (in order of strength)

1. **GitHub Push Protection** — server-side, blocks pushes containing known secret patterns. Already enabled.
2. **Branch protection on `main`** — no force pushes, no deletions, PR-only merges. Already enabled.
3. **GitHub Actions security workflow** (`.github/workflows/security.yml`) — runs gitleaks + forbidden-path check on every PR and push to main. Cannot be bypassed by `--no-verify`.
4. **Local pre-commit hook** (`.git/hooks/pre-commit`) — blocks secrets, forbidden paths, and proprietary patterns before commit. Bypassable with `--no-verify` (avoid).
5. **`.gitleaks.toml`** — defines all custom REMi-specific detection rules.
6. **`.gitignore`** — blocks files from being staged at all.
7. **This file (`CLAUDE.md`)** — instructs AI sessions to verify before committing.
