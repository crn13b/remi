# REMi

REMi is a real-time crypto confidence scoring dashboard. It monitors market conditions around the clock and alerts you when high-probability setups emerge — so you don't have to watch charts all day.

## What it does

- **Confidence Score** — a 0–100 score for any crypto asset, updated every minute, based on proprietary technical analysis
- **Alerts** — set score thresholds and get notified via Discord, Telegram, or email when the market enters actionable territory
- **Multi-asset watchlist** — track multiple assets simultaneously with live score updates
- **Escalating urgency** — notifications get louder as conviction increases (Warning → High → Critical)

## Tech stack

- **Frontend** — React + TypeScript + Tailwind CSS, built with Vite
- **Backend** — Supabase (Postgres, Auth, Edge Functions)
- **Notifications** — Discord bot, Telegram bot, Resend (email)
- **Payments** — Stripe

## Getting started

```bash
git clone https://github.com/crn13b/remi.git
cd remi
npm install
cp .env.example .env  # add your Supabase project URL and anon key
npm run dev
```

You'll need a Supabase project with the migrations applied:
```bash
npx supabase db push
```

## Project structure

```
components/     React UI components
services/       API clients and service layer
supabase/
  functions/    Edge functions (score-api, evaluate-alerts, notifications)
  migrations/   Database schema
docs/           Design specs and implementation plans
```

## Contributing

This repo is open for security review and contributions. The proprietary scoring engine runs server-side only and is not included in this repository — the `score-api` edge function returns scores as JSON without exposing the underlying logic.

Open an issue or submit a PR against the `dev` branch.

## License

All rights reserved. This source code is made available for security audit and review purposes.
