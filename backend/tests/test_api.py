import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from datetime import datetime, timedelta, timezone
import jwt
from sqlalchemy import select
from app.main import User

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
        # Créer un utilisateur de test
        register_response = test_client.post(
            "/api/v1/auth/register",
            json={
                "username": "testuser",
                "email": "testuser@example.com",
                "password": "TestPassword123!",
            },
        )
        assert register_response.status_code == 201

        # Se connecter pour obtenir le token JWT
        login_response = test_client.post(
            "/api/v1/auth/login",
            data={
                "username": "testuser",
                "password": "TestPassword123!",
            },
        )
        assert login_response.status_code == 200

        token = login_response.json()["access_token"]
        test_client.headers.update(
            {"Authorization": f"Bearer {token}"}
        )

        yield test_client

    main.Base.metadata.drop_all(test_engine)
    test_engine.dispose()


@pytest.fixture
def second_user_headers(client):
    # Créer un deuxième utilisateur
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "seconduser",
            "email": "seconduser@example.com",
            "password": "SecondPassword123!",
        },
    )
    assert register_response.status_code == 201

    # Récupérer son token
    login_response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "seconduser",
            "password": "SecondPassword123!",
        },
    )
    assert login_response.status_code == 200

    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


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
    assert response.json()["report_count"] == 0
    assert response.json()["confirmed_count"] == 0
    assert response.json()["verdict"] == "unknown"


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


def test_create_report_requires_authentication(client):
    response = client.post(
        "/api/v1/reports",
        headers={"Authorization": ""},
        json={
            "resource_type": "domain",
            "value": "unauthenticated-demo.example",
            "threat_type": "phishing",
            "description": "Test sans authentification.",
        },
    )

    assert response.status_code == 401


def test_list_reports_requires_authentication(client):
    response = client.get(
        "/api/v1/reports",
        headers={"Authorization": ""},
    )

    assert response.status_code == 401



def test_invalid_token_is_rejected(client):
    response = client.get(
        "/api/v1/reports",
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == 401


def test_user_cannot_read_another_users_report(
    client,
    second_user_headers,
):
    # Le premier utilisateur crée un rapport
    create_response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "private-demo.example",
            "threat_type": "phishing",
            "description": "Rapport privé pour tester les permissions.",
        },
    )

    assert create_response.status_code == 201
    report_id = create_response.json()["id"]

    # Le deuxième utilisateur tente de consulter ce rapport
    response = client.get(
        f"/api/v1/reports/{report_id}",
        headers=second_user_headers,
    )

    assert response.status_code == 403


def test_expired_token_is_rejected(client):
    expired_payload = {
        "sub": "1",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=5),
    }

    expired_token = jwt.encode(
        expired_payload,
        main.JWT_SECRET_KEY,
        algorithm=main.JWT_ALGORITHM,
    )

    response = client.get(
        "/api/v1/reports",
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert response.status_code == 401


def test_my_reports_only_returns_current_users_reports(client, second_user_headers):
    # L'utilisateur principal crée un rapport
    first_response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "first-user-demo.example",
            "threat_type": "phishing",
            "description": "Rapport du premier utilisateur.",
        },
    )
    assert first_response.status_code == 201

    # Le deuxième utilisateur crée son propre rapport
    second_response = client.post(
        "/api/v1/reports",
        headers=second_user_headers,
        json={
            "resource_type": "domain",
            "value": "second-user-demo.example",
            "threat_type": "phishing",
            "description": "Rapport du deuxième utilisateur.",
        },
    )
    assert second_response.status_code == 201

    # On récupère les rapports du premier utilisateur
    response = client.get("/api/v1/reports/mine")

    assert response.status_code == 200

    reports = response.json()["items"]
    report_values = [report["value"] for report in reports]

    assert "first-user-demo.example" in report_values
    assert "second-user-demo.example" not in report_values



