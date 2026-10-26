import os
import re
import ipaddress
from pwdlib import PasswordHash
from datetime import datetime, timedelta, timezone
import jwt
from fastapi.security import OAuth2PasswordBearer
from fastapi.security import OAuth2PasswordRequestForm
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from enum import Enum
from urllib.parse import urlsplit
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from fastapi import Depends, FastAPI, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

password_hash = PasswordHash.recommended()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not JWT_SECRET_KEY or len(JWT_SECRET_KEY) < 32:
    raise RuntimeError(
        "JWT_SECRET_KEY est absente ou trop courte."
    )

JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login"
)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./hti_dev.db",
)

connect_args = (
    {"check_same_thread": False}
    if DATABASE_URL.startswith("sqlite")
    else {}
)

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)


class Base(DeclarativeBase):
    pass


class ResourceType(str, Enum):
    url = "url"
    domain = "domain"
    email = "email"
    ip = "ip"


class ReportStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"


class Indicator(Base):
    __tablename__ = "indicators"
    __table_args__ = (
        UniqueConstraint(
            "resource_type",
            "normalized_value",
            name="uq_indicator_type_value",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(20))
    normalized_value: Mapped[str] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)

    indicator_id: Mapped[int] = mapped_column(
        ForeignKey("indicators.id"),
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        index=True,
        nullable=True,
    )

    threat_type: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(Text)

    report_status: Mapped[str] = mapped_column(
        String(20),
        default=ReportStatus.pending.value,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("username", name="uq_user_username"),
        UniqueConstraint("email", name="uq_user_email"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(30), index=True)
    email: Mapped[str] = mapped_column(String(254), index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class UserRegister(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=30,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    email: str = Field(
        min_length=5,
        max_length=254,
    )
    password: str = Field(
        min_length=12,
        max_length=128,
    )


class UserLogin(BaseModel):
    username_or_email: str = Field(
        min_length=3,
        max_length=254,
    )
    password: str = Field(
        min_length=1,
        max_length=128,
    )


class ReportCreate(BaseModel):
    resource_type: ResourceType
    value: str = Field(min_length=3, max_length=2048)
    threat_type: str = Field(min_length=2, max_length=50)
    description: str = Field(min_length=10, max_length=2000)


class ReportCreated(BaseModel):
    id: int
    indicator_id: int
    report_status: str


class ReportRead(BaseModel):
    id: int
    indicator_id: int
    user_id: int
    threat_type: str
    description: str
    report_status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)



class SearchResult(BaseModel):
    found: bool
    resource_type: str
    value: str
    report_count: int
    confirmed_count: int
    verdict: str



def normalize_resource(resource_type: ResourceType, value: str) -> str:
    value = value.strip()

    if any(ord(char) < 32 for char in value):
        raise HTTPException(400, "Caractères de contrôle interdits.")

    if resource_type == ResourceType.ip:
        try:
            return str(ipaddress.ip_address(value))
        except ValueError:
            raise HTTPException(
                400,
                "Adresse IP invalide. Saisissez une IPv4 ou une IPv6 valide.",
            )

    if resource_type == ResourceType.email:
        if value.count("@") != 1:
            raise HTTPException(400, "Adresse e-mail invalide.")

        local, domain = value.rsplit("@", 1)

        if (
            not local
            or len(local) > 64
            or not re.fullmatch(r"[A-Za-z0-9.-]+", domain)
            or "." not in domain
            or domain.startswith(".")
            or domain.endswith(".")
        ):
            raise HTTPException(400, "Adresse e-mail invalide.")

        return value.lower()

    if resource_type == ResourceType.domain:
        domain = value.rstrip(".").lower()

        if (
            len(domain) > 253
            or "." not in domain
            or not re.fullmatch(
                r"(?=.{1,253}$)"
                r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
                r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+",
                domain,
            )
        ):
            raise HTTPException(400, "Nom de domaine invalide.")

        return domain

    parsed = urlsplit(value)

    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise HTTPException(
            400,
            "URL invalide : utilisez HTTP ou HTTPS sans identifiants.",
        )

    try:
        parsed.port
    except ValueError:
        raise HTTPException(400, "Port URL invalide.")

    # Ne jamais visiter l'URL soumise.
    # On conserve le chemin et les paramètres pour la recherche.
    return value


def get_db():
    with Session(engine) as session:
        yield session


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Création pratique pour le MVP.
    # Nous migrerons vers Alembic avant un déploiement durable.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Cyber Threat Intelligence API",
    description=(
        "API communautaire de signalement et de recherche "
        "de ressources potentiellement malveillantes."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.post("/api/v1/auth/register", status_code=201)
def register_user(
    payload: UserRegister,
    db: Session = Depends(get_db),
):
    username = payload.username.strip()
    email = payload.email.strip().lower()

    if not re.fullmatch(r"[A-Za-z0-9_-]{3,30}", username):
        raise HTTPException(
            status_code=422,
            detail="Nom d'utilisateur invalide.",
        )

    if (
        len(email) > 254
        or not re.fullmatch(
            r"[^@\s]+@[^@\s]+\.[^@\s]+",
            email,
        )
    ):
        raise HTTPException(
            status_code=422,
            detail="Adresse e-mail invalide.",
        )

    existing_user = db.scalar(
        select(User).where(
            or_(
                func.lower(User.username) == username.lower(),
                func.lower(User.email) == email,
            )
        )
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=409,
            detail="Ce nom d'utilisateur ou cette adresse e-mail est déjà utilisé.",
        )

    user = User(
        username=username,
        email=email,
        password_hash=password_hash.hash(payload.password),
    )

    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Impossible de créer le compte. Vérifiez que le nom d'utilisateur et l'e-mail sont disponibles.",
        )

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "created_at": (
            user.created_at.isoformat()
            if user.created_at
            else None
        ),
    }



@app.post("/api/v1/auth/login")
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    identifier = form_data.username.strip()

    user = db.scalar(
        select(User).where(
            or_(
                func.lower(User.username) == identifier.lower(),
                func.lower(User.email) == identifier.lower(),
            )
        )
    )

    if user is None or not password_hash.verify(
        form_data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Identifiants incorrects.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(
        minutes=JWT_ACCESS_TOKEN_MINUTES
    )

    access_token = jwt.encode(
        {
            "sub": str(user.id),
            "username": user.username,
            "iat": now,
            "exp": expires_at,
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": JWT_ACCESS_TOKEN_MINUTES * 60,
    }



def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Authentification invalide ou expirée.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp"]},
        )
        user_id = payload.get("sub")

        if not isinstance(user_id, str) or not user_id.isdigit():
            raise credentials_exception

    except jwt.InvalidTokenError:
        raise credentials_exception

    user = db.get(User, int(user_id))

    if user is None:
        raise credentials_exception

    return user


@app.get("/api/v1/auth/me")
def read_current_user(
    current_user: User = Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "created_at": current_user.created_at,
    }



@app.get("/api/v1/stats")
def get_stats(db: Session = Depends(get_db)):
    """Retourne les statistiques publiques de la plateforme HTI."""

    confirmed_reports = db.scalar(
        select(func.count(Report.id)).where(
            Report.report_status == ReportStatus.confirmed.value
        )
    ) or 0

    confirmed_indicators = db.scalar(
        select(func.count(func.distinct(Report.indicator_id))).where(
            Report.report_status == ReportStatus.confirmed.value
        )
    ) or 0

    return {
        "total_indicators": confirmed_indicators,
        "total_reports": confirmed_reports,
        "confirmed_reports": confirmed_reports,
    }


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "hti-api"}


@app.post(
    "/api/v1/reports",
    response_model=ReportCreated,
    status_code=status.HTTP_201_CREATED,
)

def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    normalized = normalize_resource(
        payload.resource_type,
        payload.value,
    )

    indicator = db.scalar(
        select(Indicator).where(
            Indicator.resource_type == payload.resource_type.value,
            Indicator.normalized_value == normalized,
        )
    )

    if indicator is None:
        indicator = Indicator(
            resource_type=payload.resource_type.value,
            normalized_value=normalized,
        )
        db.add(indicator)
        db.flush()

    report = Report(
        indicator_id=indicator.id,
        user_id=current_user.id,
        threat_type=payload.threat_type.strip().lower(),
        description=payload.description.strip(),
        report_status=ReportStatus.pending.value,
    )

    db.add(report)
    db.commit()
    db.refresh(report)

    return ReportCreated(
        id=report.id,
        indicator_id=indicator.id,
        report_status=report.report_status,
    )


@app.get("/api/v1/reports/mine")
def get_my_reports(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retourne l'historique personnel de l'utilisateur connecté."""

    statement = (
        select(Report, Indicator)
        .join(Indicator, Report.indicator_id == Indicator.id)
        .where(Report.user_id == current_user.id)
    )

    count_statement = (
        select(func.count(Report.id))
        .join(Indicator, Report.indicator_id == Indicator.id)
        .where(Report.user_id == current_user.id)
    )

    if status is not None:
        status = status.strip().lower()

        if status not in {"pending", "confirmed", "rejected"}:
            raise HTTPException(
                status_code=422,
                detail="Statut invalide.",
            )

        statement = statement.where(Report.report_status == status)
        count_statement = count_statement.where(
            Report.report_status == status
        )

    if resource_type is not None:
        resource_type = resource_type.strip().lower()

        if resource_type not in {"url", "domain", "email", "ip"}:
            raise HTTPException(
                status_code=422,
                detail="Type de ressource invalide.",
            )

        statement = statement.where(
            Indicator.resource_type == resource_type
        )
        count_statement = count_statement.where(
            Indicator.resource_type == resource_type
        )

    if search is not None:
        search_term = f"%{search.strip()}%"
        search_filter = or_(
            Indicator.normalized_value.ilike(search_term),
            Report.threat_type.ilike(search_term),
            Report.description.ilike(search_term),
        )
        statement = statement.where(search_filter)
        count_statement = count_statement.where(search_filter)

    statement = (
        statement
        .order_by(Report.created_at.desc(), Report.id.desc())
        .offset(offset)
        .limit(limit)
    )

    rows = db.execute(statement).all()
    total = db.scalar(count_statement) or 0

    return {
        "items": [
            {
                "id": report.id,
                "indicator_id": indicator.id,
                "resource_type": indicator.resource_type,
                "value": indicator.normalized_value,
                "threat_type": report.threat_type,
                "description": report.description,
                "report_status": report.report_status,
                "created_at": (
                    report.created_at.isoformat()
                    if report.created_at
                    else None
                ),
            }
            for report, indicator in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/api/v1/reports/{report_id}")
def get_report_details(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = db.get(Report, report_id)

    if report is None:
        raise HTTPException(
            status_code=404,
            detail="Signalement introuvable.",
        )

    if report.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Vous n'êtes pas autorisé à consulter ce rapport.",
        )

    indicator = db.get(Indicator, report.indicator_id)

    if indicator is None:
        raise HTTPException(
            status_code=404,
            detail="Indicateur associé introuvable.",
        )

    return {
        "id": report.id,
        "indicator_id": indicator.id,
        "resource_type": indicator.resource_type,
        "value": indicator.normalized_value,
        "threat_type": report.threat_type,
        "description": report.description,
        "report_status": report.report_status,
        "created_at": report.created_at,
    }



@app.get("/api/v1/reports")
def list_reports(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste les signalements récents avec filtres et pagination."""

    
    statement = (
        select(Report, Indicator)
        .join(Indicator, Report.indicator_id == Indicator.id)
        .where(
            Report.report_status == ReportStatus.confirmed.value
        )
    )

    count_statement = (
        select(func.count(Report.id))
        .join(Indicator, Report.indicator_id == Indicator.id)
        .where(
            Report.report_status == ReportStatus.confirmed.value
        )
    )

        
    if status is not None:
        status = status.strip().lower()

        if status not in {"pending", "confirmed", "rejected"}:
            raise HTTPException(
                status_code=422,
                detail="Statut invalide.",
            )

        if status != ReportStatus.confirmed.value:
            return {
                "items": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
            }

        statement = statement.where(Report.report_status == status)
        count_statement = count_statement.where(
            Report.report_status == status
        )


    if resource_type is not None:
        resource_type = resource_type.strip().lower()
        if resource_type not in {"url", "domain", "email", "ip"}:
            raise HTTPException(
                status_code=422,
                detail="Type de ressource invalide.",
            )
        statement = statement.where(
            Indicator.resource_type == resource_type
        )
        count_statement = count_statement.where(
            Indicator.resource_type == resource_type
        )

    if search is not None:
        search_term = f"%{search.strip()}%"
        search_filter = or_(
            Indicator.normalized_value.ilike(search_term),
            Report.threat_type.ilike(search_term),
        )
        statement = statement.where(search_filter)
        count_statement = count_statement.where(search_filter)

    statement = (
        statement
        .order_by(Report.created_at.desc(), Report.id.desc())
        .offset(offset)
        .limit(limit)
    )

    rows = db.execute(statement).all()
    total = db.scalar(count_statement) or 0

    return {
        "items": [
            {
                "id": report.id,
                "indicator_id": indicator.id,
                "resource_type": indicator.resource_type,
                "value": indicator.normalized_value,
                "threat_type": report.threat_type,
                "description": report.description,
                "report_status": report.report_status,
                "created_at": (
                    report.created_at.isoformat()
                    if report.created_at
                    else None
                ),
            }
            for report, indicator in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@app.get("/api/v1/search", response_model=SearchResult)
def search_indicator(
    resource_type: ResourceType,
    value: str = Query(min_length=3, max_length=2048),
    db: Session = Depends(get_db),
):
    normalized = normalize_resource(resource_type, value)

    indicator = db.scalar(
        select(Indicator).where(
            Indicator.resource_type == resource_type.value,
            Indicator.normalized_value == normalized,
        )
    )

    if indicator is None:
        return SearchResult(
            found=False,
            resource_type=resource_type.value,
            value=normalized,
            report_count=0,
            confirmed_count=0,
            verdict="unknown",
        )

    
    # Compter uniquement les signalements confirmés.
    confirmed_count = db.scalar(
        select(func.count(Report.id)).where(
            Report.indicator_id == indicator.id,
            Report.report_status == ReportStatus.confirmed.value,
        )
    ) or 0

    # Les compteurs publics ne révèlent pas les signalements
    # en attente ou rejetés.
    report_count = confirmed_count

    if confirmed_count > 0:
        verdict = "reported_confirmed"
    else:
        verdict = "unknown"


    return SearchResult(
        found=True,
        resource_type=indicator.resource_type,
        value=indicator.normalized_value,
        report_count=report_count,
        confirmed_count=confirmed_count,
        verdict=verdict,
    )
