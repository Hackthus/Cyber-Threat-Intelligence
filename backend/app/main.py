import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from enum import Enum
from urllib.parse import urlsplit
from fastapi.middleware.cors import CORSMiddleware

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


class ReportCreate(BaseModel):
    resource_type: ResourceType
    value: str = Field(min_length=3, max_length=2048)
    threat_type: str = Field(min_length=2, max_length=50)
    description: str = Field(min_length=10, max_length=2000)


class ReportCreated(BaseModel):
    id: int
    indicator_id: int
    report_status: str


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
    title="Hackthus Threat Intelligence API",
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
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/v1/stats")
def get_stats(db: Session = Depends(get_db)):
    """Retourne les statistiques globales de la plateforme HTI."""

    total_indicators = db.scalar(
        select(func.count(Indicator.id))
    ) or 0

    total_reports = db.scalar(
        select(func.count(Report.id))
    ) or 0

    pending_reports = db.scalar(
        select(func.count(Report.id)).where(
            Report.report_status == ReportStatus.pending.value
        )
    ) or 0

    confirmed_reports = db.scalar(
        select(func.count(Report.id)).where(
            Report.report_status == ReportStatus.confirmed.value
        )
    ) or 0

    rejected_reports = db.scalar(
        select(func.count(Report.id)).where(
            Report.report_status == ReportStatus.rejected.value
        )
    ) or 0

    return {
        "total_indicators": total_indicators,
        "total_reports": total_reports,
        "pending_reports": pending_reports,
        "confirmed_reports": confirmed_reports,
        "rejected_reports": rejected_reports,
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



@app.get("/api/v1/reports")
def list_reports(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """Liste les signalements récents, du plus récent au plus ancien."""

    statement = (
        select(Report, Indicator)
        .join(Indicator, Report.indicator_id == Indicator.id)
        .order_by(Report.created_at.desc(), Report.id.desc())
        .offset(offset)
        .limit(limit)
    )

    rows = db.execute(statement).all()

    total = db.scalar(select(func.count(Report.id))) or 0

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

    report_count = db.scalar(
        select(func.count(Report.id)).where(
            Report.indicator_id == indicator.id
        )
    ) or 0

    confirmed_count = db.scalar(
        select(func.count(Report.id)).where(
            Report.indicator_id == indicator.id,
            Report.report_status == ReportStatus.confirmed.value,
        )
    ) or 0

    # Un signalement en attente ne constitue pas une preuve.
    if confirmed_count > 0:
        verdict = "reported_confirmed"
    elif report_count > 0:
        verdict = "under_review"
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
