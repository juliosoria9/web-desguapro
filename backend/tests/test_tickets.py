"""
Tests para el sistema de tickets de soporte
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestTicketModel:
    """Tests para el modelo Ticket"""

    @pytest.mark.unit
    def test_ticket_model_exists(self):
        from app.models.busqueda import Ticket
        assert Ticket.__tablename__ == "tickets"

    @pytest.mark.unit
    def test_ticket_fields(self):
        from app.models.busqueda import Ticket
        fields = ["id", "usuario_id", "entorno_trabajo_id", "tipo", "asunto",
                  "descripcion", "estado", "prioridad", "fecha_creacion"]
        for f in fields:
            assert hasattr(Ticket, f), f"Campo faltante: {f}"

    @pytest.mark.integration
    def test_ticket_creation(self, db_session, usuario_normal, entorno_trabajo):
        from app.models.busqueda import Ticket
        ticket = Ticket(
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=entorno_trabajo.id,
            tipo="sugerencia",
            asunto="Test ticket",
            descripcion="Descripción del ticket",
            estado="abierto",
            prioridad="baja",
        )
        db_session.add(ticket)
        db_session.commit()
        assert ticket.id is not None
        assert ticket.fecha_creacion is not None


class TestTicketMensajeModel:
    """Tests para el modelo TicketMensaje"""

    @pytest.mark.integration
    def test_mensaje_creation(self, db_session, ticket_ejemplo, usuario_normal):
        from app.models.busqueda import TicketMensaje
        msg = TicketMensaje(
            ticket_id=ticket_ejemplo.id,
            usuario_id=usuario_normal.id,
            mensaje="Mensaje de prueba",
            es_soporte=False,
        )
        db_session.add(msg)
        db_session.commit()
        assert msg.id is not None

    @pytest.mark.integration
    def test_mensaje_soporte(self, db_session, ticket_ejemplo, usuario_sysowner):
        from app.models.busqueda import TicketMensaje
        msg = TicketMensaje(
            ticket_id=ticket_ejemplo.id,
            usuario_id=usuario_sysowner.id,
            mensaje="Respuesta de soporte",
            es_soporte=True,
        )
        db_session.add(msg)
        db_session.commit()
        assert msg.es_soporte is True


class TestTicketEndpoints:
    """Tests para endpoints de tickets"""

    @pytest.mark.api
    def test_crear_ticket(self, client, usuario_normal, auth_headers_user):
        response = client.post(
            "/api/v1/tickets/crear",
            headers=auth_headers_user,
            json={
                "tipo": "error",
                "asunto": "Error en la app",
                "descripcion": "La app no carga",
                "prioridad": "alta",
            },
        )
        assert response.status_code in [200, 201]
        data = response.json()
        assert data["asunto"] == "Error en la app"

    @pytest.mark.api
    def test_crear_ticket_sin_auth(self, client):
        response = client.post(
            "/api/v1/tickets/crear",
            json={"tipo": "error", "asunto": "Test", "descripcion": "Desc"},
        )
        assert response.status_code in [401, 403]

    @pytest.mark.api
    def test_listar_mis_tickets(self, client, auth_headers_user, usuario_normal):
        # Crear ticket primero
        client.post(
            "/api/v1/tickets/crear",
            headers=auth_headers_user,
            json={"tipo": "error", "asunto": "Mi ticket", "descripcion": "Desc", "prioridad": "normal"},
        )
        response = client.get("/api/v1/tickets/mis-tickets", headers=auth_headers_user)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    @pytest.mark.api
    def test_enviar_mensaje(self, client, auth_headers_user, usuario_normal):
        # Crear ticket
        r = client.post(
            "/api/v1/tickets/crear",
            headers=auth_headers_user,
            json={"tipo": "error", "asunto": "Ticket msg", "descripcion": "Desc", "prioridad": "normal"},
        )
        ticket_id = r.json()["id"]

        # Enviar mensaje
        response = client.post(
            f"/api/v1/tickets/{ticket_id}/mensaje",
            headers=auth_headers_user,
            json={"mensaje": "Mensaje de seguimiento"},
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_listar_todos_tickets_sysowner(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.get("/api/v1/tickets/todos", headers=auth_headers_sysowner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_listar_todos_tickets_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.get("/api/v1/tickets/todos", headers=auth_headers_user)
        assert response.status_code == 403

    @pytest.mark.api
    def test_cambiar_estado_ticket(self, client, auth_headers_sysowner, auth_headers_user, usuario_normal, usuario_sysowner):
        # User creates ticket
        r = client.post(
            "/api/v1/tickets/crear",
            headers=auth_headers_user,
            json={"tipo": "error", "asunto": "Estado test", "descripcion": "Desc", "prioridad": "normal"},
        )
        ticket_id = r.json()["id"]

        # Sysowner cambia estado
        response = client.put(
            f"/api/v1/tickets/{ticket_id}/estado",
            headers=auth_headers_sysowner,
            json={"estado": "en_proceso"},
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_obtener_ticket_detalle(self, client, auth_headers_user, usuario_normal):
        r = client.post(
            "/api/v1/tickets/crear",
            headers=auth_headers_user,
            json={"tipo": "error", "asunto": "Detalle test", "descripcion": "Desc", "prioridad": "normal"},
        )
        ticket_id = r.json()["id"]

        response = client.get(f"/api/v1/tickets/{ticket_id}", headers=auth_headers_user)
        assert response.status_code == 200
        data = response.json()
        assert data["asunto"] == "Detalle test"
        assert "mensajes" in data

    @pytest.mark.api
    def test_eliminar_ticket_propio(self, client, auth_headers_user, usuario_normal):
        r = client.post(
            "/api/v1/tickets/crear",
            headers=auth_headers_user,
            json={"tipo": "error", "asunto": "Para borrar", "descripcion": "Desc", "prioridad": "normal"},
        )
        ticket_id = r.json()["id"]

        response = client.delete(f"/api/v1/tickets/{ticket_id}", headers=auth_headers_user)
        assert response.status_code == 200

    @pytest.mark.api
    def test_estadisticas_tickets_sysowner(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.get("/api/v1/tickets/estadisticas/resumen", headers=auth_headers_sysowner)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "por_estado" in data
