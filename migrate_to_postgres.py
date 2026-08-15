import logging
import sqlite3
import psycopg2
from backend.auth_utils import hash_password

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

POSTGRES_URL = "postgresql://postgres:password@localhost:5432/tile_erp"
SQLITE_PATH = "tile_erp.db"

def run_migration():
    logger.info("Starting safe migration to PostgreSQL...")

    # Connect PostgreSQL
    pg_conn = psycopg2.connect(POSTGRES_URL)
    pg_conn.autocommit = True
    pg_cur = pg_conn.cursor()

    # 1. Initialize Tables from SQLAlchemy
    from backend.database import engine, Base, create_tables
    import backend.models # Ensure all models are registered
    create_tables()
    logger.info("PostgreSQL tables verified / created.")

    # 2. Fix Categories in PostgreSQL cash_transactions
    cat_mapping = {
        'bilvosita_xarajatlar': 'Elektr energiya (Svet)',
        'admin_prochee': "Ofis va xo'jalik xarajatlari",
        'mijoz_tolovi': "Mijoz to'lovi",
        'postavshik_tolovi': "Postavshikka to'lov",
        'asoschidan_investitsiya': 'Asoschidan investitsiya',
        'boshqa_kirim': 'Boshqa kirim',
        'boshqa_chiqim': 'Boshqa chiqim'
    }
    for old_val, new_val in cat_mapping.items():
        pg_cur.execute("UPDATE cash_transactions SET category = %s WHERE category = %s;", (new_val, old_val))

    # 3. Ensure Admin user exists with correct password in PostgreSQL
    pg_cur.execute("SELECT id, username, password_hash FROM users WHERE username = 'Adminshox';")
    admin_row = pg_cur.fetchone()
    hashed_pwd = hash_password("test0101")
    if not admin_row:
        pg_cur.execute("""
            INSERT INTO users (username, full_name, phone_number, password_hash, role, is_archived)
            VALUES ('Adminshox', 'Shohrux Bosh Admin', '+998901234567', %s, 'Admin', false);
        """, (hashed_pwd,))
        logger.info("Adminshox user created in PostgreSQL.")
    else:
        # Verify / update hash
        pg_cur.execute("UPDATE users SET password_hash = %s, role = 'Admin' WHERE username = 'Adminshox';", (hashed_pwd,))
        logger.info("Adminshox user password and role verified in PostgreSQL.")

    # 4. Sync sequences in PostgreSQL for all tables
    tables = [
        'users', 'telegram_users', 'exchange_rates', 'warehouses', 'mdm_materials',
        'mdm_counterparties', 'cash_registers', 'production_lines', 'stock_items',
        'cash_transactions', 'purchases', 'purchase_items', 'sales', 'sale_items',
        'production_orders', 'production_consumed_materials', 'month_closings', 'audit_logs'
    ]

    for tbl in tables:
        try:
            pg_cur.execute(f"SELECT COALESCE(MAX(id), 0) FROM {tbl};")
            max_id = pg_cur.fetchone()[0]
            seq_name = f"{tbl}_id_seq"
            # Try resetting sequence
            pg_cur.execute(f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), %s, true);", (max_id if max_id > 0 else 1,))
            logger.info(f"Sequence for {tbl} set to {max_id}.")
        except Exception as e:
            logger.warning(f"Could not reset sequence for {tbl}: {e}")

    # 5. Display Row counts
    logger.info("=== POSTGRESQL DATA VERIFICATION ===")
    for tbl in tables:
        pg_cur.execute(f"SELECT COUNT(*) FROM {tbl};")
        cnt = pg_cur.fetchone()[0]
        logger.info(f"Table '{tbl}': {cnt} rows")

    pg_conn.close()
    logger.info("Migration & Sequence Sync completed successfully!")

if __name__ == "__main__":
    run_migration()
