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

# Columns added after the first release. Base.metadata.create_all() creates new
# TABLES but never alters existing ones, so new columns need an explicit ALTER.
_ADDED_COLUMNS = [
    ("mdm_materials", "article_no", "INTEGER"),
    ("mdm_materials", "article_group", "VARCHAR(20)"),
]


def _existing_columns(conn, table: str) -> set:
    from sqlalchemy import inspect
    try:
        return {c["name"] for c in inspect(conn).get_columns(table)}
    except Exception:
        return set()


def run_column_migrations():
    """Add columns introduced after a table already existed.

    Idempotent and non-fatal: a failure here must not stop the app booting,
    and this runs on every cold start on Vercel.
    """
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            for table, column, coltype in _ADDED_COLUMNS:
                cols = _existing_columns(conn, table)
                if not cols or column in cols:
                    continue  # table absent (created fresh) or column present
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
                    logger.info(f"Migration: added {table}.{column}")
                except Exception as e:
                    logger.warning(f"Migration skipped for {table}.{column}: {e}")
    except Exception as e:
        logger.warning(f"Column migrations skipped: {e}")


def create_tables():
    Base.metadata.create_all(bind=engine)
    run_column_migrations()
