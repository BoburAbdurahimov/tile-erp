import sqlite3

conn = sqlite3.connect('tile_erp.db')
cur = conn.cursor()
cols = [c[1] for c in cur.execute('PRAGMA table_info(cash_transactions);').fetchall()]
if 'status' not in cols:
    cur.execute("ALTER TABLE cash_transactions ADD COLUMN status VARCHAR(20) DEFAULT 'Tasdiqlandi'")
if 'storno_ref_id' not in cols:
    cur.execute("ALTER TABLE cash_transactions ADD COLUMN storno_ref_id INTEGER")
conn.commit()
conn.close()
print("Migration completed!")