def test_tampered_token_is_rejected(client):
    # Créer un token valide avec une signature légitime
    valid_payload = {
        "sub": "1",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
    }

    valid_token = jwt.encode(
        valid_payload,
        main.JWT_SECRET_KEY,
        algorithm=main.JWT_ALGORITHM,
    )

    # Modifier le contenu du token pour invalider sa signature
    parts = valid_token.split(".")
    tampered_token = ".".join(
        [parts[0], parts[1], "signature_invalide"]
    )

    response = client.get(
        "/api/v1/reports",
        headers={"Authorization": f"Bearer {tampered_token}"},
    )

    assert response.status_code == 401


def test_get_nonexistent_report_returns_404(client):
    response = client.get("/api/v1/reports/999999")

    assert response.status_code == 404


def test_current_user_requires_authentication(client):
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": ""},
    )

    assert response.status_code == 401


def test_current_user_returns_authenticated_user(client):
    response = client.get("/api/v1/auth/me")

    assert response.status_code == 200

    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "testuser@example.com"
    assert "id" in data


def test_search_rejects_value_too_short(client):
    response = client.get(
        "/api/v1/search",
        params={
            "resource_type": "domain",
            "value": "ab",
        },
    )

    assert response.status_code == 422


def test_search_rejects_value_too_long(client):
    response = client.get(
        "/api/v1/search",
        params={
            "resource_type": "domain",
            "value": "a" * 2049,
        },
    )

    assert response.status_code == 422


def test_search_rejects_invalid_resource_type(client):
    response = client.get(
        "/api/v1/search",
        params={
            "resource_type": "invalid_type",
            "value": "example.com",
        },
    )

    assert response.status_code == 422


def test_search_unknown_indicator_returns_expected_structure(client):
    response = client.get(
        "/api/v1/search",
        params={
            "resource_type": "domain",
            "value": "unknown-security-demo.example",
        },
    )

    assert response.status_code == 200

    data = response.json()
    assert data["found"] is False
    assert data["report_count"] == 0
    assert data["confirmed_count"] == 0
    assert data["verdict"] == "unknown"



def test_list_reports_rejects_limit_above_maximum(client):
    response = client.get(
        "/api/v1/reports",
        params={"limit": 101},
    )
    assert response.status_code == 422


def test_list_reports_rejects_zero_limit(client):
    response = client.get(
        "/api/v1/reports",
        params={"limit": 0},
    )
    assert response.status_code == 422


def test_list_reports_rejects_negative_offset(client):
    response = client.get(
        "/api/v1/reports",
        params={"offset": -1},
    )
    assert response.status_code == 422


def test_list_reports_rejects_invalid_status(client):
    response = client.get(
        "/api/v1/reports",
        params={"status": "malicious"},
    )
    assert response.status_code == 422


def test_list_reports_rejects_invalid_resource_type(client):
    response = client.get(
        "/api/v1/reports",
        params={"resource_type": "invalid"},
    )
    assert response.status_code == 422


def test_pending_report_is_not_publicly_accessible(
    client,
    second_user_headers,
):
    # Le premier utilisateur crée un rapport en attente.
    create_response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "pending-community-demo.example",
            "threat_type": "phishing",
            "description": "Rapport en attente de validation.",
        },
    )

    assert create_response.status_code == 201
    assert create_response.json()["report_status"] == "pending"

    report_id = create_response.json()["id"]

    # Le deuxième utilisateur ne doit pas accéder au rapport privé.
    response = client.get(
        f"/api/v1/reports/{report_id}",
        headers=second_user_headers,
    )

    assert response.status_code == 403



def test_community_list_excludes_pending_and_rejected_reports(
    client,
    second_user_headers,
):
    # Créer un signalement avec le premier utilisateur.
    pending_response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "pending-test.example",
            "threat_type": "phishing",
            "description": "Signalement en attente de validation.",
        },
    )
    assert pending_response.status_code in (200, 201)

    pending_id = pending_response.json()["id"]

    # La liste communautaire ne doit pas exposer ce signalement.
    community_response = client.get("/api/v1/reports")
    assert community_response.status_code == 200

    visible_ids = {
        item["id"] for item in community_response.json()["items"]
    }
    assert pending_id not in visible_ids

    # Le second utilisateur ne doit pas accéder au rapport en attente.
    direct_response = client.get(
        f"/api/v1/reports/{pending_id}",
        headers=second_user_headers,
    )
    assert direct_response.status_code == 403


