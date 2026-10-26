
import os
import re
import ipaddress
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from enum import Enum
from urllib.parse import urlsplit, urlunsplit

import jwt
from pwdlib import PasswordHash
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Query,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    or_,
    select,
)
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


# =========================================================
# CONFIGURATION
# =========================================================

password_hash = PasswordHash.recommended()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not JWT_SECRET_KEY or len(JWT_SECRET_KEY) < 32:
    raise RuntimeError(
        "JWT_SECRET_KEY est absente ou trop courte. "
        "Configure une clé secrète d'au moins 32 caractères."
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


# =========================================================
# BASE DE DONNÉES ET MODÈLES
# =========================================================

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

    resource_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    normalized_value: Mapped[str] = mapped_column(
        String(2048),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)

    indicator_id: Mapped[int] = mapped_column(
        ForeignKey("indicators.id"),
        index=True,
        nullable=False,
    )

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        index=True,
        nullable=True,
    )

    threat_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    report_status: Mapped[str] = mapped_column(
        String(20),
        default=ReportStatus.pending.value,
        index=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class User(Base):
    __tablename__ = "users"

    __table_args__ = (
        UniqueConstraint("username", name="uq_user_username"),
        UniqueConstraint("email", name="uq_user_email"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    username: Mapped[str] = mapped_column(
        String(30),
        index=True,
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(254),
        index=True,
        nullable=False,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# =========================================================
# SCHÉMAS PYDANTIC
# =========================================================

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

    @field_validator("username", "email", "password", mode="before")
    @classmethod
    def strip_text(cls, value):
        if not isinstance(value, str):
            raise ValueError("Une chaîne de caractères est requise.")
        if value != value.strip() and cls.__name__ == "UserRegister":
            # Le mot de passe ne doit pas être silencieusement modifié.
            # Les autres champs seront normalisés dans la route.
            pass
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not valid_email(value):
            raise ValueError("Adresse e-mail invalide.")
        return value


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

    @field_validator("value", "threat_type", "description", mode="before")
    @classmethod
    def clean_text(cls, value):
        if not isinstance(value, str):
            raise ValueError("Une valeur textuelle est requise.")

        value = value.strip()

        if any(
            ord(char) < 32 and char not in "\n\r\t"
            for char in value
        ):
            raise ValueError("Les caractères de contrôle sont interdits.")

        return value

    @field_validator("threat_type")
    @classmethod
    def validate_threat_type(cls, value: str) -> str:
        value = value.strip().lower()

        if not value or not any(char.isalnum() for char in value):
            raise ValueError("Type de menace invalide.")

        return value

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        value = value.strip()

        if len(value) < 10:
            raise ValueError(
                "La description doit contenir au moins 10 caractères."
            )

        if not any(char.isalnum() for char in value):
            raise ValueError("La description doit contenir du texte utile.")

        return value


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


# =========================================================
# VALIDATION DES RESSOURCES
# =========================================================

def valid_email(value: str) -> bool:
    if not isinstance(value, str) or len(value) > 254:
        return False

    if value.count("@") != 1:
        return False

    local, domain = value.rsplit("@", 1)

    if (
        not local
        or len(local) > 64
        or local.startswith(".")
        or local.endswith(".")
        or ".." in local
        or not re.fullmatch(
            r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+",
            local,
        )
    ):
        return False

    try:
        normalize_domain(domain)
    except ValueError:
        return False

    return True


def normalize_domain(domain: str) -> str:
    domain = domain.rstrip(".").lower()

    if not domain or len(domain) > 253 or "." not in domain:
        raise ValueError("Nom de domaine invalide.")

    try:
        domain = domain.encode("idna").decode("ascii")
    except UnicodeError:
        raise ValueError("Nom de domaine invalide.")

    if len(domain) > 253:
        raise ValueError("Nom de domaine invalide.")

    labels = domain.split(".")

    for label in labels:
        if (
            not label
            or len(label) > 63
            or not re.fullmatch(
                r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?",
                label,
            )
        ):
            raise ValueError("Nom de domaine invalide.")

    try:
        ipaddress.ip_address(domain)
    except ValueError:
        pass
    else:
        raise ValueError(
            "Pour une adresse IP, sélectionnez le type Adresse IP."
        )

    return domain


def normalize_resource(
    resource_type: ResourceType,
    value: str,
) -> str:
    if not isinstance(value, str):
        raise HTTPException(
            status_code=400,
            detail="La ressource doit être une chaîne de caractères.",
        )

    value = value.strip()

    if not value:
        raise HTTPException(
            status_code=400,
            detail="La ressource est obligatoire.",
        )

    if len(value) > 2048:
        raise HTTPException(
            status_code=400,
            detail="La ressource est trop longue.",
        )

    if any(ord(char) < 32 or char.isspace() for char in value):
        raise HTTPException(
            status_code=400,
            detail="La ressource ne doit contenir ni espace "
                   "ni caractère de contrôle.",
        )

    if resource_type == ResourceType.ip:
        try:
            return str(ipaddress.ip_address(value))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Adresse IP invalide.",
            )

    if resource_type == ResourceType.domain:
        try:
            return normalize_domain(value)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    if resource_type == ResourceType.email:
        if not valid_email(value):
            raise HTTPException(
                status_code=400,
                detail="Adresse e-mail invalide.",
            )

        local, domain = value.rsplit("@", 1)
        return f"{local}@{normalize_domain(domain)}"

    if resource_type == ResourceType.url:
        try:
            parsed = urlsplit(value)
            scheme = parsed.scheme.lower()
            hostname = parsed.hostname
            port = parsed.port
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="URL ou port invalide.",
            )

        if (
            scheme not in {"http", "https"}
            or not parsed.netloc
            or not hostname
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "URL invalide : utilisez HTTP ou HTTPS, "
                    "avec un hôte valide et sans identifiants."
                ),
            )

        if port is not None and not 1 <= port <= 65535:
            raise HTTPException(
                status_code=400,
                detail="Port URL invalide.",
            )

        try:
            normalized_host = str(ipaddress.ip_address(hostname))
        except ValueError:
            try:
                normalized_host = normalize_domain(hostname)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Nom d'hôte invalide dans l'URL.",
                )

        if ":" in normalized_host:
            normalized_host = f"[{normalized_host}]"

        netloc = normalized_host
        if port is not None:
            netloc = f"{netloc}:{port}"

        return urlunsplit(
            (
                scheme,
                netloc,
                parsed.path,
                parsed.query,
                parsed.fragment,
            )
        )

    raise HTTPException(
        status_code=400,
        detail="Type de ressource non pris en charge.",
    )


