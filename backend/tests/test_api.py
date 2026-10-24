import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app import main


@pytest.fixture
def client(monkeypatch):
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    monkeypatch.setattr(main, "engine", test_engine)

    with TestClient(main.app) as test_client:
        yield test_client

    main.Base.metadata.drop_all(test_engine)
    test_engine.dispose()


def test_health(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_report(client):
    response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "phishing-demo.example",
            "threat_type": "phishing",
            "description": "Signalement fictif pour tester l'API.",
        },
    )

    assert response.status_code == 201
    assert response.json()["report_status"] == "pending"


def test_search_reported_domain(client):
    client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "phishing-demo.example",
            "threat_type": "phishing",
            "description": "Signalement fictif pour tester l'API.",
        },
    )

    response = client.get(
        "/api/v1/search",
        params={
            "resource_type": "domain",
            "value": "phishing-demo.example",
        },
    )

    assert response.status_code == 200
    assert response.json()["found"] is True
    assert response.json()["report_count"] == 1
    assert response.json()["verdict"] == "under_review"


def test_search_unknown_domain(client):
    response = client.get(
        "/api/v1/search",
        params={
            "resource_type": "domain",
            "value": "unknown-demo.example",
        },
    )

    assert response.status_code == 200
    assert response.json()["found"] is False
    assert response.json()["verdict"] == "unknown"


def test_reject_invalid_domain(client):
    response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "not-a-domain",
            "threat_type": "phishing",
            "description": "Signalement fictif pour tester l'API.",
        },
    )

    assert response.status_code == 400


def test_create_report_returns_pending_status(client):
    response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "suspicious-demo.example",
            "threat_type": "phishing",
            "description": "Page suspecte observée pendant un test.",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["id"] > 0
    assert data["indicator_id"] > 0
    assert data["report_status"] == "pending"


def test_create_report_rejects_invalid_domain(client):
    response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "not-a-valid-domain",
            "threat_type": "phishing",
            "description": "Domaine invalide pour le test.",
        },
    )

    assert response.status_code == 400


def test_create_report_rejects_missing_description(client):
    response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "suspicious-demo.example",
            "threat_type": "phishing",
        },
    )

    assert response.status_code == 422
