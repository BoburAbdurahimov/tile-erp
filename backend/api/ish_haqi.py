from datetime import date, datetime
from typing import List, Optional, Any, Union
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Employee, JobType, AttendanceEntry, WorkEntry, MonthlySalaryCalculation, AuditLog
from backend.services.salary_service import (
    calculate_employee_salary, recalculate_all_salaries, get_payroll_summary,
    record_daily_attendance, record_daily_work_entry, delete_daily_work_entry,
    finalize_month_payroll, reopen_month_payroll, pay_employee_salary, generate_payroll_excel
)

router = APIRouter(prefix="/salary", tags=["Salary & HR Management"])

# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class EmployeeCreateSchema(BaseModel):
    full_name: str
    department: Optional[str] = "Ma'muriyat" # "Ma'muriyat", "1-Liniya", "2-Liniya", "3-Liniya", "4-Liniya", "5-Liniya"
    employee_type: str = Field(default="fixed", description="'fixed' or 'piecework'")
    position: Optional[str] = None
    phone_number: Optional[str] = None
    monthly_salary: Optional[float] = 0.0
    standard_work_days: Optional[int] = 26
    hire_date: Optional[date] = None

class EmployeeUpdateSchema(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None
    phone_number: Optional[str] = None
    monthly_salary: Optional[float] = None
    standard_work_days: Optional[int] = None
    hire_date: Optional[date] = None

class JobTypeCreateSchema(BaseModel):
    name: str
    unit_of_measure: str = "dona"
    price_per_unit: float

class JobTypeUpdateSchema(BaseModel):
    name: Optional[str] = None
    unit_of_measure: Optional[str] = None
    price_per_unit: Optional[float] = None
    is_active: Optional[bool] = None

class DailyAbsenceItem(BaseModel):
    employee_id: int
    reason: Optional[str] = ""

class DailyAttendanceBatchSchema(BaseModel):
    date: date
    absent_records: List[DailyAbsenceItem]
    current_user: Optional[str] = "Admin"

class DailyWorkEntrySchema(BaseModel):
    employee_id: int
    job_type_id: int
    date: date
    quantity: float
    notes: Optional[str] = None
    current_user: Optional[str] = "Admin"

class PaySalarySchema(BaseModel):
    register_id: int
    payment_amount: float
    current_user: Optional[str] = "Admin"
    notes: Optional[str] = None

def parse_bool(val: Any) -> Optional[bool]:
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if s in ("1", "true", "yes", "on"):
        return True
    if s in ("0", "false", "no", "off"):
        return False
    return None

# ==============================================================================
# EMPLOYEE CRUD ENDPOINTS
# ==============================================================================

@router.get("/employees")
def get_employees(
    department: Optional[str] = None,
    type: Optional[str] = None,
    active_only: Optional[Any] = Query(None),
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Employee)
    is_active_only = parse_bool(active_only)
    if is_active_only is True:
        query = query.filter(Employee.is_active == True)
    if department and department != "all":
        query = query.filter(Employee.department == department)
    if type and type in ("fixed", "piecework"):
        query = query.filter(Employee.employee_type == type)
    if search:
        query = query.filter(Employee.full_name.ilike(f"%{search}%"))
    
    employees = query.order_by(Employee.is_active.desc(), Employee.department.asc(), Employee.full_name.asc()).all()
    return [
        {
            "id": e.id,
            "full_name": e.full_name,
            "department": e.department or "Ma'muriyat",
            "employee_type": e.employee_type,
            "position": e.position or "-",
            "phone_number": e.phone_number or "-",
            "monthly_salary": e.monthly_salary or 0.0,
            "standard_work_days": e.standard_work_days or 26,
            "hire_date": e.hire_date.isoformat() if e.hire_date else None,
            "removal_date": e.removal_date.isoformat() if e.removal_date else None,
            "is_active": e.is_active
        }
        for e in employees
    ]

@router.post("/employees")
def create_employee(data: EmployeeCreateSchema, current_user: str = Query("Admin"), db: Session = Depends(get_db)):
    if data.employee_type not in ("fixed", "piecework"):
        raise HTTPException(status_code=400, detail="Xodim turi 'fixed' yoki 'piecework' bo'lishi shart")
    
    hire_date = data.hire_date or date.today()
    emp = Employee(
        full_name=data.full_name.strip(),
        department=data.department or "Ma'muriyat",
        employee_type=data.employee_type,
        position=data.position.strip() if data.position else None,
        phone_number=data.phone_number.strip() if data.phone_number else None,
        monthly_salary=float(data.monthly_salary or 0.0),
        standard_work_days=int(data.standard_work_days or 26),
        hire_date=hire_date,
        is_active=True
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)

    # Recalculate current month salary
    year_month = hire_date.strftime("%Y-%m")
    calculate_employee_salary(db, emp.id, year_month, current_user=current_user)

    db.add(AuditLog(
        username=current_user,
        action="CREATE",
        module="Ish haqi / Xodimlar",
        entity_id=str(emp.id),
        details=f"Yangi xodim qo'shildi: {emp.full_name} ({emp.employee_type})"
    ))
    db.commit()

    return {"status": "success", "id": emp.id, "message": "Xodim muvaffaqiyatli qo'shildi"}

@router.put("/employees/{id}")
def update_employee(id: int, data: EmployeeUpdateSchema, current_user: str = Query("Admin"), db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.id == id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Xodim topilmadi")

    if data.full_name is not None:
        emp.full_name = data.full_name.strip()
    if data.department is not None:
        emp.department = data.department
    if data.position is not None:
        emp.position = data.position.strip()
    if data.phone_number is not None:
        emp.phone_number = data.phone_number.strip()
    if data.monthly_salary is not None:
        emp.monthly_salary = float(data.monthly_salary)
    if data.standard_work_days is not None:
        emp.standard_work_days = int(data.standard_work_days)
    if data.hire_date is not None:
        emp.hire_date = data.hire_date

    emp.updated_at = datetime.utcnow()
    db.commit()

    # Recalculate current month salary
    year_month = date.today().strftime("%Y-%m")
    calculate_employee_salary(db, emp.id, year_month, current_user=current_user)

    db.add(AuditLog(
        username=current_user,
        action="UPDATE",
        module="Ish haqi / Xodimlar",
        entity_id=str(emp.id),
        details=f"Xodim ma'lumotlari tahrirlandi: {emp.full_name}"
    ))
    db.commit()

    return {"status": "success", "message": "Xodim muvaffaqiyatli yangilandi"}

@router.put("/employees/{id}/toggle-active")
def toggle_employee_active(id: int, current_user: str = Query("Admin"), db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.id == id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Xodim topilmadi")

    emp.is_active = not emp.is_active
    if not emp.is_active:
        emp.removal_date = date.today()
    else:
        emp.removal_date = None

    db.commit()

    db.add(AuditLog(
        username=current_user,
        action="STATUS_CHANGE",
        module="Ish haqi / Xodimlar",
        entity_id=str(emp.id),
        details=f"Xodim holati o'zgartirildi: {emp.full_name} -> {'Faol' if emp.is_active else 'Nofaol/Arxiv'}"
    ))
    db.commit()

    return {"status": "success", "is_active": emp.is_active}

# ==============================================================================
# JOB TYPES (PIECEWORK CATALOG) ENDPOINTS
# ==============================================================================

@router.get("/job-types")
def get_job_types(active_only: Optional[Any] = Query(None), db: Session = Depends(get_db)):
    query = db.query(JobType)
    is_active = parse_bool(active_only)
    if is_active is True:
        query = query.filter(JobType.is_active == True)
    job_types = query.order_by(JobType.is_active.desc(), JobType.name.asc()).all()
    return [
        {
            "id": j.id,
            "name": j.name,
            "unit_of_measure": j.unit_of_measure,
            "price_per_unit": j.price_per_unit,
            "is_active": j.is_active,
            "created_by": j.created_by
        }
        for j in job_types
    ]

@router.post("/job-types")
def create_job_type(data: JobTypeCreateSchema, current_user: str = Query("Admin"), db: Session = Depends(get_db)):
    jt = JobType(
        name=data.name.strip(),
        unit_of_measure=data.unit_of_measure.strip() if data.unit_of_measure else "dona",
        price_per_unit=float(data.price_per_unit),
        is_active=True,
        created_by=current_user
    )
    db.add(jt)
    db.commit()
    db.refresh(jt)

    db.add(AuditLog(
        username=current_user,
        action="CREATE",
        module="Ish haqi / Ish turlari",
        entity_id=str(jt.id),
        details=f"Yangi ish turi qo'shildi: {jt.name} (Narx: {jt.price_per_unit:,.0f} UZS/{jt.unit_of_measure})"
    ))
    db.commit()
    return {"status": "success", "id": jt.id, "message": "Ish turi muvaffaqiyatli qo'shildi"}

@router.put("/job-types/{id}")
def update_job_type(id: int, data: JobTypeUpdateSchema, current_user: str = Query("Admin"), db: Session = Depends(get_db)):
    jt = db.query(JobType).filter(JobType.id == id).first()
    if not jt:
        raise HTTPException(status_code=404, detail="Ish turi topilmadi")

    if data.name is not None:
        jt.name = data.name.strip()
    if data.unit_of_measure is not None:
        jt.unit_of_measure = data.unit_of_measure.strip()
    if data.price_per_unit is not None:
        jt.price_per_unit = float(data.price_per_unit)
    if data.is_active is not None:
        jt.is_active = data.is_active

    jt.updated_at = datetime.utcnow()
    db.commit()

    db.add(AuditLog(
        username=current_user,
        action="UPDATE",
        module="Ish haqi / Ish turlari",
        entity_id=str(jt.id),
        details=f"Ish turi tahrirlandi: {jt.name} -> {jt.price_per_unit:,.0f} UZS/{jt.unit_of_measure}"
    ))
    db.commit()
    return {"status": "success", "message": "Ish turi yangilandi"}

# ==============================================================================
# DAILY ATTENDANCE & WORK ENTRY ENDPOINTS
# ==============================================================================

@router.get("/daily-data")
def get_daily_data(date_str: str = Query(..., description="YYYY-MM-DD"), db: Session = Depends(get_db)):
    try:
        entry_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail="Sana formati noto'g'ri (YYYY-MM-DD kutilmoqda)")

    year_month = entry_date.strftime("%Y-%m")
    is_locked = db.query(MonthlySalaryCalculation).filter(
        MonthlySalaryCalculation.year_month == year_month,
        MonthlySalaryCalculation.status.in_(["finalized", "paid"])
    ).first() is not None

    # Fixed employees and their attendance on this date
    fixed_employees = db.query(Employee).filter(
        Employee.employee_type == "fixed",
        Employee.is_active == True,
        Employee.hire_date <= entry_date
    ).order_by(Employee.full_name.asc()).all()

    attendance_map = {
        a.employee_id: a for a in db.query(AttendanceEntry).filter(AttendanceEntry.date == entry_date).all()
    }

    fixed_list = []
    for emp in fixed_employees:
        att = attendance_map.get(emp.id)
        fixed_list.append({
            "employee_id": emp.id,
            "full_name": emp.full_name,
            "department": emp.department or "Ma'muriyat",
            "position": emp.position or "-",
            "is_absent": att.status == "absent" if att else False,
            "reason": att.reason if att else ""
        })

    # Piecework entries for this date
    work_entries = db.query(WorkEntry).filter(
        WorkEntry.date == entry_date
    ).join(Employee).join(JobType).order_by(WorkEntry.created_at.asc()).all()

    piecework_list = [
        {
            "id": w.id,
            "employee_id": w.employee_id,
            "employee_name": w.employee.full_name,
            "department": w.employee.department or "Ma'muriyat",
            "job_type_id": w.job_type_id,
            "job_name": w.job_type.name,
            "unit_of_measure": w.job_type.unit_of_measure,
            "quantity": w.quantity,
            "unit_price": w.unit_price_snapshot,
            "total_amount": w.total_amount,
            "notes": w.notes or "",
            "entered_by": w.entered_by
        }
        for w in work_entries
    ]

    return {
        "date": date_str,
        "is_locked": is_locked,
        "fixed_employees": fixed_list,
        "piecework_entries": piecework_list
    }

@router.post("/daily-attendance")
def save_daily_attendance(data: DailyAttendanceBatchSchema, db: Session = Depends(get_db)):
    try:
        absent_recs = [{"employee_id": r.employee_id, "reason": r.reason} for r in data.absent_records]
        record_daily_attendance(db, data.date, absent_recs, current_user=data.current_user or "Admin")
        return {"status": "success", "message": f"{data.date} sanasi uchun davomat muvaffaqiyatli saqlandi"}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error saving attendance: {e}")
        raise HTTPException(status_code=500, detail=f"Davomatni saqlashda xatolik: {e}")

@router.post("/daily-work")
def add_daily_work_entry(data: DailyWorkEntrySchema, db: Session = Depends(get_db)):
    try:
        entry = record_daily_work_entry(
            db=db,
            employee_id=data.employee_id,
            job_type_id=data.job_type_id,
            entry_date=data.date,
            quantity=data.quantity,
            notes=data.notes,
            current_user=data.current_user or "Admin"
        )
        return {"status": "success", "id": entry.id, "message": "Bajarilgan ish yozuvi saqlandi"}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error saving work entry: {e}")
        raise HTTPException(status_code=500, detail=f"Ish yozuvini saqlashda xatolik: {e}")

@router.delete("/daily-work/{id}")
def delete_work_entry_endpoint(id: int, current_user: str = Query("Admin"), db: Session = Depends(get_db)):
    try:
        delete_daily_work_entry(db, id, current_user=current_user)
        return {"status": "success", "message": "Ish yozuvi o'chirildi"}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# MONTHLY PAYROLL & PAYOUT ENDPOINTS
# ==============================================================================

@router.get("/payroll/{year_month}")
def get_payroll(year_month: str, recalculate: bool = False, db: Session = Depends(get_db)):
    if recalculate:
        recalculate_all_salaries(db, year_month)
    else:
        # If no calculation exists, calculate now
        existing = db.query(MonthlySalaryCalculation).filter(MonthlySalaryCalculation.year_month == year_month).first()
        if not existing:
            recalculate_all_salaries(db, year_month)
            
    summary = get_payroll_summary(db, year_month)
    return summary

@router.post("/payroll/{year_month}/calculate")
def trigger_calculate_payroll(year_month: str, current_user: str = Query("Admin"), db: Session = Depends(get_db)):
    recalculate_all_salaries(db, year_month, current_user=current_user)
    return get_payroll_summary(db, year_month)

@router.post("/payroll/{year_month}/finalize")
def finalize_payroll(year_month: str, current_user: str = Query("Admin"), db: Session = Depends(get_db)):
    try:
        finalize_month_payroll(db, year_month, current_user=current_user)
        return {"status": "success", "message": f"{year_month} oylik ish haqi muvaffaqiyatli tasdiqlandi va qulflandi"}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

@router.post("/payroll/{year_month}/reopen")
def reopen_payroll(year_month: str, current_user: str = Query("Admin"), db: Session = Depends(get_db)):
    try:
        reopen_month_payroll(db, year_month, current_user=current_user)
        return {"status": "success", "message": f"{year_month} oylik ish haqi qayta tahrirlash uchun ochildi"}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

@router.post("/payroll/{id}/pay")
def pay_salary_endpoint(id: int, data: PaySalarySchema, db: Session = Depends(get_db)):
    try:
        calc = pay_employee_salary(
            db=db,
            calculation_id=id,
            register_id=data.register_id,
            payment_amount=data.payment_amount,
            current_user=data.current_user or "Admin",
            notes=data.notes
        )
        return {
            "status": "success",
            "message": f"Ish haqi to'lovi muvaffaqiyatli amalga oshirildi va Kassa #{data.register_id} ga yozildi",
            "calculation_id": calc.id,
            "cash_transaction_id": calc.cash_transaction_id
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Salary payment failed: {e}")
        raise HTTPException(status_code=500, detail=f"To'lovni amalga oshirishda xatolik: {e}")

@router.get("/payroll/{year_month}/export-excel")
def export_payroll_excel(year_month: str, db: Session = Depends(get_db)):
    try:
        excel_stream = generate_payroll_excel(db, year_month)
        filename = f"Ish_haqi_{year_month}.xlsx"
        return Response(
            content=excel_stream.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"Excel export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Excel eksportda xatolik: {e}")
