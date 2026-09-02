from datetime import date as dt_date, datetime as dt_datetime
from typing import List, Optional
from pydantic import BaseModel, Field

# MDM Material
class MaterialBase(BaseModel):
    code: str
    name: str
    category: str # Siryo, Tayyor mahsulot, Ehtiyot qism, Yarim tayyor
    unit: str # kg, m2, dona, litr, tonna
    min_stock: float = 0.0
    description: Optional[str] = None

class MaterialCreate(MaterialBase):
    pass

class MaterialUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    min_stock: Optional[float] = None
    description: Optional[str] = None

class MaterialResponse(MaterialBase):
    id: int
    current_avg_price_usd: float
    current_avg_price_uzs: float
    is_archived: bool
    created_at: dt_datetime
    updated_at: dt_datetime

    class Config:
        from_attributes = True

# MDM Counterparty
class CounterpartyBase(BaseModel):
    name: str
    type: str # "client" or "supplier"
    is_resident: bool = True
    region: str = "Toshkent shahri"
    phone: Optional[str] = None
    address: Optional[str] = None

class CounterpartyCreate(CounterpartyBase):
    initial_balance_usd: float = 0.0
    initial_balance_uzs: float = 0.0

class CounterpartyUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    is_resident: Optional[bool] = None
    region: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CounterpartyResponse(CounterpartyBase):
    id: int
    code: str
    initial_balance_usd: float
    initial_balance_uzs: float
    current_balance_usd: float
    current_balance_uzs: float
    is_archived: bool
    created_at: dt_datetime

    class Config:
        from_attributes = True

# Warehouse & Stock
class WarehouseCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    is_system_default: bool = False

class WarehouseUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None

class WarehouseResponse(BaseModel):
    id: int
    code: str
    name: str
    is_system_default: bool
    description: Optional[str] = None

    class Config:
        from_attributes = True

class StockItemResponse(BaseModel):
    id: int
    warehouse_id: int
    warehouse_name: str
    material_id: int
    material_code: str
    material_name: str
    material_category: str
    unit: str
    quantity: float
    avg_cost_usd: float
    avg_cost_uzs: float
    total_cost_usd: float
    total_cost_uzs: float
    min_stock: float

class StockAdjustmentRequest(BaseModel):
    warehouse_id: int
    material_id: int
    new_quantity: float
    reason: str

class StockTransferCreate(BaseModel):
    from_warehouse_id: int
    to_warehouse_id: int
    material_id: int
    quantity: float
    date: Optional[dt_date] = None
    description: Optional[str] = None

class StockTransferResponse(BaseModel):
    id: int
    transfer_number: str
    date: str
    from_warehouse_id: int
    from_warehouse_name: str
    to_warehouse_id: int
    to_warehouse_name: str
    material_id: int
    material_code: str
    material_name: str
    unit: str
    quantity: float
    unit_cost_usd: float
    total_cost_usd: float
    description: Optional[str] = None
    created_by: Optional[str] = None

# Kassa & FX
class CashRegisterResponse(BaseModel):
    id: int
    name: str
    currency: str
    balance: float
    balance_in_other_currency: float
    current_rate: float
    description: Optional[str] = None

class CashTransactionCreate(BaseModel):
    register_id: int
    type: str # "kirim" or "chiqim"
    source_type: str = "other" # "client", "supplier", "other"
    counterparty_id: Optional[int] = None
    amount: float
    currency: str
    category: str = "boshqa" # "bilvosita_xarajatlar", "admin_prochee", "mijoz_tolovi", "postavshik_tolovi", "boshqa"
    date: dt_date = Field(default_factory=dt_date.today)
    description: Optional[str] = None

class CashTransactionResponse(BaseModel):
    id: int
    register_id: int
    register_name: str
    type: str
    source_type: str
    counterparty_id: Optional[int]
    counterparty_name: Optional[str]
    amount: float
    currency: str
    category: str
    date: dt_date
    description: Optional[str]
    created_at: dt_datetime

class ExchangeRateCreate(BaseModel):
    date: dt_date
    rate_usd_uzs: float
    is_manual_override: bool = True

class ExchangeRateResponse(BaseModel):
    id: int
    date: dt_date
    rate_usd_uzs: float
    is_manual_override: bool

# Production Line
class ProductionLineResponse(BaseModel):
    id: int
    line_number: int
    name: str
    spec_tile_size: str
    daily_capacity_m2: float
    is_active: bool

# Production Order
class ConsumedMaterialInput(BaseModel):
    material_id: int
    warehouse_id: int = 2 # Fixed to 2 (Ishlab chiqarish uchun materiallar)
    quantity: float

class LineExpenseItemInput(BaseModel):
    material_id: int
    quantity: float

class LineExpenseCreate(BaseModel):
    date: dt_date = Field(default_factory=dt_date.today)
    line_ids: List[int]
    items: List[LineExpenseItemInput]
    notes: Optional[str] = None

