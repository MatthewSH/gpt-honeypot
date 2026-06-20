# GPT Honeypot 🍯

A lean Discord honeypot bot built with TypeScript and Bun.

GPT Honeypot creates a visible warning channel, watches for posts there, records events in SQLite, and lets staff choose a server moderation mode.

## Features

- Bun runtime with TypeScript.
- SQLite storage using Bun's built-in driver.
- Slash commands for setup, status, channel selection, logs, enable, disable, and mode changes.
- Modes: `timeout`, `kick`, `softban`, `ban`, or `disabled`.
- Guardrails: warning post, server-owner protection, webhook ignore, duplicate-event cooldown, dry-run mode, and optional Discord-bot ignore.
- Staff logs with forwarded evidence when a log channel is configured.
- Event data model ready for a dashboard, analytics, and paid tiers.

## Quick start

```bash
bun install
cp .env.example .env
bun run commands:sync
bun run start
```

Start in a private test server with `DRY_RUN=true`.

## Environment

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here
DATABASE_PATH=data/gpt-honeypot.sqlite
DEFAULT_ACTION=softban
HONEYPOT_CHANNEL_NAME=read-me-first
DRY_RUN=false
IGNORE_DISCORD_BOTS=true
TIMEOUT_MINUTES=60
DELETE_MESSAGE_SECONDS=3600
```

## Launch flow

1. Invite the bot to a test server.
2. Run `bun run commands:sync`.
3. Run `/honeypot setup`.
4. Set a private staff log channel with `/honeypot log`.
5. Test in dry-run mode.
6. Enable your preferred mode after permissions and role order are verified.

## Roadmap

- Hosted dashboard.
- Per-server allowlists.
- Multi-channel decoys.
- Evidence retention.
- Cross-server analytics.
- One-click onboarding for managed communities.
