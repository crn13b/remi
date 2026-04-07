# REMi Alerts System

> **Status:** Live — fully operational
> **Last Updated:** 2026-04-02
> **Location in app:** Dashboard → Alerts view (`ViewType.ALERTS`)

---

## Summary

REMi's alerts system monitors asset confidence scores every 60 seconds and notifies users when scores cross actionable thresholds (70+ for longs, 30- for shorts). Notifications are delivered via three channels — **email** (Resend), **Discord** (bot channel message), and **Telegram** (bot DM) — all controllable with toggles in the alerts settings page. Alert urgency escalates automatically as scores become more extreme (Warning → High → Critical), and a single aggressiveness slider controls how persistent reminders are.

Two evaluation systems run in parallel:
- **Frontend loop** (App.tsx) — runs every 60s while the app is open, detects crossings, inserts events into the in-app feed
- **Edge function** (`evaluate-alerts`) — runs every 60s via external cron (cron-job.org), detects crossings, inserts events, AND dispatches external notifications (email/Discord/Telegram)

The edge function is the only path that sends external notifications. The frontend loop powers the in-app feed for real-time UI updates.

---

## How Alerts Work

### Score Evaluation

- The REMi scoring engine runs on the backend (no external API cost)
- Scores for all actively-alerted assets are re-evaluated every 60 seconds
- When a score crosses into a threshold zone, the alert fires

### Alert Modes

**Asset Watch Alert**
The user selects an asset and a direction:
- **Long** — alert on high confidence scores (bullish setups), triggers at 70+
- **Short** — alert on low confidence scores (bearish warnings), triggers at 30-
- **Both** — alert in either direction

**Patience Nudge**
When alerts are active but scores stay in the neutral zone (31–69), REMi sends periodic nudges to reassure users the system is watching. Frequency is configurable: daily, every 12h, every 6h, or off.

---

## Urgency Tiers

Alerts escalate automatically based on score extremity:

| Score Range (Long) | Score Range (Short) | Urgency Level | Label in Notifications | Meaning |
|---------------------|----------------------|---------------|----------------------|---------|
| 70–79 | 21–30 | **Warning** | Nudge | "Start paying attention" — conditions are forming |
| 80–89 | 11–20 | **High** | Warning | "This is serious" — strong setup developing |
| 90–100 | 0–10 | **Critical** | Urgent | "Don't miss this" — extreme conviction, rare event |

Scores in the 31–69 range are the **quiet zone** — no alert fires (only patience nudges if enabled).

### Event Types

| Event Type | When It Fires |
|------------|--------------|
| `trigger` | Score enters an alert zone for the first time |
| `escalation` | Score moves up to a higher urgency tier (e.g., Warning → High) |
| `de_escalation` | Score drops back to a lower tier (e.g., Critical → High) |
| `all_clear` | Score returns to the quiet zone |
| `patience_nudge` | Score stays in neutral zone, periodic reassurance |

---

## Aggressiveness Slider

A single slider controls how persistent REMi is — the primary UX control for alerts.

```
🔇 ─────────────────────────── 📢
   Chill       Default       Aggressive      Relentless
```

### Repeat Intervals (when score stays in same tier)

| Preset | Repeat Interval |
|--------|----------------|
| **Chill** | 24 hours (1440 min) |
| **Default** | 6 hours (360 min) |
| **Aggressive** | 2 hours (120 min) |
| **Relentless** | 30 minutes |

- Default for new users: "Default"
- Users can set aggressiveness per alert (overrides global setting)
- Escalation/de-escalation/all_clear events fire regardless of repeat interval

---

## Notification Channels

Three delivery channels, each independently toggleable in the alerts settings page:

| Channel | Provider | How It Works | Config |
|---------|----------|-------------|--------|
| **Email** | Resend API | Sends to user's auth email | `RESEND_API_KEY` secret, from address: `REMi Alerts <onboarding@resend.dev>` |
| **Discord** | Discord Bot API | Posts to a configured channel (falls back to DM if no channel set) | `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` secrets |
| **Telegram** | Telegram Bot API | Sends DM via bot | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` secrets |

### Channel Linking Flows

- **Email** — automatically available via Supabase auth email
- **Discord** — OAuth popup flow: user clicks Connect → Discord OAuth → callback saves tokens + Discord user ID to `user_connections` → bot can now message them. Channel ID stored in `notification_preferences.discord_channel_id`
- **Telegram** — Linking code flow: app generates a code → user sends `/start <code>` to `@remilalertsbot` → webhook validates and links chat ID to `user_connections`

### Toggle Persistence

All toggles (`email_enabled`, `discord_enabled`, `telegram_enabled`) persist immediately to `notification_preferences` in Supabase via `upsertNotificationPrefs()`. The edge function reads these flags before dispatching — turning off a channel stops notifications for that channel on the next evaluation cycle.

---

## Architecture

### Evaluation Pipeline

```
cron-job.org (every 60s)
    │
    ▼