def test_owner_can_view_own_pending_report_in_mine(client):
    create_response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "owner-pending-test.example",
            "threat_type": "phishing",
            "description": "Signalement personnel en attente.",
        },
    )

    assert create_response.status_code in (200, 201)
    report_id = create_response.json()["id"]

    mine_response = client.get("/api/v1/reports/mine")

    assert mine_response.status_code == 200

    data = mine_response.json()

    # Accepte une réponse paginée ou une liste directe.
    items = data["items"] if isinstance(data, dict) else data

    own_report = next(
        (item for item in items if item["id"] == report_id),
        None,
    )

    assert own_report is not None
    assert own_report["report_status"] == "pending"


def test_community_list_includes_confirmed_reports(client):
    # Créer un signalement
    create_response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "confirmed-test.example",
            "threat_type": "phishing",
            "description": "Signalement confirmé pour tester la communauté.",
        },
    )

    assert create_response.status_code == 201
    report_id = create_response.json()["id"]

    # Modifier le statut directement dans la base de test
    from sqlalchemy.orm import Session

    with Session(main.engine) as db:
        report = db.get(main.Report, report_id)
        assert report is not None
        report.report_status = main.ReportStatus.confirmed.value
        db.commit()

    # Vérifier que le signalement confirmé apparaît
    response = client.get("/api/v1/reports")

    assert response.status_code == 200
    data = response.json()

    visible_ids = {item["id"] for item in data["items"]}

    assert report_id in visible_ids
    assert data["total"] >= 1
    assert any(
        item["id"] == report_id
        and item["report_status"] == "confirmed"
        for item in data["items"]
    )


def test_search_ignores_pending_reports(client):
    create_response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "pending-search.example",
            "threat_type": "phishing",
            "description": "Signalement en attente pour tester la recherche.",
        },
    )

    assert create_response.status_code == 201

    response = client.get(
        "/api/v1/search",
        params={
            "resource_type": "domain",
            "value": "pending-search.example",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["found"] is True
    assert data["report_count"] == 0
    assert data["confirmed_count"] == 0
    assert data["verdict"] == "unknown"


def test_public_stats_do_not_expose_pending_or_rejected_counts(client):
    # Créer un signalement, qui est pending par défaut.
    create_response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "stats-pending.example",
            "threat_type": "phishing",
            "description": "Signalement en attente pour tester les statistiques.",
        },
    )

    assert create_response.status_code == 201

    # Vérifier les statistiques publiques.
    response = client.get("/api/v1/stats")

    assert response.status_code == 200
    data = response.json()

    assert "pending_reports" not in data
    assert "rejected_reports" not in data
    assert data["total_reports"] == 0
    assert data["confirmed_reports"] == 0



def set_test_user_role(client, role: str):
    with main.Session(main.engine) as db:
        user = db.scalar(
            select(main.User).where(main.User.username == "testuser")
        )
        assert user is not None
        user.role = role
        db.commit()

def test_regular_user_cannot_list_pending_reports(client):
    response = client.get("/api/v1/admin/reports/pending")

    assert response.status_code == 403


def test_moderator_can_list_pending_reports(client):
    set_test_user_role(client, "moderator")

    response = client.get("/api/v1/admin/reports/pending")

    assert response.status_code == 200
    assert "items" in response.json()
    assert "total" in response.json()


def test_moderator_cannot_moderate_missing_report(client):
    set_test_user_role(client, "moderator")

    response = client.patch(
        "/api/v1/admin/reports/999999/status",
        json={"report_status": "confirmed"},
    )

    assert response.status_code == 404