class LineExpenseItemResponse(BaseModel):
    id: int
    material_id: int
    material_code: str
    material_name: str
    unit: str
    quantity: float
    unit_cost_usd: float
    total_cost_usd: float

class LineExpenseResponse(BaseModel):
    id: int
    expense_number: str
    date: dt_date
    warehouse_id: int
    warehouse_name: str
    line_ids: List[int]
    line_names: List[str]
    total_cost_usd: float
    status: str
    notes: Optional[str]
    items: List[LineExpenseItemResponse]
    created_at: dt_datetime

class ProductionOrderCreate(BaseModel):
    line_id: int
    output_material_id: int
    quantity: float
    date: dt_date = Field(default_factory=dt_date.today)
    consumed_materials: List[ConsumedMaterialInput]
    notes: Optional[str] = None

class ConsumedMaterialResponse(BaseModel):
    material_id: int
    material_code: str
    material_name: str
    warehouse_id: int
    warehouse_name: str
    quantity: float
    unit: str
    unit_cost_usd: float
    total_cost_usd: float

class ProductionOrderResponse(BaseModel):
    id: int
    order_number: str
    line_id: int
    line_name: str
    line_number: int
    output_material_id: int
    output_material_code: str
    output_material_name: str
    quantity: float
    unit: str
    date: dt_date
    status: str
    direct_cost_usd: float
    allocated_indirect_cost_usd: float
    total_cost_usd: float
    unit_cost_usd: float
    storno_ref_id: Optional[int] = None
    notes: Optional[str] = None
    consumed_materials: List[ConsumedMaterialResponse] = []
    created_at: dt_datetime

# Purchase (Zakup)
class PurchaseItemInput(BaseModel):
    material_id: int
    quantity: float
    unit_price: float

class PurchaseCreate(BaseModel):
    supplier_id: int
    warehouse_id: int = 2 # Ishlab chiqarish uchun materiallar
    date: dt_date = Field(default_factory=dt_date.today)
    currency: str = "USD"
    items: List[PurchaseItemInput]
    description: Optional[str] = None

class PurchaseItemResponse(BaseModel):
    id: int
    material_id: int
    material_code: str
    material_name: str
    quantity: float
    unit: str
    unit_price: float
    total_price: float
    currency: str

class PurchaseResponse(BaseModel):
    id: int
    purchase_number: str
    supplier_id: int
    supplier_name: str
    supplier_code: str
    warehouse_id: int
    warehouse_name: str
    date: dt_date
    currency: str
    total_amount: float
    status: str
    storno_ref_id: Optional[int] = None
    description: Optional[str] = None
    items: List[PurchaseItemResponse] = []
    created_at: dt_datetime

# Sale (Sotish)
class SaleItemInput(BaseModel):
    material_id: int
    quantity: float
    unit_price: float

class SaleCreate(BaseModel):
    client_id: int
    warehouse_id: int = 1 # Tayyor mahsulotlar
    date: dt_date = Field(default_factory=dt_date.today)
    currency: str = "USD"
    items: List[SaleItemInput]
    description: Optional[str] = None

class SaleItemResponse(BaseModel):
    id: int
    material_id: int
    material_code: str
    material_name: str
    quantity: float
    unit: str
    unit_price: float
    total_price: float
    currency: str

class SaleResponse(BaseModel):
    id: int
    sale_number: str
    client_id: int
    client_name: str
    client_code: str
    warehouse_id: int
    warehouse_name: str
    date: dt_date
    currency: str
    total_amount: float
    status: str
    storno_ref_id: Optional[int] = None
    description: Optional[str] = None
    items: List[SaleItemResponse] = []
    created_at: dt_datetime

# Month Closing & PnL
class MonthCloseRequest(BaseModel):
    year_month: str # "YYYY-MM"
    notes: Optional[str] = None

class MonthReopenRequest(BaseModel):
    year_month: str # "YYYY-MM"

class LineCostSummary(BaseModel):
    line_id: int
    line_number: int
    line_name: str
    spec_tile_size: str
    production_volume_m2: float
    volume_percentage: float
    direct_materials_cost_usd: float
    line_equipment_expenses_usd: float = 0.0
    allocated_indirect_cost_usd: float
    total_manufacturing_cost_usd: float
    unit_cost_usd_per_m2: float

class PnLReportResponse(BaseModel):
    year_month: str
    currency: str = "USD"
    revenue_usd: float
    cogs_direct_materials_usd: float
    cogs_line_expenses_usd: float = 0.0
    cogs_indirect_expenses_usd: float
    total_cogs_usd: float
    gross_profit_usd: float
    admin_expenses_usd: float
    net_profit_usd: float
    is_closed: bool
    total_factory_volume_m2: float = 0.0
    line_breakdown: List[LineCostSummary] = []

class CashFlowItem(BaseModel):
    category: str
    inflow_usd: float
    outflow_usd: float
    net_usd: float

class CashFlowReportResponse(BaseModel):
    year_month: str
    total_inflows_usd: float
    total_outflows_usd: float
    net_cash_flow_usd: float
    breakdown_by_category: List[CashFlowItem] = []
