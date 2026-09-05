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

## The Telegram bot is read-only

The bot reports stock, cash, production, balances, finance and payroll. It does not
create or edit records - that happens in the web app. Set `BOT_READ_ONLY=0` to
restore the cash and production entry wizards.

The bot uses long polling, so it needs a machine that stays running. It is not
deployed to Vercel; point it at the same `DATABASE_URL` as the web app.

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
