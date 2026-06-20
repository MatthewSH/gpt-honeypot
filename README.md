# GPT Honeypot 🍯

A lean Discord honeypot bot built with TypeScript, Bun, discord.js, and SQLite.

GPT Honeypot creates a visible warning channel, watches for posts there, records events, and lets staff choose a server action mode.

## Features

- Bun runtime with strict TypeScript.
- SQLite storage using Bun's built-in driver.
- Slash commands for setup, status, channel selection, logs, enable, disable, and mode changes.
- Modes: `timeout`, `kick`, `softban`, `ban`, or `disabled`.
- Guardrails: warning post, server-owner protection, permission checks, webhook ignore, duplicate-event cooldown, dry-run mode, and optional bot ignore.
- Staff logs with forwarded evidence when a log channel is configured.
- Event data model ready for a dashboard, analytics, and paid tiers.

## Quick start

```bash
bun install
cp .env.example .env
bun run commands:sync
bun run start
```

Set `GUILD_ID` while developing to sync commands to one test server instantly. Remove it for global command rollout.

Start in a private test server with `DRY_RUN=true`.

## Environment

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here
GUILD_ID=
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
2. Set `DRY_RUN=true`.
3. Run `bun run commands:sync`.
4. Run `/honeypot setup`.
5. Set a staff log channel with `/honeypot log`.
6. Test the trap.
7. Switch to the preferred mode after permissions and role order are verified.

## Roadmap

- Hosted dashboard.
- Per-server allowlists.
- Multi-channel decoys.
- Evidence retention.
- Cross-server analytics.
- One-click onboarding for managed communities.
