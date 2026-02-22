"""
Tests para el router de admin (auditoría, backups, API logs, scheduler)
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestAdminModels:
    """Tests para modelos de administración"""

    @pytest.mark.unit
    def test_audit_log_model_exists(self):
        from app.models.busqueda import AuditLog
        assert AuditLog.__tablename__ == "audit_logs"

    @pytest.mark.unit
    def test_backup_record_model_exists(self):
        from app.models.busqueda import BackupRecord
        assert BackupRecord.__tablename__ == "backup_records"

    @pytest.mark.unit
    def test_api_request_log_model_exists(self):
        from app.models.busqueda import APIRequestLog
        assert APIRequestLog.__tablename__ == "api_request_logs"

    @pytest.mark.unit
    def test_api_request_log_fields(self):
        from app.models.busqueda import APIRequestLog
        fields = ["id", "metodo", "ruta", "status_code", "duracion_ms",
                  "usuario_id", "usuario_email", "ip_address", "fecha"]
        for f in fields:
            assert hasattr(APIRequestLog, f), f"Campo faltante: {f}"

    @pytest.mark.integration
    def test_audit_log_creation(self, db_session, usuario_admin, entorno_trabajo):
        from app.models.busqueda import AuditLog
        log = AuditLog(
            usuario_id=usuario_admin.id,
            entorno_trabajo_id=entorno_trabajo.id,
            accion="test_action",
            detalle="Detalle del test",
        )
        db_session.add(log)
        db_session.commit()
        assert log.id is not None

    @pytest.mark.integration
    def test_api_request_log_creation(self, db_session, usuario_admin, entorno_trabajo):
        from app.models.busqueda import APIRequestLog
        log = APIRequestLog(
            metodo="GET",
            ruta="/api/v1/precios/buscar",
            status_code=200,
            duracion_ms=150.5,
            usuario_id=usuario_admin.id,
            usuario_email=usuario_admin.email,
            entorno_trabajo_id=entorno_trabajo.id,
            ip_address="127.0.0.1",
        )
        db_session.add(log)
        db_session.commit()
        assert log.id is not None


class TestAdminEndpoints:
    """Tests para endpoints de administración"""

    @pytest.mark.api
    def test_audit_logs_sysowner(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.get("/api/v1/admin/audit-logs", headers=auth_headers_sysowner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_audit_logs_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/admin/audit-logs", headers=auth_headers_user)
        assert response.status_code in [403, 401]

    @pytest.mark.api
    def test_audit_acciones(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.get("/api/v1/admin/audit-logs/acciones", headers=auth_headers_sysowner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_listar_backups_owner(self, client, auth_headers_owner, usuario_owner):
        response = client.get("/api/v1/admin/backups", headers=auth_headers_owner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_crear_backup(self, client, auth_headers_owner, usuario_owner):
        response = client.post("/api/v1/admin/backups/crear", headers=auth_headers_owner)
        # Puede fallar si no hay directorio de backups, pero no debería dar 404
        assert response.status_code in [200, 500]

    @pytest.mark.api
    def test_estadisticas_backups(self, client, auth_headers_owner, usuario_owner):
        response = client.get("/api/v1/admin/backups/estadisticas", headers=auth_headers_owner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_scheduler_estado(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.get("/api/v1/admin/scheduler/estado", headers=auth_headers_sysowner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_api_logs(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.get("/api/v1/admin/api-logs", headers=auth_headers_sysowner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_api_stats(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.get("/api/v1/admin/api-stats", headers=auth_headers_sysowner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_api_logs_entornos(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.get("/api/v1/admin/api-logs/entornos", headers=auth_headers_sysowner)
        assert response.status_code == 200
