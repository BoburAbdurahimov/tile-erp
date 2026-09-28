from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, BigInteger, String, Float, Boolean, Date, DateTime,
    ForeignKey, Text, Numeric, UniqueConstraint
)
from sqlalchemy.orm import relationship
from backend.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    phone_number = Column(String(50), nullable=True)
    role = Column(String(500), nullable=False, default="Ish boshqaruvchi")
    password_hash = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MDMMaterial(Base):
    __tablename__ = "mdm_materials"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False) # mahsulot kodi strictly unique
    name = Column(String(150), nullable=False) # mahsulot nomi
    category = Column(String(50), nullable=False) # Xomashyo/Siryo, Tayyor mahsulot, Ehtiyot qism, Yarim tayyor
    unit = Column(String(20), nullable=False, default="kg") # kg, m2, dona, litr, tonna
    min_stock = Column(Float, default=0.0)
    current_avg_price_usd = Column(Float, default=0.0) # Moving AVG cost in USD
    current_avg_price_uzs = Column(Float, default=0.0) # Moving AVG cost in UZS
    is_archived = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    stock_items = relationship("StockItem", back_populates="material")

class MDMCounterparty(Base):
    __tablename__ = "mdm_counterparties"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False) # 10001+ for suppliers, 20001+ for clients
    name = Column(String(150), nullable=False)
    type = Column(String(20), nullable=False) # "client" or "supplier"
    is_resident = Column(Boolean, default=True) # Rezident / Norezident
    region = Column(String(100), nullable=False, default="Toshkent shahri") # Viloyat
    phone = Column(String(50), nullable=True)
    address = Column(String(255), nullable=True)
    initial_balance_usd = Column(Float, default=0.0) # locked after creation
    initial_balance_uzs = Column(Float, default=0.0) # locked after creation
    current_balance_usd = Column(Float, default=0.0) # positive = they owe us, negative = we owe them
    current_balance_uzs = Column(Float, default=0.0)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Warehouse(Base):
    __tablename__ = "warehouses"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(100), nullable=False) # 1: Tayyor mahsulotlar, 2: Ishlab chiqarish uchun materiallar, 3: Aralash ombor
    is_system_default = Column(Boolean, default=False)
    description = Column(Text, nullable=True)
    
    stock_items = relationship("StockItem", back_populates="warehouse")

class StockItem(Base):
    __tablename__ = "stock_items"
    
    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("mdm_materials.id"), nullable=False)
    quantity = Column(Float, default=0.0)
    avg_cost_usd = Column(Float, default=0.0) # Moving AVG price
    avg_cost_uzs = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    warehouse = relationship("Warehouse", back_populates="stock_items")
    material = relationship("MDMMaterial", back_populates="stock_items")

    __table_args__ = (UniqueConstraint('warehouse_id', 'material_id', name='_warehouse_material_uc'),)

