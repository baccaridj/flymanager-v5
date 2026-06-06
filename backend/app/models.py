from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(40), default="admin")
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, default=1)


class Documento(Base):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    filepath: Mapped[str] = mapped_column(String(500), default="")
    classification: Mapped[str] = mapped_column(String(40), index=True)
    extracted_data: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(40), default="done")
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    email: Mapped[str] = mapped_column(String(180), default="")
    phone: Mapped[str] = mapped_column(String(80), default="")
    document: Mapped[str] = mapped_column(String(80), default="")
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, default=1)


class Fornecedor(Base):
    __tablename__ = "fornecedores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(180), index=True)
    type: Mapped[str] = mapped_column(String(80), default="airline")
    email: Mapped[str] = mapped_column(String(180), default="")
    commission: Mapped[float] = mapped_column(Float, default=0)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, default=1)


class Venda(Base):
    __tablename__ = "vendas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    passenger: Mapped[str] = mapped_column(String(180), index=True)
    locator: Mapped[str] = mapped_column(String(20), index=True, default="")
    ticket: Mapped[str] = mapped_column(String(30), index=True, default="")
    airline: Mapped[str] = mapped_column(String(12), default="")
    route: Mapped[str] = mapped_column(String(120), default="")
    dates: Mapped[str] = mapped_column(String(120), default="")
    total: Mapped[float] = mapped_column(Float, default=0)
    du: Mapped[float] = mapped_column(Float, default=0)
    rav: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(40), default="active")
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, default=1)
    documento_id: Mapped[int | None] = mapped_column(ForeignKey("documentos.id"), nullable=True)


class Movimento(Base):
    __tablename__ = "movimentos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(40), default="credit")
    category: Mapped[str] = mapped_column(String(120), default="document")
    amount: Mapped[float] = mapped_column(Float, default=0)
    payment_method: Mapped[str] = mapped_column(String(80), default="")
    reconciled: Mapped[bool] = mapped_column(Boolean, default=False)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, default=1)
    documento_id: Mapped[int | None] = mapped_column(ForeignKey("documentos.id"), nullable=True)


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action: Mapped[str] = mapped_column(String(80))
    entity: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
