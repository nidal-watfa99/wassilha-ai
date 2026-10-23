"""Products & payment records.

IMPORTANT: this module is bookkeeping only. It records payments that were made
elsewhere; it does NOT process payments, collect card data, or confirm any
real transaction. A real payment provider integration would require its own
dedicated, audited implementation.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import get_db
from models.db import Contact, Payment, Product, User
from services.security import current_user

router = APIRouter(prefix="/api", tags=["commerce"])


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(ge=0, le=10_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=5)
    notes: str = Field(default="", max_length=2000)


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    price: float | None = Field(default=None, ge=0, le=10_000_000)
    currency: str | None = Field(default=None, min_length=3, max_length=5)
    notes: str | None = Field(default=None, max_length=2000)


class PaymentIn(BaseModel):
    product_id: str | None = None
    contact_id: str | None = None
    amount: float = Field(gt=0, le=10_000_000)
    currency: str = Field(default="USD", min_length=3, max_length=5)
    note: str = Field(default="", max_length=300)


def _product_out(p: Product) -> dict:
    return {"id": p.id, "name": p.name, "price": p.price, "currency": p.currency,
            "notes": p.notes, "created_at": p.created_at.isoformat()}


class PaymentPatch(BaseModel):
    amount: float | None = Field(default=None, gt=0, le=10_000_000)
    currency: str | None = Field(default=None, min_length=3, max_length=5)
    note: str | None = Field(default=None, max_length=300)


def _payment_out(pay: Payment) -> dict:
    return {"id": pay.id, "product_id": pay.product_id, "contact_id": pay.contact_id,
            "amount": pay.amount, "currency": pay.currency, "status": pay.status,
            "note": pay.note, "created_at": pay.created_at.isoformat()}


@router.get("/products")
def list_products(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Product).where(Product.owner_id == user.id)).scalars().all()
    return {"items": [_product_out(p) for p in rows]}


@router.post("/products", status_code=201)
def create_product(body: ProductIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = Product(owner_id=user.id, **body.model_dump())
    db.add(p)
    db.commit()
    return _product_out(p)


@router.patch("/products/{product_id}")
def patch_product(product_id: str, body: ProductPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p or p.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="product_not_found")
    for k, v in body.model_dump().items():
        if v is not None:
            setattr(p, k, v)
    db.commit()
    return _product_out(p)


@router.delete("/products/{product_id}")
def delete_product(product_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p or p.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="product_not_found")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.get("/payments")
def list_payments(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Payment).where(Payment.owner_id == user.id)
                      .order_by(Payment.created_at.desc())).scalars().all()
    return {"items": [_payment_out(p) for p in rows]}


@router.post("/payments", status_code=201)
def create_payment(body: PaymentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.product_id:
        p = db.get(Product, body.product_id)
        if not p or p.owner_id != user.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_product")
    if body.contact_id:
        c = db.get(Contact, body.contact_id)
        if not c or c.owner_id != user.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_contact")
    pay = Payment(owner_id=user.id, **body.model_dump())
    db.add(pay)
    db.commit()
    return _payment_out(pay)


@router.patch("/payments/{payment_id}")
def patch_payment(payment_id: str, body: PaymentPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pay = db.get(Payment, payment_id)
    if not pay or pay.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="payment_not_found")
    for k, v in body.model_dump().items():
        if v is not None:
            setattr(pay, k, v)
    db.commit()
    return _payment_out(pay)


@router.delete("/payments/{payment_id}")
def delete_payment(payment_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    pay = db.get(Payment, payment_id)
    if not pay or pay.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="payment_not_found")
    db.delete(pay)
    db.commit()
    return {"ok": True}
