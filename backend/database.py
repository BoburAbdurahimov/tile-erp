import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.config import DATABASE_URL, SQLITE_FALLBACK_URL

logger = logging.getLogger(__name__)

Base = declarative_base()

# Primary connection: PostgreSQL, with smooth fallback to SQLite
engine = None
SessionLocal = None

def init_engine():
    global engine, SessionLocal
    db_url = DATABASE_URL
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+psycopg2://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
        
    try:
        if "postgresql" in db_url:
            test_engine = create_engine(
                db_url,
                pool_pre_ping=True,
                connect_args={"connect_timeout": 5, "client_encoding": "utf8"}
            )
            with test_engine.connect() as conn:
                pass
            engine = test_engine
            logger.info("Successfully connected to PostgreSQL (tile_erp).")
        else:
            engine = create_engine(db_url)
    except Exception as e:
        logger.warning(f"PostgreSQL connection fallback ({e}). Using SQLite database at {SQLITE_FALLBACK_URL}")
        engine = create_engine(SQLITE_FALLBACK_URL, connect_args={"check_same_thread": False})
    
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine

init_engine()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Columns added after their table already existed. create_all() makes new
# TABLES but never alters existing ones, so these need an explicit ALTER.
_ADDED_COLUMNS = [
    ("production_orders", "out_sklad_id", "INTEGER"),
    ("production_orders", "out_length", "INTEGER"),
    ("production_orders", "out_width", "INTEGER"),
    ("purchase_items", "sklad_id", "INTEGER"),
    ("purchase_items", "length", "INTEGER"),
    ("purchase_items", "width", "INTEGER"),
    ("users", "ombor_sklads", "VARCHAR(50)"),
    ("auto_sarf_rules", "sklad_id", "INTEGER"),
    ("sklad_order_payments", "pay_currency", "VARCHAR(10)"),
    ("sklad_order_payments", "pay_amount", "FLOAT"),
    ("sklad_order_payments", "rate", "FLOAT"),
    ("sklad_orders", "counterparty_id", "INTEGER"),
    ("job_types", "pay_type", "VARCHAR(20)"),
    ("employees", "job_type_id", "INTEGER"),
    ("monthly_salary_calculations", "penalty_amount", "FLOAT"),
]


def run_column_migrations():
    """Add late columns. Idempotent and non-fatal - this runs on every cold
    start, including on Vercel, and must never stop the app booting."""
    from sqlalchemy import inspect, text
    try:
        insp = inspect(engine)
        with engine.begin() as conn:
            for table, column, coltype in _ADDED_COLUMNS:
                try:
                    if not insp.has_table(table):
                        continue
                    if column in {c["name"] for c in insp.get_columns(table)}:
                        continue
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
                    logger.info(f"Migration: added {table}.{column}")
                except Exception as e:
                    logger.warning(f"Migration skipped for {table}.{column}: {e}")
    except Exception as e:
        logger.warning(f"Column migrations skipped: {e}")


# Columns that became optional once a row could describe sheets instead of a
# catalogue material.
_DROPPED_NOT_NULL = [
    ("purchase_items", "material_id"),
    ("production_orders", "output_material_id"),
    ("production_orders", "line_id"),
]


def run_nullable_migrations():
    """Relax NOT NULL where a column became optional. Postgres only; SQLite
    cannot ALTER a constraint, and creates the table correctly from scratch."""
    from sqlalchemy import text
    if engine.dialect.name != "postgresql":
        return
    try:
        with engine.begin() as conn:
            for table, column in _DROPPED_NOT_NULL:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} DROP NOT NULL"))
                except Exception as e:
                    logger.warning(f"Nullable migration skipped for {table}.{column}: {e}")
    except Exception as e:
        logger.warning(f"Nullable migrations skipped: {e}")


def run_data_migrations():
    """Small idempotent data fixes, run on every start like the ones above."""
    from sqlalchemy import inspect, text
    from backend.models import SKLAD_CONFIG
    try:
        if not inspect(engine).has_table("employees"):
            return
        with engine.begin() as conn:
            # Ish haqi departments are the 4 Omborlar (owners), not their 8
            # yo'nalish: "Kodir 120" / "Kodir 100" -> "Kodir".
            for s in SKLAD_CONFIG:
                conn.execute(text("UPDATE employees SET department = :owner WHERE department = :old"),
                             {"owner": s["name"], "old": f"{s['name']} {s['eni']}"})
    except Exception as e:
        logger.warning(f"Data migrations skipped: {e}")


def create_tables():
    Base.metadata.create_all(bind=engine)
    run_column_migrations()
    run_nullable_migrations()
    run_data_migrations()