# =========================================================
# BASE DE DONNÉES ET APPLICATION
# =========================================================

def get_db():
    with Session(engine) as session:
        yield session


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Adapté au MVP. Prévoir des migrations Alembic pour la production.
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


# =========================================================
# AUTHENTIFICATION JWT
# =========================================================

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentification invalide ou expirée.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token_payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp"]},
        )

        user_id = token_payload.get("sub")

        if not isinstance(user_id, str) or not user_id.isdigit():
            raise credentials_exception

    except jwt.InvalidTokenError:
        raise credentials_exception

    user = db.get(User, int(user_id))

    if user is None:
        raise credentials_exception

    return user


# =========================================================
# ROUTES : AUTHENTIFICATION
# =========================================================

@app.post("/api/v1/auth/register", status_code=status.HTTP_201_CREATED)
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

    if not valid_email(email):
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
            detail=(
                "Ce nom d'utilisateur ou cette adresse e-mail "
                "est déjà utilisé."
            ),
        )

    user = User(
        username=username,
        email=email,
        password_hash=password_hash.hash(payload.password),
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ce nom d'utilisateur ou cette adresse e-mail est déjà utilisé.",
        )

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Impossible de créer le compte.",
        )

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "created_at": user.created_at,
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
            status_code=status.HTTP_401_UNAUTHORIZED,
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