class StockTransfer(Base):
    __tablename__ = "stock_transfers"
    
    id = Column(Integer, primary_key=True, index=True)
    transfer_number = Column(String(50), unique=True, nullable=False) # e.g. TR-20260902-001
    date = Column(Date, default=datetime.utcnow().date, nullable=False)
    from_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    to_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("mdm_materials.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    unit_cost_usd = Column(Float, default=0.0)
    total_cost_usd = Column(Float, default=0.0)
    description = Column(String(255), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    from_warehouse = relationship("Warehouse", foreign_keys=[from_warehouse_id])
    to_warehouse = relationship("Warehouse", foreign_keys=[to_warehouse_id])
    material = relationship("MDMMaterial")

class CashRegister(Base):
    __tablename__ = "cash_registers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False) # Kassa UZS, Kassa USD
    currency = Column(String(10), nullable=False) # UZS or USD
    balance = Column(Float, default=0.0)
    description = Column(String(255), nullable=True)

class CashTransaction(Base):
    __tablename__ = "cash_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    register_id = Column(Integer, ForeignKey("cash_registers.id"), nullable=False)
    type = Column(String(20), nullable=False) # "kirim" or "chiqim"
    source_type = Column(String(30), nullable=False, default="other") # "client", "supplier", "other"
    counterparty_id = Column(Integer, ForeignKey("mdm_counterparties.id"), nullable=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False) # UZS or USD
    category = Column(String(50), nullable=False, default="boshqa") # "bilvosita_xarajatlar", "admin_prochee", "mijoz_tolovi", "postavshik_tolovi", "boshqa"
    date = Column(Date, nullable=False, default=date.today)
    status = Column(String(20), default="Tasdiqlandi") # "Tasdiqlandi", "Storno"
    storno_ref_id = Column(Integer, ForeignKey("cash_transactions.id"), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    counterparty = relationship("MDMCounterparty")
    register = relationship("CashRegister")

class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, index=True, nullable=False)
    rate_usd_uzs = Column(Float, nullable=False)
    is_manual_override = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ProductionLine(Base):
    __tablename__ = "production_lines"
    
    id = Column(Integer, primary_key=True, index=True)
    line_number = Column(Integer, unique=True, nullable=False) # 1, 2, 3, 4, 5
    name = Column(String(100), nullable=False)
    spec_tile_size = Column(String(50), nullable=False) # 30x30, 60x60, 60x120, 80x80, 45x45
    daily_capacity_m2 = Column(Float, default=1000.0)
    is_active = Column(Boolean, default=True)

class ProductionOrder(Base):
    __tablename__ = "production_orders"
    
    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(50), unique=True, nullable=False)
    line_id = Column(Integer, ForeignKey("production_lines.id"), nullable=False)
    output_material_id = Column(Integer, ForeignKey("mdm_materials.id"), nullable=False)
    quantity = Column(Float, nullable=False) # m2 or pcs
    date = Column(Date, nullable=False, default=date.today)
    status = Column(String(20), default="Tasdiqlandi") # "Tasdiqlandi", "Storno"
    direct_cost_usd = Column(Float, default=0.0)
    allocated_indirect_cost_usd = Column(Float, default=0.0)
    total_cost_usd = Column(Float, default=0.0)
    unit_cost_usd = Column(Float, default=0.0) # total_cost_usd / quantity
    storno_ref_id = Column(Integer, ForeignKey("production_orders.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    line = relationship("ProductionLine")
    output_material = relationship("MDMMaterial")
    consumed_materials = relationship("ProductionConsumedMaterial", back_populates="production_order", cascade="all, delete-orphan")

class ProductionConsumedMaterial(Base):
    __tablename__ = "production_consumed_materials"
    
    id = Column(Integer, primary_key=True, index=True)
    production_order_id = Column(Integer, ForeignKey("production_orders.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("mdm_materials.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    unit_cost_usd = Column(Float, default=0.0) # AVG price at moment of production
    total_cost_usd = Column(Float, default=0.0)
    
    production_order = relationship("ProductionOrder", back_populates="consumed_materials")
    material = relationship("MDMMaterial")
    warehouse = relationship("Warehouse")

class LineExpense(Base):
    __tablename__ = "line_expenses"
    
    id = Column(Integer, primary_key=True, index=True)
    expense_number = Column(String(50), unique=True, nullable=False)
    date = Column(Date, nullable=False, default=date.today)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, default=3)
    line_ids_str = Column(String(100), nullable=False) # E.g. "1,2,3"
    total_cost_usd = Column(Float, default=0.0)
    total_cost_uzs = Column(Float, default=0.0)
    status = Column(String(20), default="Tasdiqlandi") # "Tasdiqlandi", "Storno"
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    warehouse = relationship("Warehouse")
    items = relationship("LineExpenseItem", back_populates="expense", cascade="all, delete-orphan")

class LineExpenseItem(Base):
    __tablename__ = "line_expense_items"
    
    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("line_expenses.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("mdm_materials.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    unit_cost_usd = Column(Float, default=0.0)
    unit_cost_uzs = Column(Float, default=0.0)
    total_cost_usd = Column(Float, default=0.0)
    total_cost_uzs = Column(Float, default=0.0)
    
    expense = relationship("LineExpense", back_populates="items")
    material = relationship("MDMMaterial")

class Purchase(Base):
    __tablename__ = "purchases"
    
    id = Column(Integer, primary_key=True, index=True)
    purchase_number = Column(String(50), unique=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("mdm_counterparties.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    date = Column(Date, nullable=False, default=date.today)
    currency = Column(String(10), nullable=False, default="USD") # USD or UZS
    total_amount = Column(Float, nullable=False, default=0.0)
    status = Column(String(20), default="Tasdiqlandi") # "Tasdiqlandi", "Storno"
    storno_ref_id = Column(Integer, ForeignKey("purchases.id"), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    supplier = relationship("MDMCounterparty")
    warehouse = relationship("Warehouse")
    items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")

class PurchaseItem(Base):
    __tablename__ = "purchase_items"
    
    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("mdm_materials.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="USD")
    
    purchase = relationship("Purchase", back_populates="items")
    material = relationship("MDMMaterial")

class Sale(Base):
    __tablename__ = "sales"
    
    id = Column(Integer, primary_key=True, index=True)
    sale_number = Column(String(50), unique=True, nullable=False)
    client_id = Column(Integer, ForeignKey("mdm_counterparties.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    date = Column(Date, nullable=False, default=date.today)
    currency = Column(String(10), nullable=False, default="USD") # USD or UZS
    total_amount = Column(Float, nullable=False, default=0.0)
    status = Column(String(20), default="Tasdiqlandi") # "Tasdiqlandi", "Storno"
    storno_ref_id = Column(Integer, ForeignKey("sales.id"), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    client = relationship("MDMCounterparty")
    warehouse = relationship("Warehouse")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")

class SaleItem(Base):
    __tablename__ = "sale_items"
    
    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("mdm_materials.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="USD")
    
    sale = relationship("Sale", back_populates="items")
    material = relationship("MDMMaterial")

class MonthClosing(Base):
    __tablename__ = "month_closings"
    
    id = Column(Integer, primary_key=True, index=True)
    year_month = Column(String(7), unique=True, index=True, nullable=False) # e.g. "2026-08"
    is_closed = Column(Boolean, default=True)
    closed_at = Column(DateTime, default=datetime.utcnow)
    closed_by_username = Column(String(50), default="admin")
    
    # Financial snapshot
    pnl_revenue_usd = Column(Float, default=0.0)
    pnl_cogs_usd = Column(Float, default=0.0) # Direct materials
    pnl_indirect_usd = Column(Float, default=0.0) # Allocated indirect costs
    pnl_admin_usd = Column(Float, default=0.0) # Admin & other costs
    pnl_net_profit_usd = Column(Float, default=0.0)
    total_production_volume = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)

class TelegramUser(Base):
    __tablename__ = "telegram_users"
    
    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(BigInteger, unique=True, index=True, nullable=False)
    phone_number = Column(String(30), nullable=True, index=True)
    username = Column(String(100), nullable=True)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    language = Column(String(5), default="uz") # "uz" or "ru"
    role = Column(String(500), default="Admin")
    is_approved = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=True)
    action = Column(String(50), nullable=False) # CREATE, UPDATE, DELETE, STORNO, CLOSE_MONTH, REOPEN_MONTH, ADJUST_STOCK
    module = Column(String(50), nullable=False)
    entity_id = Column(String(50), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# ==============================================================================
# SALARY & HR MANAGEMENT MODULE MODELS
# ==============================================================================

class Employee(Base):
    __tablename__ = "employees"
    
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False, index=True)
    department = Column(String(50), nullable=False, default="Ma'muriyat") # "Ma'muriyat", "1-Liniya", "2-Liniya", "3-Liniya", "4-Liniya", "5-Liniya"
    employee_type = Column(String(20), nullable=False, default="fixed") # "fixed" or "piecework"
    position = Column(String(100), nullable=True) # e.g. "Kafel ustalari brigadiri", "Saralovchi"
    phone_number = Column(String(50), nullable=True)
    
    # For "fixed" type employees:
    monthly_salary = Column(Float, default=0.0) # Base monthly salary in UZS
    standard_work_days = Column(Integer, default=26) # Standard work days per month
    
    hire_date = Column(Date, nullable=False, default=date.today)
    removal_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True) # Soft delete
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    attendances = relationship("AttendanceEntry", back_populates="employee", cascade="all, delete-orphan")
    work_entries = relationship("WorkEntry", back_populates="employee", cascade="all, delete-orphan")
    salary_calculations = relationship("MonthlySalaryCalculation", back_populates="employee", cascade="all, delete-orphan")

class JobType(Base):
    __tablename__ = "job_types"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, index=True) # e.g. "Kafel saralash", "Pechga ortish"
    unit_of_measure = Column(String(30), nullable=False, default="dona") # m2, dona, taglik, tonna, quti
    price_per_unit = Column(Float, nullable=False, default=0.0) # Rate in UZS
    is_active = Column(Boolean, default=True) # Active for new entries
    created_by = Column(String(50), default="Admin")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    work_entries = relationship("WorkEntry", back_populates="job_type")

class AttendanceEntry(Base):
    __tablename__ = "attendance_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="absent") # "absent" | "present"
    reason = Column(Text, nullable=True) # e.g. "Sababsiz", "Kasal", "Ruxsat olgan"
    entered_by = Column(String(50), default="Admin")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        UniqueConstraint('employee_id', 'date', name='uq_employee_attendance_date'),
    )
    
    employee = relationship("Employee", back_populates="attendances")

class WorkEntry(Base):
    __tablename__ = "work_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    job_type_id = Column(Integer, ForeignKey("job_types.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    quantity = Column(Float, nullable=False, default=0.0) # e.g. 500 m2, 20 taglik
    unit_price_snapshot = Column(Float, nullable=False, default=0.0) # Historical snapshot of rate
    total_amount = Column(Float, nullable=False, default=0.0) # quantity * unit_price_snapshot
    notes = Column(Text, nullable=True)
    entered_by = Column(String(50), default="Admin")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    employee = relationship("Employee", back_populates="work_entries")
    job_type = relationship("JobType", back_populates="work_entries")

class MonthlySalaryCalculation(Base):
    __tablename__ = "monthly_salary_calculations"
    
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    year_month = Column(String(7), nullable=False, index=True) # e.g. "2026-08"
    employee_type = Column(String(20), nullable=False) # "fixed" | "piecework"
    
    # Calculation breakdown for Fixed:
    base_salary = Column(Float, default=0.0)
    standard_days = Column(Integer, default=26)
    absent_days = Column(Integer, default=0)
    per_day_rate = Column(Float, default=0.0)
    deduction_amount = Column(Float, default=0.0)
    
    # Calculation breakdown for Piecework:
    piecework_total = Column(Float, default=0.0)
    
    # Final amounts:
    bonus_amount = Column(Float, default=0.0)
    advance_paid = Column(Float, default=0.0)
    final_amount = Column(Float, nullable=False, default=0.0) # Net payable
    
    status = Column(String(20), nullable=False, default="draft") # "draft", "finalized", "paid"
    cash_transaction_id = Column(Integer, ForeignKey("cash_transactions.id"), nullable=True)
    
    finalized_at = Column(DateTime, nullable=True)
    finalized_by = Column(String(50), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    paid_by = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        UniqueConstraint('employee_id', 'year_month', name='uq_employee_year_month_salary'),
    )
    
    employee = relationship("Employee", back_populates="salary_calculations")
    cash_transaction = relationship("CashTransaction")