def create_test_report(client):
    response = client.post(
        "/api/v1/reports",
        json={
            "resource_type": "domain",
            "value": "suspicious-example-test.com",
            "threat_type": "phishing",
            "description": (
                "Domaine de test suspect utilisé pour vérifier "
                "le processus de modération."
            ),
        },
    )
    assert response.status_code == 201
    assert response.json()["report_status"] == "pending"
    return response.json()["id"]


def test_moderator_can_confirm_pending_report(client):
    set_test_user_role(client, "moderator")
    report_id = create_test_report(client)

    response = client.patch(
        f"/api/v1/admin/reports/{report_id}/status",
        json={"report_status": "confirmed"},
    )

    assert response.status_code == 200
    assert response.json()["report_status"] == "confirmed"


def test_moderator_can_reject_pending_report(client):
    set_test_user_role(client, "moderator")
    report_id = create_test_report(client)

    response = client.patch(
        f"/api/v1/admin/reports/{report_id}/status",
        json={"report_status": "rejected"},
    )

    assert response.status_code == 200
    assert response.json()["report_status"] == "rejected"


def test_moderator_cannot_moderate_report_twice(client):
    set_test_user_role(client, "moderator")
    report_id = create_test_report(client)

    first_response = client.patch(
        f"/api/v1/admin/reports/{report_id}/status",
        json={"report_status": "confirmed"},
    )
    assert first_response.status_code == 200

    second_response = client.patch(
        f"/api/v1/admin/reports/{report_id}/status",
        json={"report_status": "rejected"},
    )

    assert second_response.status_code == 409


def test_regular_user_cannot_change_report_status(client):
    report_id = create_test_report(client)

    response = client.patch(
        f"/api/v1/admin/reports/{report_id}/status",
        json={"report_status": "confirmed"},
    )

    assert response.status_code == 403

def test_moderation_creates_audit_entry(client):
    set_test_user_role(client, "moderator")
    report_id = create_test_report(client)

    response = client.patch(
        f"/api/v1/admin/reports/{report_id}/status",
        json={"report_status": "confirmed"},
    )

    assert response.status_code == 200

    with main.Session(main.engine) as db:
        audit = db.scalar(
            select(main.ModerationAudit).where(
                main.ModerationAudit.report_id == report_id
            )
        )

        assert audit is not None
        assert audit.moderator_id == 1
        assert audit.old_status == "pending"
        assert audit.new_status == "confirmed"



def test_regular_user_cannot_access_moderation_audit(client):
    response = client.get("/api/v1/admin/audit")

    assert response.status_code == 403


def test_moderator_cannot_access_moderation_audit(client):
    set_test_user_role(client, "moderator")

    response = client.get("/api/v1/admin/audit")

    assert response.status_code == 403


def test_admin_can_access_moderation_audit(client):
    set_test_user_role(client, "admin")

    response = client.get("/api/v1/admin/audit")

    assert response.status_code == 200
    assert "items" in response.json()
    assert "total" in response.json()
    assert response.json()["limit"] == 20
    assert response.json()["offset"] == 0



def test_moderation_audit_contains_decision_details(client):
    set_test_user_role(client, "moderator")
    report_id = create_test_report(client)

    moderation_response = client.patch(
        f"/api/v1/admin/reports/{report_id}/status",
        json={"report_status": "confirmed"},
    )
    assert moderation_response.status_code == 200

    set_test_user_role(client, "admin")

    audit_response = client.get("/api/v1/admin/audit")
    assert audit_response.status_code == 200

    items = audit_response.json()["items"]
    entry = next(
        item for item in items
        if item["report_id"] == report_id
    )

    assert entry["moderator_username"] == "testuser"
    assert entry["old_status"] == "pending"
    assert entry["new_status"] == "confirmed"


def test_moderation_audit_pagination_limit(client):
    set_test_user_role(client, "moderator")

    for _ in range(3):
        report_id = create_test_report(client)
        response = client.patch(
            f"/api/v1/admin/reports/{report_id}/status",
            json={"report_status": "confirmed"},
        )
        assert response.status_code == 200

    set_test_user_role(client, "admin")

    response = client.get("/api/v1/admin/audit?limit=2&offset=0")

    assert response.status_code == 200
    assert len(response.json()["items"]) == 2
    assert response.json()["limit"] == 2
    assert response.json()["offset"] == 0
    assert response.json()["total"] == 3


