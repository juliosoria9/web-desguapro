"""
Tests para el sistema de anuncios y changelog
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestAnuncioModel:
    """Tests para modelos de anuncios"""

    @pytest.mark.unit
    def test_anuncio_model_exists(self):
        from app.models.busqueda import Anuncio
        assert Anuncio.__tablename__ == "anuncios"

    @pytest.mark.unit
    def test_anuncio_leido_model_exists(self):
        from app.models.busqueda import AnuncioLeido
        assert AnuncioLeido.__tablename__ == "anuncios_leidos"

    @pytest.mark.integration
    def test_anuncio_creation(self, db_session, usuario_sysowner):
        from app.models.busqueda import Anuncio
        anuncio = Anuncio(
            titulo="Test",
            contenido="Contenido test",
            version="2.0.0",
            tipo="changelog",
            activo=True,
            mostrar_popup=True,
            creado_por_id=usuario_sysowner.id,
        )
        db_session.add(anuncio)
        db_session.commit()
        assert anuncio.id is not None

    @pytest.mark.integration
    def test_anuncio_leido_creation(self, db_session, anuncio_ejemplo, usuario_normal):
        from app.models.busqueda import AnuncioLeido
        leido = AnuncioLeido(
            usuario_id=usuario_normal.id,
            anuncio_id=anuncio_ejemplo.id,
        )
        db_session.add(leido)
        db_session.commit()
        assert leido.id is not None

    @pytest.mark.integration
    def test_anuncio_cascade_delete(self, db_session, anuncio_ejemplo, usuario_normal):
        from app.models.busqueda import Anuncio, AnuncioLeido
        leido = AnuncioLeido(
            usuario_id=usuario_normal.id,
            anuncio_id=anuncio_ejemplo.id,
        )
        db_session.add(leido)
        db_session.commit()
        leido_id = leido.id

        db_session.delete(anuncio_ejemplo)
        db_session.commit()

        result = db_session.query(AnuncioLeido).filter(AnuncioLeido.id == leido_id).first()
        assert result is None


class TestAnuncioEndpoints:
    """Tests para endpoints de anuncios"""

    @pytest.mark.api
    def test_crear_anuncio_sysowner(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.post(
            "/api/v1/anuncios/crear",
            headers=auth_headers_sysowner,
            json={
                "titulo": "Nueva versión",
                "contenido": "## Cambios\n- Mejora 1\n- Mejora 2",
                "version": "1.5.0",
                "tipo": "changelog",
                "mostrar_popup": True,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["titulo"] == "Nueva versión"

    @pytest.mark.api
    def test_crear_anuncio_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.post(
            "/api/v1/anuncios/crear",
            headers=auth_headers_user,
            json={"titulo": "Test", "contenido": "No autorizado", "tipo": "changelog"},
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_obtener_no_leidos(self, client, auth_headers_user, auth_headers_sysowner, usuario_normal, usuario_sysowner):
        # Crear anuncio
        client.post(
            "/api/v1/anuncios/crear",
            headers=auth_headers_sysowner,
            json={"titulo": "Pop test", "contenido": "Pop content", "tipo": "changelog", "mostrar_popup": True},
        )

        # Usuario normal lo ve como no leído
        response = client.get("/api/v1/anuncios/no-leidos", headers=auth_headers_user)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    @pytest.mark.api
    def test_marcar_como_leido(self, client, auth_headers_user, auth_headers_sysowner, usuario_normal, usuario_sysowner):
        # Crear anuncio
        r = client.post(
            "/api/v1/anuncios/crear",
            headers=auth_headers_sysowner,
            json={"titulo": "Marcar test", "contenido": "Content", "tipo": "changelog"},
        )
        anuncio_id = r.json()["id"]

        # Marcar como leído
        response = client.post(f"/api/v1/anuncios/{anuncio_id}/marcar-leido", headers=auth_headers_user)
        assert response.status_code == 200

        # Verificar que ya no aparece como no leído
        r2 = client.get("/api/v1/anuncios/no-leidos", headers=auth_headers_user)
        ids_no_leidos = [a["id"] for a in r2.json()]
        assert anuncio_id not in ids_no_leidos

    @pytest.mark.api
    def test_marcar_todos_leidos(self, client, auth_headers_user, auth_headers_sysowner, usuario_normal, usuario_sysowner):
        # Crear 2 anuncios
        for i in range(2):
            client.post(
                "/api/v1/anuncios/crear",
                headers=auth_headers_sysowner,
                json={"titulo": f"Batch {i}", "contenido": "Content", "tipo": "changelog"},
            )

        response = client.post("/api/v1/anuncios/marcar-todos-leidos", headers=auth_headers_user)
        assert response.status_code == 200

        r = client.get("/api/v1/anuncios/no-leidos", headers=auth_headers_user)
        assert len(r.json()) == 0

    @pytest.mark.api
    def test_changelog(self, client, auth_headers_user, auth_headers_sysowner, usuario_normal, usuario_sysowner):
        client.post(
            "/api/v1/anuncios/crear",
            headers=auth_headers_sysowner,
            json={"titulo": "Changelog test", "contenido": "Content", "tipo": "changelog"},
        )

        response = client.get("/api/v1/anuncios/changelog", headers=auth_headers_user)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.api
    def test_actualizar_anuncio(self, client, auth_headers_sysowner, usuario_sysowner):
        r = client.post(
            "/api/v1/anuncios/crear",
            headers=auth_headers_sysowner,
            json={"titulo": "Original", "contenido": "Content", "tipo": "changelog"},
        )
        anuncio_id = r.json()["id"]

        response = client.put(
            f"/api/v1/anuncios/{anuncio_id}",
            headers=auth_headers_sysowner,
            json={"titulo": "Modificado"},
        )
        assert response.status_code == 200
        assert response.json()["titulo"] == "Modificado"

    @pytest.mark.api
    def test_eliminar_anuncio(self, client, auth_headers_sysowner, usuario_sysowner):
        r = client.post(
            "/api/v1/anuncios/crear",
            headers=auth_headers_sysowner,
            json={"titulo": "Para borrar", "contenido": "Content", "tipo": "changelog"},
        )
        anuncio_id = r.json()["id"]

        response = client.delete(f"/api/v1/anuncios/{anuncio_id}", headers=auth_headers_sysowner)
        assert response.status_code == 200

    @pytest.mark.api
    def test_admin_todos(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.get("/api/v1/anuncios/admin/todos", headers=auth_headers_sysowner)
        assert response.status_code == 200
        assert isinstance(response.json(), list)
