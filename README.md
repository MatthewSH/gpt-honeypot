# GPT Honeypot 🍯

A focused Discord honeypot bot built with TypeScript, Bun, discord.js, and SQLite.

GPT Honeypot creates one or more obvious trap channels. If an account posts in a trap, the bot records one idempotent event and performs the configured removal action.

## Design rules

- The trap should remove spam accounts, not babysit them.
- No timeout or kick modes. They are weak for this use case and create noisy retry/rejoin behavior.
- No username persistence. User IDs are stable; usernames are display data.
- Multiple trap channels are first-class, not a future idea.
- Counts separate total events from successful catches.
- SQLite is the default single-process store. Add Redis only when a real distributed/sharded runtime needs it.

## Features

- Bun runtime with strict TypeScript.
- SQLite storage using Bun's built-in driver.
- Multi-channel trap model.
- Slash commands for setup, status, trap channel management, logs, enable/disable, and action changes.
- Actions: `softban`, `ban`, or `disabled`.
- Guardrails: visible warning posts, server-owner protection, permission checks, webhook ignore, idempotent event claiming, dry-run mode, and optional bot ignore.
- Staff logs with message evidence links and optional Discord forwarding.
- Guild command sync for instant local testing.

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
DELETE_MESSAGE_SECONDS=3600
```

## Commands

```text
/honeypot setup [channel] [log-channel] [action]
/honeypot status
/honeypot stats
/honeypot enable
/honeypot disable
/honeypot action <softban|ban|disabled>
/honeypot log <channel>
/honeypot channels add <channel>
/honeypot channels remove <channel>
/honeypot channels list
```

## Launch flow

1. Invite the bot to a test server with `Manage Channels`, `Send Messages`, `Read Message History`, and `Ban Members`.
2. Set `DRY_RUN=true`.
3. Run `bun run commands:sync`.
4. Run `/honeypot setup`.
5. Add more traps with `/honeypot channels add`.
6. Set staff logs with `/honeypot log`.
7. Verify warning posts and logs.
8. Turn off dry-run and choose `softban` or `ban`.

## Docker

```bash
docker build -t gpt-honeypot .
docker run --env-file .env -v gpt-honeypot-data:/app/data gpt-honeypot
```
