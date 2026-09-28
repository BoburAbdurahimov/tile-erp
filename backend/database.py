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

def create_tables():
    Base.metadata.create_all(bind=engine)
