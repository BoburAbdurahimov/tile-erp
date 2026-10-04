"""Document numbers such as PRD-20261004-0007.

The sequence continues from the highest number already used for that day,
rather than from a row count: a count goes back down after a delete, which
handed out a number that already existed and failed the unique constraint.
"""
from sqlalchemy.orm import Session


def next_number(db: Session, column, prefix: str, width: int = 4) -> str:
    """Next free number "<prefix><seq>" for a unique string column."""
    seq = 0
    for (value,) in db.query(column).filter(column.like(f"{prefix}%")).all():
        tail = (value or "")[len(prefix):]
        if tail.isdigit():
            seq = max(seq, int(tail))
    return f"{prefix}{seq + 1:0{width}d}"
