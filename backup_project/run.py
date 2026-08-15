import asyncio
import logging
import uvicorn
import os
from pathlib import Path
from seed_data import seed_database
from telegram_bot.bot import start_telegram_bot
from backend.config import HOST, PORT, TELEGRAM_BOT_TOKEN

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("TileERPLauncher")

async def run_server():
    # 1. Ensure database is created and seeded
    logger.info("Verifying database and seed data...")
    seed_database()
    
    # 2. Start Telegram Bot task
    bot_task = None
    if TELEGRAM_BOT_TOKEN:
        try:
            logger.info("Starting Telegram Bot listener...")
            bot_task = asyncio.create_task(start_telegram_bot())
        except Exception as e:
            logger.error(f"Could not start Telegram Bot: {e}")

    # 3. Start FastAPI Web Server with uvicorn
    config = uvicorn.Config(
        "backend.main:app",
        host=HOST,
        port=PORT,
        log_level="info",
        reload=False
    )
    server = uvicorn.Server(config)
    logger.info(f"🚀 Ceramic Tile Factory ERP Web Dashboard running at: http://localhost:{PORT}")
    logger.info(f"📱 Telegram Mini App URL: http://localhost:{PORT}/webapp")
    logger.info(f"📚 OpenAPI Swagger Documentation: http://localhost:{PORT}/docs")
    
    await server.serve()

if __name__ == "__main__":
    asyncio.run(run_server())
