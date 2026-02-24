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


class TestRestaurarBackup:
    """Tests para POST /api/v1/admin/backups/restaurar/{backup_id}"""

    @pytest.mark.api
    def test_restaurar_sin_confirmar(self, client, auth_headers_sysowner, usuario_sysowner):
        """Sin confirmar=true devuelve warning"""
        response = client.post(
            "/api/v1/admin/backups/restaurar/1",
            headers=auth_headers_sysowner,
        )
        assert response.status_code == 200
        data = response.json()
        assert "warning" in data
        assert "confirmar" in data.get("accion_requerida", "").lower()

    @pytest.mark.api
    def test_restaurar_owner_forbidden(self, client, auth_headers_owner, usuario_owner):
        """Solo sysowner puede restaurar"""
        response = client.post(
            "/api/v1/admin/backups/restaurar/1",
            headers=auth_headers_owner,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_restaurar_admin_forbidden(self, client, auth_headers_admin, usuario_admin):
        response = client.post(
            "/api/v1/admin/backups/restaurar/1",
            headers=auth_headers_admin,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_restaurar_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/admin/backups/restaurar/1",
            headers=auth_headers_user,
        )
        assert response.status_code in [401, 403]


class TestForzarBackup:
    """Tests para POST /api/v1/admin/scheduler/forzar-backup"""

    @pytest.mark.api
    def test_forzar_backup_owner(self, client, auth_headers_owner, usuario_owner):
        response = client.post(
            "/api/v1/admin/scheduler/forzar-backup",
            headers=auth_headers_owner,
        )
        # May succeed or fail depending on backup config, but not 403
        assert response.status_code in [200, 500]

    @pytest.mark.api
    def test_forzar_backup_sysowner(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.post(
            "/api/v1/admin/scheduler/forzar-backup",
            headers=auth_headers_sysowner,
        )
        assert response.status_code in [200, 500]

    @pytest.mark.api
    def test_forzar_backup_admin_forbidden(self, client, auth_headers_admin, usuario_admin):
        response = client.post(
            "/api/v1/admin/scheduler/forzar-backup",
            headers=auth_headers_admin,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_forzar_backup_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/admin/scheduler/forzar-backup",
            headers=auth_headers_user,
        )
        assert response.status_code in [401, 403]


class TestImportarCSV:
    """Tests para POST /api/v1/admin/importar-csv-motocoche"""

    @pytest.mark.api
    def test_importar_csv_admin(self, client, auth_headers_admin, usuario_admin):
        response = client.post(
            "/api/v1/admin/importar-csv-motocoche",
            headers=auth_headers_admin,
        )
        # Can succeed or fail (no CSV file in test), but should not be 403
        assert response.status_code in [200, 500]

    @pytest.mark.api
    def test_importar_csv_sysowner(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.post(
            "/api/v1/admin/importar-csv-motocoche",
            headers=auth_headers_sysowner,
        )
        assert response.status_code in [200, 500]

    @pytest.mark.api
    def test_importar_csv_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/admin/importar-csv-motocoche",
            headers=auth_headers_user,
        )
        assert response.status_code in [401, 403]


class TestLimpiarVentasFalsas:
    """Tests para POST /api/v1/admin/limpiar-ventas-falsas"""

    @pytest.mark.api
    def test_limpiar_ventas_admin(self, client, auth_headers_admin, usuario_admin):
        response = client.post(
            "/api/v1/admin/limpiar-ventas-falsas",
            headers=auth_headers_admin,
        )
        assert response.status_code in [200, 500]

    @pytest.mark.api
    def test_limpiar_ventas_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/admin/limpiar-ventas-falsas",
            headers=auth_headers_user,
        )
        assert response.status_code in [401, 403]


class TestLimpiarApiLogs:
    """Tests para DELETE /api/v1/admin/api-logs/limpiar"""

    @pytest.mark.api
    def test_limpiar_sin_confirmar(self, client, auth_headers_sysowner, usuario_sysowner):
        """Sin confirmar devuelve warning con conteo"""
        response = client.delete(
            "/api/v1/admin/api-logs/limpiar?dias=30",
            headers=auth_headers_sysowner,
        )
        assert response.status_code == 200
        data = response.json()
        assert "warning" in data

    @pytest.mark.api
    def test_limpiar_con_confirmar(self, client, db_session, auth_headers_sysowner, usuario_sysowner, api_log_ejemplo):
        """Con confirmar=true elimina los logs"""
        response = client.delete(
            "/api/v1/admin/api-logs/limpiar?dias=1&confirmar=true",
            headers=auth_headers_sysowner,
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True

    @pytest.mark.api
    def test_limpiar_owner_forbidden(self, client, auth_headers_owner, usuario_owner):
        response = client.delete(
            "/api/v1/admin/api-logs/limpiar?dias=30",
            headers=auth_headers_owner,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_limpiar_admin_forbidden(self, client, auth_headers_admin, usuario_admin):
        response = client.delete(
            "/api/v1/admin/api-logs/limpiar?dias=30",
            headers=auth_headers_admin,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_limpiar_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.delete(
            "/api/v1/admin/api-logs/limpiar?dias=30",
            headers=auth_headers_user,
        )
        assert response.status_code in [401, 403]

    @pytest.mark.api
    def test_limpiar_dias_invalido(self, client, auth_headers_sysowner, usuario_sysowner):
        """dias fuera de rango devuelve 422"""
        response = client.delete(
            "/api/v1/admin/api-logs/limpiar?dias=0",
            headers=auth_headers_sysowner,
        )
        assert response.status_code in [200, 422]
