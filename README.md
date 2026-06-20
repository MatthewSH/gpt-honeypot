# GPT Honeypot 🍯

Discord trap-channel bot built with TypeScript, Bun, discord.js, SQLite, and a small built-in analytics dashboard.

## Core model

- Server state is `enabled` or `disabled`.
- Removal action is only `softban` or `ban`.
- No timeout or kick modes.
- No username persistence; stable IDs only.
- Multiple decoy channels are first-class.
- Per-server allowlists are first-class.
- Dashboard metrics separate all trigger events from successful catches.
- Staff evidence is a forwarded copy in the log channel when possible.

## Quick start

```bash
bun install
cp .env.example .env
bun run commands:sync
bun run start
```

Set `GUILD_ID` for fast test-server command sync.

## Environment

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here
GUILD_ID=
DATABASE_PATH=data/gpt-honeypot.sqlite
DEFAULT_ACTION=softban
HONEYPOT_CHANNEL_NAMES=read-me-first,rules-check,verify-here,start-here
TRAP_SLOWMODE_SECONDS=5
DRY_RUN=false
IGNORE_DISCORD_BOTS=true
DELETE_MESSAGE_SECONDS=3600
DASHBOARD_ENABLED=false
DASHBOARD_TOKEN=change-me
DASHBOARD_HOST=0.0.0.0
DASHBOARD_PORT=3000
```

## Commands

```text
/honeypot setup [channel] [log-channel] [action] [decoys]
/honeypot status
/honeypot stats
/honeypot enable
/honeypot disable
/honeypot action <softban|ban>
/honeypot log <channel>
/honeypot channels add <channel>
/honeypot channels create <count>
/honeypot channels remove <channel>
/honeypot channels list
/honeypot allowlist add <user>
/honeypot allowlist remove <user>
/honeypot allowlist list
```

## Dashboard

Enable it with `DASHBOARD_ENABLED=true` and `DASHBOARD_TOKEN=...`.

Open `http://localhost:3000/?key=TOKEN` for local use, or send `x-dashboard-token: TOKEN` from a reverse proxy.

Endpoints:

```text
/api/summary
/api/guilds
/api/events?limit=50
```

## Launch flow

1. Invite the bot with `Manage Channels`, `Send Messages`, `Read Message History`, and `Ban Members`.
2. Start with `DRY_RUN=true`.
3. Run `bun run commands:sync`.
4. Run `/honeypot setup decoys:3`.
5. Set logs with `/honeypot log`.
6. Add test users with `/honeypot allowlist add`.
7. Verify warning posts, forwarded evidence, dashboard totals, and allowlist behavior.
8. Turn off dry-run.

## Docker

```bash
docker build -t gpt-honeypot .
docker run --env-file .env -p 3000:3000 -v gpt-honeypot-data:/app/data gpt-honeypot
```