# =========================================================
# ROUTES : STATISTIQUES ET SANTÉ
# =========================================================

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
    return {
        "status": "ok",
        "service": "hti-api",
    }


# =========================================================
# ROUTES : SIGNALEMENTS
# =========================================================


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

    try:
        # Cherche un indicateur déjà existant.
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

            try:
                # Tente de créer l'indicateur.
                db.flush()
            except IntegrityError:
                # Une autre requête a peut-être créé le même indicateur.
                db.rollback()

                indicator = db.scalar(
                    select(Indicator).where(
                        Indicator.resource_type == payload.resource_type.value,
                        Indicator.normalized_value == normalized,
                    )
                )

                if indicator is None:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Conflit lors de la création de "
                            "l'indicateur. Réessayez."
                        ),
                    )

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
            indicator_id=report.indicator_id,
            report_status=report.report_status,
        )

    except HTTPException:
        db.rollback()
        raise

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "Conflit de données lors de l'enregistrement "
                "du signalement."
            ),
        )

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Impossible d'enregistrer le signalement.",
        )


@app.get("/api/v1/reports/mine")
def get_my_reports(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(
        default=None,
        alias="status",
    ),
    resource_type: ResourceType | None = Query(default=None),
    search: str | None = Query(
        default=None,
        min_length=1,
        max_length=200,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historique personnel de l'utilisateur connecté."""

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

    if status_filter is not None:
        status_filter = status_filter.strip().lower()

        if status_filter not in {item.value for item in ReportStatus}:
            raise HTTPException(
                status_code=422,
                detail="Statut invalide.",
            )

        statement = statement.where(
            Report.report_status == status_filter
        )
        count_statement = count_statement.where(
            Report.report_status == status_filter
        )

    if resource_type is not None:
        statement = statement.where(
            Indicator.resource_type == resource_type.value
        )
        count_statement = count_statement.where(
            Indicator.resource_type == resource_type.value
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
                "created_at": report.created_at,
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
    status_filter: str | None = Query(
        default=None,
        alias="status",
    ),
    resource_type: ResourceType | None = Query(default=None),
    search: str | None = Query(
        default=None,
        min_length=1,
        max_length=200,
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste uniquement les signalements confirmés."""

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

    if status_filter is not None:
        status_filter = status_filter.strip().lower()

        if status_filter not in {item.value for item in ReportStatus}:
            raise HTTPException(
                status_code=422,
                detail="Statut invalide.",
            )

        # Cette route publique de consultation ne divulgue jamais
        # les rapports en attente ou rejetés.
        if status_filter != ReportStatus.confirmed.value:
            return {
                "items": [],
                "total": 0,
                "limit": limit,
                "offset": offset,
            }

    if resource_type is not None:
        statement = statement.where(
            Indicator.resource_type == resource_type.value
        )
        count_statement = count_statement.where(
            Indicator.resource_type == resource_type.value
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
                "created_at": report.created_at,
            }
            for report, indicator in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# =========================================================
# ROUTE : RECHERCHE D'INDICATEURS
# =========================================================

@app.get(
    "/api/v1/search",
    response_model=SearchResult,
)
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

    confirmed_count = db.scalar(
        select(func.count(Report.id)).where(
            Report.indicator_id == indicator.id,
            Report.report_status == ReportStatus.confirmed.value,
        )
    ) or 0

    # Les résultats publics ne révèlent pas les signalements
    # en attente ou rejetés.
    report_count = confirmed_count

    verdict = (
        "reported_confirmed"
        if confirmed_count > 0
        else "unknown"
    )

    return SearchResult(
        found=True,
        resource_type=indicator.resource_type,
        value=indicator.normalized_value,
        report_count=report_count,
        confirmed_count=confirmed_count,
        verdict=verdict,
    )
