import os
from datetime import date
from pathlib import Path
from uuid import uuid4

import anthropic
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, engine, get_db
from .models import Cliente, Documento, Fornecedor, Log, Movimento, Usuario, Venda
from .schemas import ClienteIn, ClienteOut, DocumentoOut, LoginRequest, MovimentoOut, RegisterRequest, StatsOut, Token, VendaIn, VendaOut
from .security import create_token, get_current_user, hash_password, verify_password
from .services.extraction import classify, extract, read_file_text

app = FastAPI(title=settings.app_name)

# CORS — allow dev origins + FRONTEND_URL env var (set on Railway)
_default_origins = [
    "http://127.0.0.1:5173", "http://localhost:5173",
    "http://127.0.0.1:5174", "http://localhost:5174",
    "http://127.0.0.1:5175", "http://localhost:5175",
    "http://127.0.0.1:5176", "http://localhost:5176",
    "http://127.0.0.1:5177", "http://localhost:5177",
]
_extra_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
_cors_origins = _default_origins + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    settings.storage_dir.mkdir(exist_ok=True)
    Base.metadata.create_all(bind=engine)
    with next(get_db()) as db:
        if not db.scalar(select(Usuario).where(Usuario.email == "admin@flymanager.local")):
            db.add(Usuario(name="Fly Admin", email="admin@flymanager.local", password_hash=hash_password("flymanager"), role="admin", tenant_id=1))
        if not db.scalar(select(Fornecedor).where(Fornecedor.name == "LATAM")):
            db.add_all(
                [
                    Fornecedor(name="LATAM", type="airline", email="groups@latam.local", commission=7, tenant_id=1),
                    Fornecedor(name="Copa Airlines", type="airline", email="sales@copa.local", commission=7, tenant_id=1),
                ]
            )
        db.commit()


def log(db: Session, user: Usuario, action: str, entity: str, description: str) -> None:
    db.add(Log(action=action, entity=entity, description=description, tenant_id=user.tenant_id))


