from sqlalchemy import text
from backend.database import init_engine, engine

init_engine()

with engine.connect() as conn:
    # Migrate cash_transactions
    try:
        conn.execute(text("ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Tasdiqlandi';"))
        conn.execute(text("ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS storno_ref_id INTEGER;"))
        conn.commit()
        print("Postgres cash_transactions columns added successfully.")
    except Exception as e:
        print("Migration error:", e)