POST /functions/v1/evaluate-alerts (Supabase Edge Function)
    │
    ├── 1. Load all active alerts from DB
    ├── 2. Load notification preferences + user connections for all alert owners
    ├── 3. Load user emails from Supabase Auth
    ├── 4. Fetch live REMI scores for all symbols (getBatchScores)
    ├── 5. Detect threshold crossings (detectCrossings)
    ├── 6. Find repeat notifications due (findRepeatsDue)
    ├── 7. For each crossing/repeat:
    │       ├── Insert alert_event into DB
    │       ├── Send email (if enabled)
    │       ├── Send Discord message (if enabled)
    │       └── Send Telegram message (if enabled)
    └── 8. Update last_score / last_notified_at for all alerts
```

### Frontend Loop (App.tsx)

Runs every 60s while the app is open. Handles:
- Threshold crossing detection → inserts `alert_events` for the in-app feed
- Score tracking → updates `last_score` on alerts
- Patience nudge evaluation
- Does NOT send external notifications

### Edge Functions

| Function | Path | JWT | Purpose |
|----------|------|-----|---------|
| `evaluate-alerts` | `/functions/v1/evaluate-alerts` | Required (anon key) | Score evaluation + notification dispatch |
| `discord-oauth-callback` | `/functions/v1/discord-oauth-callback` | Disabled | Handles Discord OAuth redirect |
| `telegram-webhook` | `/functions/v1/telegram-webhook` | Disabled | Handles Telegram bot `/start` command |

### External Services

| Service | Purpose | Cost |
|---------|---------|------|
| **Resend** | Email delivery | Free tier: 3,000 emails/mo |
| **Discord Bot** | Channel/DM notifications | Free |
| **Telegram Bot** | DM notifications | Free |
| **cron-job.org** | Triggers evaluate-alerts every 60s | Free tier |

---

## Database Schema

### `alerts` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| user_id | uuid, FK → profiles | |
| symbol | text | e.g., 'BTC', 'AAPL' |
| direction | enum: 'long', 'short', 'both' | |
| aggressiveness | enum: 'chill', 'default', 'aggressive', 'relentless' | default: 'default' |
| is_active | boolean | default: true |
| last_triggered_at | timestamptz | null until first trigger |
| last_score | int | updated every 60s evaluation |
| last_notified_at | timestamptz | tracks when last external notification was sent |
| created_at | timestamptz | |

Indexes: `(is_active, symbol)` for fast filtering.

### `alert_events` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| alert_id | uuid, FK → alerts | nullable (null for patience nudges) |
| user_id | uuid, FK → profiles | denormalized for fast queries |
| symbol | text | |
| score | int | score at time of trigger |
| previous_score | int | score before this trigger |
| urgency | enum: 'warning', 'high', 'critical' | |
| event_type | enum: 'trigger', 'escalation', 'de_escalation', 'all_clear', 'patience_nudge' | |
| direction | enum: 'long', 'short' | |
| message | text | human-readable alert message |
| read | boolean | default: false |
| dismissed | boolean | default: false |
| triggered_at | timestamptz | |

Indexes: `(user_id, read)`, `(user_id, triggered_at desc)`.

### `notification_preferences` table

| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid, PK, FK → profiles | |
| global_aggressiveness | enum | default: 'default' |
| email_enabled | boolean | default: true |
| discord_enabled | boolean | default: false |
| discord_channel_id | text | Discord channel ID for bot messages (null = fall back to DM) |
| telegram_enabled | boolean | default: false |
| digest_enabled | boolean | default: false |
| digest_time | time | default: '08:00' |
| timezone | text | default: 'America/New_York' |
| nudge_enabled | boolean | default: true |
| nudge_frequency | enum: 'daily', 'every_12h', 'every_6h', 'off' | default: 'daily' |
| nudge_time | time | default: '10:00' |

### `user_connections` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| user_id | uuid, FK → profiles | |
| provider | text: 'discord', 'telegram', 'email' | |
| provider_user_id | text | Discord user ID or Telegram chat ID |
| provider_username | text | Display name (e.g., 'imcryptochino') |
| access_token | text | OAuth token (Discord) or linking code (Telegram) |
| refresh_token | text | Discord OAuth refresh token |
| expires_at | timestamptz | Token expiration |
| status | text: 'active', 'needs_reauth' | |
| connected_at | timestamptz | |

Unique constraint: `(user_id, provider)`.

All tables have RLS policies — users can only access their own data. Service role policies exist for edge function access.

---

## File Structure

### Frontend

```
components/alerts/
├── AlertsPage.tsx            -- main alerts view, settings panel, channel toggles
├── AlertCard.tsx             -- single triggered alert event card
├── AlertFeed.tsx             -- scrollable list of alert events
├── AlertForm.tsx             -- create/edit alert modal with asset search
├── AlertEmptyState.tsx       -- hero onboarding state with animated score circle
├── AlertTutorial.tsx         -- interactive guided tour with spotlight
├── AggressivenessSlider.tsx  -- slider control (0-4 steps) with behavior preview
├── AlertManageList.tsx       -- list of configured alerts (toggle/edit/delete)
├── types.ts                  -- Alert, AlertEvent, NotificationPreferences, UserConnection, etc.
└── constants.ts              -- thresholds, preset configs, urgency styles, demo data