@app.post("/api/auth/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> Token:
    user = db.scalar(select(Usuario).where(Usuario.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return Token(access_token=create_token(user))


@app.post("/api/auth/register", response_model=Token)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> Token:
    if db.scalar(select(Usuario).where(Usuario.email == payload.email)):
        raise HTTPException(status_code=409, detail="Email already exists")
    tenant_id = (db.scalar(select(Usuario.tenant_id).order_by(Usuario.tenant_id.desc())) or 0) + 1
    user = Usuario(name=payload.name, email=payload.email, password_hash=hash_password(payload.password), role="admin", tenant_id=tenant_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return Token(access_token=create_token(user))


@app.post("/api/upload", response_model=DocumentoOut)
async def upload(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: Usuario = Depends(get_current_user),
) -> Documento:
    filename = file.filename if file else "pasted-text.txt"
    filepath = ""
    content = text or ""

    if file:
        safe_name = f"{uuid4().hex}_{Path(file.filename or 'upload').name}"
        destination = settings.storage_dir / safe_name
        destination.write_bytes(await file.read())
        filepath = str(destination)
        content = "\n".join([content, read_file_text(destination)]).strip()

    classification = classify(content)
    extracted_data = extract(content, classification)
    document = Documento(
        filename=filename,
        filepath=filepath,
        classification=classification,
        extracted_data=extracted_data,
        status="done",
        tenant_id=user.tenant_id,
    )
    db.add(document)
    db.flush()
    auto_action(db, user, document)
    log(db, user, "upload", "documentos", f"{filename} classified as {classification}")
    db.commit()
    db.refresh(document)
    return document


def auto_action(db: Session, user: Usuario, document: Documento) -> None:
    data = document.extracted_data or {}
    if document.classification == "eticket":
        db.add(
            Venda(
                passenger=str(data.get("passenger", "")),
                locator=str(data.get("locator", "")),
                ticket=str(data.get("ticket", "")),
                airline=str(data.get("airline", "")),
                route=", ".join(data.get("routes", [])[:2]),
                dates=", ".join(data.get("dates", [])[:2]),
                total=float(max(data.get("values", [0]) or [0])),
                du=0,
                rav=0,
                status="active",
                tenant_id=user.tenant_id,
                documento_id=document.id,
            )
        )
    if document.classification in {"pix", "extrato", "fatura"}:
        db.add(
            Movimento(
                type="credit" if document.classification == "pix" else "debit",
                category=document.classification,
                amount=float(max(data.get("values", [0]) or [0])),
                payment_method="PIX" if document.classification == "pix" else "statement",
                reconciled=document.classification == "pix",
                tenant_id=user.tenant_id,
                documento_id=document.id,
            )
        )
    if document.classification == "xml_import":
        for item in data.get("xml_sales", []):
            db.add(
                Venda(
                    passenger=item.get("passenger") or item.get("passageiro") or "",
                    locator=item.get("locator") or item.get("localizador") or "",
                    ticket=item.get("ticket") or item.get("bilhete") or "",
                    airline=item.get("airline") or item.get("cia") or "",
                    route=item.get("route") or item.get("rota") or "",
                    dates=item.get("dates") or item.get("datas") or "",
                    total=float(item.get("total") or 0),
                    tenant_id=user.tenant_id,
                    documento_id=document.id,
                )
            )


@app.get("/api/documents", response_model=list[DocumentoOut])
def documents(search: str = "", classification: str = "all", db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> list[Documento]:
    stmt = select(Documento).where(Documento.tenant_id == user.tenant_id).order_by(Documento.created_at.desc())
    if classification != "all":
        stmt = stmt.where(Documento.classification == classification)
    if search:
        stmt = stmt.where(or_(Documento.filename.ilike(f"%{search}%"), Documento.classification.ilike(f"%{search}%")))
    return list(db.scalars(stmt))


@app.get("/api/documents/{document_id}", response_model=DocumentoOut)
def document_detail(document_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> Documento:
    document = db.get(Documento, document_id)
    if not document or document.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> dict:
    document = db.get(Documento, document_id)
    if not document or document.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")
    if document.filepath:
        Path(document.filepath).unlink(missing_ok=True)
    db.delete(document)
    log(db, user, "delete", "documentos", document.filename)
    db.commit()
    return {"ok": True}


@app.get("/api/sales", response_model=list[VendaOut])
def list_sales(search: str = "", db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> list[Venda]:
    stmt = select(Venda).where(Venda.tenant_id == user.tenant_id).order_by(Venda.id.desc())
    if search:
        stmt = stmt.where(or_(Venda.passenger.ilike(f"%{search}%"), Venda.locator.ilike(f"%{search}%"), Venda.ticket.ilike(f"%{search}%")))
    return list(db.scalars(stmt))


@app.post("/api/sales", response_model=VendaOut)
def create_sale(payload: VendaIn, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> Venda:
    sale = Venda(**payload.model_dump(), tenant_id=user.tenant_id)
    db.add(sale)
    log(db, user, "create", "vendas", payload.passenger)
    db.commit()
    db.refresh(sale)
    return sale


@app.put("/api/sales/{sale_id}", response_model=VendaOut)
def update_sale(sale_id: int, payload: VendaIn, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> Venda:
    sale = db.get(Venda, sale_id)
    if not sale or sale.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Sale not found")
    for key, value in payload.model_dump().items():
        setattr(sale, key, value)
    db.commit()
    db.refresh(sale)
    return sale


@app.delete("/api/sales/{sale_id}")
def delete_sale(sale_id: int, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> dict:
    sale = db.get(Venda, sale_id)
    if not sale or sale.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Sale not found")
    db.delete(sale)
    db.commit()
    return {"ok": True}


@app.get("/api/clients", response_model=list[ClienteOut])
def list_clients(search: str = "", db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> list[Cliente]:
    stmt = select(Cliente).where(Cliente.tenant_id == user.tenant_id).order_by(Cliente.name)
    if search:
        stmt = stmt.where(or_(Cliente.name.ilike(f"%{search}%"), Cliente.email.ilike(f"%{search}%"), Cliente.document.ilike(f"%{search}%")))
    return list(db.scalars(stmt))


@app.post("/api/clients", response_model=ClienteOut)
def create_client(payload: ClienteIn, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> Cliente:
    client = Cliente(**payload.model_dump(), tenant_id=user.tenant_id)
    db.add(client)
    log(db, user, "create", "clientes", payload.name)
    db.commit()
    db.refresh(client)
    return client


@app.put("/api/clients/{client_id}", response_model=ClienteOut)
def update_client(client_id: int, payload: ClienteIn, db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> Cliente:
    client = db.get(Cliente, client_id)
    if not client or client.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Client not found")
    for key, value in payload.model_dump().items():
        setattr(client, key, value)
    db.commit()
    db.refresh(client)
    return client


@app.get("/api/transactions", response_model=list[MovimentoOut])
def transactions(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> list[Movimento]:
    return list(db.scalars(select(Movimento).where(Movimento.tenant_id == user.tenant_id).order_by(Movimento.id.desc())))


@app.post("/api/reconciliation", response_model=DocumentoOut)
async def reconciliation(text: str = Form(...), db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> Documento:
    return await upload(file=None, text=text, db=db, user=user)


_INSTAGRAM_PROMPTS: dict[str, str] = {
    "growth_plan": (
        "Crie uma estratégia completa de crescimento no Instagram para {niche} com foco em {audience}. "
        "Analise o comportamento da audiência, oportunidades de conteúdo, lacunas de posicionamento e alavancas de crescimento. "
        "Crie pilares de conteúdo, temas de postagem e estratégias de atração de audiência desenvolvidas para aumentar "
        "visualizações, seguidores e engajamento de forma consistente."
    ),
    "audience_research": (
        "Analise este público: {audience}. "
        "Identifique os maiores medos, objeções, motivações de compra e resultados desejados. "
        "Em seguida, gere temas de conteúdo e ângulos de post que naturalmente atraiam atenção, construam confiança e criem demanda."
    ),
    "viral_content": (
        "Gere 50 ideias de conteúdo para o Instagram para {niche} com foco em {audience}. "
        "Concentre-se em erros, mitos, opiniões impopulares, lições, frameworks, oportunidades ocultas, tendências e dores da audiência. "
        "Torne cada ideia específica, emocionalmente envolvente e otimizada para alcance e compartilhamentos."
    ),
    "reels_hook": (
        "Transforme esta ideia: {idea} em um roteiro de Reels de alta retenção para o Instagram. "
        "Comece com um gancho que para o scroll, siga com insights concisos e valiosos e termine com uma conclusão memorável ou chamada para ação. "
        "Mantenha a escrita conversacional, envolvente e otimizada para tempo de exibição."
    ),
    "content_optimizer": (
        "Analise este conteúdo: {content}. "
        "Identifique ganchos fracos, frases genéricas, posicionamento ruim, enchimento e tudo que reduz o engajamento. "
        "Em seguida, reescreva para melhorar clareza, impacto emocional, retenção e valor percebido mantendo o significado original intacto."
    ),
    "sales_content": (
        "Gere 20 ideias de conteúdo para o Instagram desenvolvidas para atrair leads ou vendas para {offer}. "
        "Aborde objeções, frustrações, objetivos, preocupações de compra e transformações desejadas da audiência. "
        "Torne o conteúdo educativo e valioso enquanto posiciona naturalmente a oferta como a solução."
    ),
    "content_repurpose": (
        "Pegue este conteúdo: {content} e transforme em Reels, carrosséis, legendas, conteúdo para Stories, threads e roteiros curtos. "
        "Adapte a estrutura para cada formato mantendo a mensagem central consistente e envolvente."
    ),
    "growth_system": (
        "Crie um sistema completo de crescimento e monetização no Instagram de 60 dias para {niche}. "
        "Inclua planejamento de conteúdo, táticas de crescimento de audiência, estrutura de postagem, fluxos de engajamento, "
        "métodos de geração de leads, sistemas de reaproveitamento de conteúdo e revisões de performance. "
        "Torne o fluxo de trabalho simples, escalável e realista para um criador solo."
    ),
}


@app.post("/api/instagram/generate")
async def instagram_generate(
    tool: str = Form(...),
    niche: str = Form(default=""),
    audience: str = Form(default=""),
    idea: str = Form(default=""),
    content: str = Form(default=""),
    offer: str = Form(default=""),
    user: Usuario = Depends(get_current_user),
) -> dict:
    template = _INSTAGRAM_PROMPTS.get(tool)
    if not template:
        raise HTTPException(status_code=400, detail=f"Ferramenta desconhecida: {tool}")
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY nao configurada")

    prompt = template.format(
        niche=niche or "nicho",
        audience=audience or "publico",
        idea=idea or "ideia",
        content=content or "conteudo",
        offer=offer or "oferta",
    )

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    message = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return {"result": message.content[0].text}


@app.get("/api/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db), user: Usuario = Depends(get_current_user)) -> StatsOut:
    today = date.today()
    docs = list(db.scalars(select(Documento).where(Documento.tenant_id == user.tenant_id)))
    sales = list(db.scalars(select(Venda).where(Venda.tenant_id == user.tenant_id)))
    movements = list(db.scalars(select(Movimento).where(Movimento.tenant_id == user.tenant_id)))
    return StatsOut(
        documents_today=sum(1 for item in docs if item.created_at.date() == today),
        active_sales=sum(1 for item in sales if item.status != "cancelled"),
        pending_reconciliation=sum(1 for item in movements if not item.reconciled),
        monthly_revenue=sum(item.total for item in sales if item.status != "cancelled"),
    )
