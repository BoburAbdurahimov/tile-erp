# Kafel Zavodi ERP

ERP for a ceramic tile factory: warehouses, cash, production lines, counterparties,
purchasing, sales, finance (PnL) and payroll. FastAPI backend, static JS frontend,
plus a Telegram bot and Mini App.

## Running locally

Requires Python 3.12+.

```bash
pip install -r requirements.txt
cp .env.example .env      # then fill in TELEGRAM_BOT_TOKEN and DATABASE_URL
python run.py
```

`run.py` starts the web server and the Telegram bot together. Without a reachable
`DATABASE_URL` the app falls back to a local SQLite file (`tile_erp.db`).

- Dashboard: http://127.0.0.1:8000
- API docs: http://127.0.0.1:8000/docs

## Environment

See `.env.example`. `.env` is gitignored and must never be committed.

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather. No default - the bot is skipped if unset. |
| `DATABASE_URL` | Postgres connection string. Falls back to SQLite if unreachable. |
| `WEBAPP_HTTPS_URL` | Public HTTPS URL serving `/webapp`, for the Mini App button. |
| `BOT_READ_ONLY` | `1` (default) = bot is view-only. `0` re-enables the entry wizards. |
| `TELEGRAM_POLLING` | `1` = `run.py` also runs the bot by long polling (local testing only). |

## The Telegram bot

The bot runs on Vercel with the web app, through a **webhook**: Telegram sends
each message to `/api/telegram/webhook` and the bot answers it there with the
`TELEGRAM_BOT_TOKEN` set in Vercel. Nothing else needs to stay running.

- The production deployment points the webhook at itself on start-up. An Admin
  can also see the bot's state and connect it from Foydalanuvchilar -> Telegram.
- Only Telegram can call the webhook: it sends a secret derived from the token.
- Wizard steps a user is in the middle of are kept in the `telegram_bot_state`
  table, since each message may be handled by a different server.
- Long polling (`TELEGRAM_POLLING=1 python run.py`) removes the webhook, which
  takes the live bot off the site - use it only with a separate test bot.

The bot is read-only by default: it reports stock, cash, production, balances,
finance and payroll, and the entry buttons point to the web app, whose rules
(Ombor access, month closing, balances) the old bot wizards do not follow.
`BOT_READ_ONLY=0` brings the cash, production and Ombor entry wizards back.

## Deployment

The web app and Mini App deploy to Vercel via its native FastAPI support. The
entrypoint is declared in `pyproject.toml`:

```toml
[tool.vercel]
entrypoint = "backend.main:app"
```

Pushes to `main` deploy automatically. Set `DATABASE_URL` in the Vercel project
environment (the Neon integration does this for you).

Note: do not add an `api/index.py` shim with a catch-all rewrite. Vercel's
`rewrites` replaces the request path, so the app receives `/api/index` for every
URL and returns 404 for everything.