services/
└── alertService.ts           -- Supabase CRUD, threshold detection, nudge evaluation
```

### Backend (Supabase Edge Functions)

```
supabase/functions/
├── evaluate-alerts/index.ts           -- main cron function: score check + notification dispatch
├── discord-oauth-callback/index.ts    -- Discord OAuth redirect handler
├── telegram-webhook/index.ts          -- Telegram /start command handler
└── _shared/
    ├── alert-evaluation/
    │   ├── evaluate.ts                -- detectCrossings(), findRepeatsDue()
    │   └── intervals.ts              -- repeat intervals by aggressiveness preset
    ├── notifications/
    │   ├── discord.ts                 -- sendDiscordChannelMessage(), sendDiscordDM(), refreshDiscordToken()
    │   ├── telegram.ts               -- sendTelegramMessage()
    │   └── resend.ts                 -- sendEmail()
    └── remi-score/
        └── engine.ts                  -- getBatchScores() for edge function use
```

### Migrations

```
supabase/migrations/
├── 20260314180000_alerts.sql                              -- alerts, alert_events, notification_preferences, RLS
├── 20260315120000_patience_nudge.sql                      -- patience_nudge event type, nudge prefs columns
├── 20260315200000_user_connections_and_notifications.sql   -- user_connections table, discord/telegram columns
└── 20260402170000_discord_channel_id.sql                  -- discord_channel_id column on notification_preferences
```

---

## Secrets & Environment Variables

All stored as Supabase Edge Function secrets:

| Secret | Purpose |
|--------|---------|
| `RESEND_API_KEY` | Email delivery via Resend |
| `DISCORD_BOT_TOKEN` | Discord bot authentication |
| `DISCORD_CLIENT_ID` | Discord OAuth client |
| `DISCORD_CLIENT_SECRET` | Discord OAuth secret |
| `TELEGRAM_BOT_TOKEN` | Telegram bot authentication |
| `TELEGRAM_WEBHOOK_SECRET` | Validates incoming Telegram webhook requests |
| `APP_URL` | Base URL for "View Dashboard" links in notifications |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role for admin DB access in edge functions |

Frontend `.env`:
- `VITE_DISCORD_CLIENT_ID` — used for OAuth popup URL
- `VITE_TELEGRAM_BOT_USERNAME` — used for Telegram linking flow

---

## Cron Setup

The `evaluate-alerts` edge function is triggered by an external cron service:

- **Provider:** cron-job.org
- **Interval:** Every 1 minute
- **URL:** `https://<project-ref>.supabase.co/functions/v1/evaluate-alerts`
- **Method:** POST
- **Required Header:** `Authorization: Bearer <anon JWT>`
- **Expiry:** 2037

The anon JWT is required because Supabase Edge Functions enforce JWT verification by default. The function itself uses the service role key internally for DB operations.

---

## Known Considerations

- **Duplicate events:** Both the frontend loop and the edge function detect crossings independently. If the app is open when a crossing occurs, the feed may show duplicate events. External notifications are only sent by the edge function, so no duplicate emails/Discord/Telegram.
- **Email sender:** Currently using Resend's default `onboarding@resend.dev` sender address. Should be updated to a custom domain for production.
- **Watchlist Digest:** Specced but not yet implemented. Planned as Pro/Founder feature.
- **Notification Bell / Critical Banner:** Not yet implemented as separate components. Alert feed lives on the alerts page.
- **Tier gating:** Not yet enforced. All features currently available to all users.