def test_moderation_audit_pagination_offset(client):
    set_test_user_role(client, "moderator")

    for _ in range(3):
        report_id = create_test_report(client)
        response = client.patch(
            f"/api/v1/admin/reports/{report_id}/status",
            json={"report_status": "confirmed"},
        )
        assert response.status_code == 200

    set_test_user_role(client, "admin")

    response = client.get("/api/v1/admin/audit?limit=2&offset=2")

    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
    assert response.json()["limit"] == 2
    assert response.json()["offset"] == 2
    assert response.json()["total"] == 3


# =========================================================
# TESTS : ADMINISTRATION DES UTILISATEURS
# =========================================================

def test_admin_can_list_users(client):
    set_test_user_role(client, "admin")

    response = client.get("/api/v1/admin/users")

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert any(user["username"] == "testuser" for user in data["items"])
    assert all("password_hash" not in user for user in data["items"])


def test_regular_user_cannot_list_users(client):
    response = client.get("/api/v1/admin/users")

    assert response.status_code == 403


def test_admin_can_search_users_by_username_or_email(client):
    set_test_user_role(client, "admin")

    response = client.get(
        "/api/v1/admin/users",
        params={"q": "testuser"},
    )

    assert response.status_code == 200
    data = response.json()
    assert any(user["username"] == "testuser" for user in data["items"])


def test_admin_can_filter_users_by_role(client):
    set_test_user_role(client, "admin")

    response = client.get(
        "/api/v1/admin/users",
        params={"role": "admin"},
    )

    assert response.status_code == 200
    data = response.json()
    assert all(user["role"] == "admin" for user in data["items"])
    assert any(user["username"] == "testuser" for user in data["items"])


def test_admin_can_change_another_users_role(client, second_user_headers):
    set_test_user_role(client, "admin")

    response = client.get(
        "/api/v1/admin/users",
        params={"q": "seconduser"},
    )
    assert response.status_code == 200

    second_user = next(
        user for user in response.json()["items"]
        if user["username"] == "seconduser"
    )

    response = client.patch(
        f"/api/v1/admin/users/{second_user['id']}/role",
        json={"role": "moderator"},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "moderator"


def test_admin_cannot_demote_self(client):
    set_test_user_role(client, "admin")

    response = client.get("/api/v1/auth/me")
    assert response.status_code == 200
    admin_id = response.json()["id"]

    response = client.patch(
        f"/api/v1/admin/users/{admin_id}/role",
        json={"role": "user"},
    )

    assert response.status_code == 400


def test_admin_cannot_change_missing_user_role(client):
    set_test_user_role(client, "admin")

    response = client.patch(
        "/api/v1/admin/users/999999/role",
        json={"role": "moderator"},
    )

    assert response.status_code == 404


def test_admin_role_update_rejects_invalid_role(client):
    set_test_user_role(client, "admin")

    response = client.patch(
        "/api/v1/admin/users/1/role",
        json={"role": "superadmin"},
    )

    assert response.status_code == 422


def test_regular_user_cannot_change_roles(client, second_user_headers):
    response = client.get(
        "/api/v1/admin/users",
        headers=second_user_headers,
        params={"q": "testuser"},
    )
    assert response.status_code == 403

    response = client.patch(
        "/api/v1/admin/users/1/role",
        headers=second_user_headers,
        json={"role": "admin"},
    )

    assert response.status_code == 403


def test_admin_user_list_pagination(client, second_user_headers):
    set_test_user_role(client, "admin")

    response = client.get(
        "/api/v1/admin/users",
        params={"limit": 1, "offset": 0},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) <= 1
    assert data["limit"] == 1
    assert data["offset"] == 0
    assert data["total"] >= 2
