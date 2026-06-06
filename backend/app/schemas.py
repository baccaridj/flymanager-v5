from datetime import datetime
from typing import Any

from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class DocumentoOut(BaseModel):
    id: int
    filename: str
    classification: str
    extracted_data: dict[str, Any]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ClienteIn(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    document: str = ""


class ClienteOut(ClienteIn):
    id: int

    model_config = {"from_attributes": True}


class VendaIn(BaseModel):
    passenger: str
    locator: str = ""
    ticket: str = ""
    airline: str = ""
    route: str = ""
    dates: str = ""
    total: float = 0
    du: float = 0
    rav: float = 0
    status: str = "active"


class VendaOut(VendaIn):
    id: int

    model_config = {"from_attributes": True}


class MovimentoOut(BaseModel):
    id: int
    type: str
    category: str
    amount: float
    payment_method: str
    reconciled: bool

    model_config = {"from_attributes": True}


class StatsOut(BaseModel):
    documents_today: int
    active_sales: int
    pending_reconciliation: int
    monthly_revenue: float
