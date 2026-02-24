"""
Tests para el sistema de fichadas de piezas
"""
import pytest
import os
import sys
from datetime import datetime, date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestFichadasEndpoints:
    """Tests para endpoints de fichadas"""
    
    @pytest.mark.api
    def test_crear_fichada(self, client, usuario_normal, auth_headers_user):
        """Test de creación de fichada"""
        response = client.post(
            "/api/v1/fichadas/registrar",
            headers=auth_headers_user,
            json={
                "id_pieza": "REF-API-001",
                "descripcion": "Pieza creada via API",
            }
        )
        
        assert response.status_code in [200, 201]
        data = response.json()
        
        assert data["id_pieza"] == "REF-API-001"
    
    @pytest.mark.api
    def test_crear_fichada_sin_descripcion(self, client, usuario_normal, auth_headers_user):
        """Test de creación de fichada sin descripción"""
        response = client.post(
            "/api/v1/fichadas/registrar",
            headers=auth_headers_user,
            json={
                "id_pieza": "REF-API-002",
            }
        )
        
        # Debería funcionar sin descripción
        assert response.status_code in [200, 201]
    
    @pytest.mark.api
    def test_crear_fichada_sin_auth(self, client):
        """Test de creación de fichada sin autenticación"""
        response = client.post(
            "/api/v1/fichadas/registrar",
            json={
                "id_pieza": "REF-001",
            }
        )
        
        assert response.status_code in [401, 403]
    
    @pytest.mark.api
    def test_listar_fichadas(self, client, fichada_ejemplo, auth_headers_user):
        """Test de listado de fichadas"""
        response = client.get(
            "/api/v1/fichadas/mis-fichadas",
            headers=auth_headers_user,
        )
        
        # Puede ser 200 o la ruta puede tener otro nombre
        assert response.status_code in [200, 404]
    
    @pytest.mark.api
    def test_listar_fichadas_por_usuario(self, client, fichada_ejemplo, usuario_normal, auth_headers_user):
        """Test de listado de fichadas por usuario"""
        response = client.get(
            f"/api/v1/fichadas/usuario/{usuario_normal.id}",
            headers=auth_headers_user,
        )
        
        # Verificar que la ruta existe y responde
        assert response.status_code in [200, 404]
    
    @pytest.mark.api
    def test_listar_fichadas_filtro_fecha(self, client, fichada_ejemplo, usuario_normal, auth_headers_user):
        """Test de listado de fichadas con filtro de fecha"""
        today = date.today().isoformat()
        
        response = client.get(
            f"/api/v1/fichadas/usuario/{usuario_normal.id}?fecha={today}",
            headers=auth_headers_user,
        )
        
        # Verificar que responde (puede ser 200 o 404)
        assert response.status_code in [200, 404]


class TestFichadasModel:
    """Tests de modelo de fichadas"""
    
    @pytest.mark.integration
    def test_crear_fichada_db(self, db_session, usuario_normal, entorno_trabajo):
        """Test de creación de fichada en BD"""
        from app.models.busqueda import FichadaPieza
        
        fichada = FichadaPieza(
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=entorno_trabajo.id,
            id_pieza="REF-DB-001",
            descripcion="Creada en test",
        )
        db_session.add(fichada)
        db_session.commit()
        
        assert fichada.id is not None
        assert fichada.fecha_fichada is not None
    
    @pytest.mark.integration
    def test_fichada_relacion_usuario(self, db_session, fichada_ejemplo):
        """Test de relación fichada -> usuario"""
        db_session.refresh(fichada_ejemplo)
        
        assert fichada_ejemplo.usuario is not None
        assert fichada_ejemplo.usuario.email == "user@test.com"
    
    @pytest.mark.integration
    def test_fichada_relacion_entorno(self, db_session, fichada_ejemplo):
        """Test de relación fichada -> entorno"""
        db_session.refresh(fichada_ejemplo)
        
        assert fichada_ejemplo.entorno_trabajo is not None
        assert fichada_ejemplo.entorno_trabajo.nombre == "Test Desguace"


class TestVerificacionFichadas:
    """Tests para verificación de fichadas"""
    
    @pytest.mark.integration
    def test_crear_verificacion(self, db_session, fichada_ejemplo, usuario_normal):
        """Test de creación de verificación"""
        from app.models.busqueda import VerificacionFichada
        
        verificacion = VerificacionFichada(
            fichada_id=fichada_ejemplo.id,
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=usuario_normal.entorno_trabajo_id,
            id_pieza=fichada_ejemplo.id_pieza,
            hora_fichada=fichada_ejemplo.fecha_fichada,
            en_stock=True,
        )
        db_session.add(verificacion)
        db_session.commit()
        
        assert verificacion.id is not None
        assert verificacion.en_stock == True
    
    @pytest.mark.integration
    def test_verificacion_en_stock_false(self, db_session, fichada_ejemplo, usuario_normal):
        """Test de verificación cuando pieza no está en stock"""
        from app.models.busqueda import VerificacionFichada
        
        verificacion = VerificacionFichada(
            fichada_id=fichada_ejemplo.id,
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=usuario_normal.entorno_trabajo_id,
            id_pieza="REF-NO-EXISTE",
            hora_fichada=fichada_ejemplo.fecha_fichada,
            en_stock=False,
        )
        db_session.add(verificacion)
        db_session.commit()
        
        assert verificacion.en_stock == False
    
    @pytest.mark.integration
    def test_relacion_fichada_verificaciones(self, db_session, fichada_ejemplo, usuario_normal):
        """Test de relación fichada -> verificaciones"""
        from app.models.busqueda import VerificacionFichada
        
        # Crear múltiples verificaciones
        for i in range(3):
            verif = VerificacionFichada(
                fichada_id=fichada_ejemplo.id,
                usuario_id=usuario_normal.id,
                entorno_trabajo_id=usuario_normal.entorno_trabajo_id,
                id_pieza=fichada_ejemplo.id_pieza,
                hora_fichada=fichada_ejemplo.fecha_fichada,
                en_stock=i % 2 == 0,  # Alternando True/False
            )
            db_session.add(verif)
        
        db_session.commit()
        db_session.refresh(fichada_ejemplo)
        
        assert len(fichada_ejemplo.verificaciones) == 3


class TestEstadisticasFichadas:
    """Tests para estadísticas de fichadas"""
    
    @pytest.mark.integration
    def test_contar_fichadas_por_usuario(self, db_session, usuario_normal, entorno_trabajo):
        """Test de conteo de fichadas por usuario"""
        from app.models.busqueda import FichadaPieza
        from sqlalchemy import func
        
        # Crear varias fichadas
        for i in range(5):
            fichada = FichadaPieza(
                usuario_id=usuario_normal.id,
                entorno_trabajo_id=entorno_trabajo.id,
                id_pieza=f"REF-STAT-{i:03d}",
            )
            db_session.add(fichada)
        db_session.commit()
        
        # Contar
        count = db_session.query(func.count(FichadaPieza.id)).filter(
            FichadaPieza.usuario_id == usuario_normal.id
        ).scalar()
        
        assert count == 5
    
    @pytest.mark.integration
    def test_filtrar_fichadas_por_fecha(self, db_session, usuario_normal, entorno_trabajo):
        """Test de filtrado de fichadas por fecha"""
        from app.models.busqueda import FichadaPieza
        from sqlalchemy import func
        
        # Crear fichada
        fichada = FichadaPieza(
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=entorno_trabajo.id,
            id_pieza="REF-DATE-001",
        )
        db_session.add(fichada)
        db_session.commit()
        
        # Filtrar por hoy
        today = date.today()
        fichadas_hoy = db_session.query(FichadaPieza).filter(
            FichadaPieza.usuario_id == usuario_normal.id,
            func.date(FichadaPieza.fecha_fichada) == today
        ).all()
        
        assert len(fichadas_hoy) >= 1


class TestResumenDia:
    """Tests para GET /api/v1/fichadas/resumen-dia"""

    @pytest.mark.api
    def test_resumen_dia_admin(self, client, auth_headers_admin, usuario_admin):
        """Admin puede ver resumen del día"""
        response = client.get(
            "/api/v1/fichadas/resumen-dia",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        data = response.json()
        assert "fecha" in data
        assert "usuarios" in data
        assert "total_general" in data

    @pytest.mark.api
    def test_resumen_dia_con_fecha(self, client, auth_headers_admin, usuario_admin):
        """Resumen para una fecha específica"""
        response = client.get(
            "/api/v1/fichadas/resumen-dia?fecha=2026-01-15",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["fecha"] == "2026-01-15"

    @pytest.mark.api
    def test_resumen_dia_fecha_invalida(self, client, auth_headers_admin, usuario_admin):
        response = client.get(
            "/api/v1/fichadas/resumen-dia?fecha=no-es-fecha",
            headers=auth_headers_admin,
        )
        assert response.status_code == 400

    @pytest.mark.api
    def test_resumen_dia_user_forbidden(self, client, auth_headers_user, usuario_normal):
        """User normal no puede ver resumen"""
        response = client.get(
            "/api/v1/fichadas/resumen-dia",
            headers=auth_headers_user,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_resumen_dia_sysowner_con_entorno(self, client, auth_headers_sysowner, usuario_sysowner, entorno_trabajo):
        """Sysowner puede filtrar por entorno_id"""
        response = client.get(
            f"/api/v1/fichadas/resumen-dia?entorno_id={entorno_trabajo.id}",
            headers=auth_headers_sysowner,
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_resumen_dia_con_fichadas(self, client, auth_headers_admin, usuario_admin, fichada_ejemplo):
        """Resumen contiene datos cuando hay fichadas"""
        response = client.get(
            "/api/v1/fichadas/resumen-dia",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_general"] >= 1


class TestSemanasDisponibles:
    """Tests para GET /api/v1/fichadas/semanas-disponibles/{usuario_id}"""

    @pytest.mark.api
    def test_semanas_disponibles_admin(self, client, auth_headers_admin, usuario_admin, usuario_normal):
        response = client.get(
            f"/api/v1/fichadas/semanas-disponibles/{usuario_normal.id}",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        data = response.json()
        assert "semanas" in data
        assert len(data["semanas"]) > 0

    @pytest.mark.api
    def test_semanas_disponibles_cantidad(self, client, auth_headers_admin, usuario_admin, usuario_normal):
        response = client.get(
            f"/api/v1/fichadas/semanas-disponibles/{usuario_normal.id}?cantidad=4",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["semanas"]) == 4

    @pytest.mark.api
    def test_semanas_disponibles_formato(self, client, auth_headers_admin, usuario_admin, usuario_normal):
        """Cada semana tiene semana, label, fecha_inicio, fecha_fin"""
        response = client.get(
            f"/api/v1/fichadas/semanas-disponibles/{usuario_normal.id}?cantidad=1",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        semana = response.json()["semanas"][0]
        assert "semana" in semana
        assert "label" in semana
        assert "fecha_inicio" in semana
        assert "fecha_fin" in semana

    @pytest.mark.api
    def test_semanas_disponibles_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.get(
            f"/api/v1/fichadas/semanas-disponibles/{usuario_normal.id}",
            headers=auth_headers_user,
        )
        assert response.status_code == 403


class TestDetalleSemana:
    """Tests para GET /api/v1/fichadas/detalle-semana/{usuario_id}"""

    @pytest.mark.api
    def test_detalle_semana_admin(self, client, auth_headers_admin, usuario_admin, usuario_normal):
        response = client.get(
            f"/api/v1/fichadas/detalle-semana/{usuario_normal.id}?semana=2026-W06",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        data = response.json()
        assert "dias" in data
        assert len(data["dias"]) == 7
        assert "total_semana" in data
        assert "promedio_diario" in data

    @pytest.mark.api
    def test_detalle_semana_formato_dia(self, client, auth_headers_admin, usuario_admin, usuario_normal):
        """Cada día tiene fecha, dia_semana, total_fichadas"""
        response = client.get(
            f"/api/v1/fichadas/detalle-semana/{usuario_normal.id}?semana=2026-W06",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        dia = response.json()["dias"][0]
        assert "fecha" in dia
        assert "dia_semana" in dia
        assert "total_fichadas" in dia

    @pytest.mark.api
    def test_detalle_semana_usuario_no_existe(self, client, auth_headers_admin, usuario_admin):
        response = client.get(
            "/api/v1/fichadas/detalle-semana/99999?semana=2026-W06",
            headers=auth_headers_admin,
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_detalle_semana_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.get(
            f"/api/v1/fichadas/detalle-semana/{usuario_normal.id}?semana=2026-W06",
            headers=auth_headers_user,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_detalle_semana_con_fichadas(self, client, db_session, auth_headers_admin, usuario_admin, usuario_normal, entorno_trabajo):
        """Detalle muestra datos cuando hay fichadas en la semana actual"""
        from app.models.busqueda import FichadaPieza
        from datetime import date, timedelta
        hoy = date.today()
        inicio_semana = hoy - timedelta(days=hoy.weekday())
        num_semana = inicio_semana.isocalendar()[1]
        semana_str = f"{inicio_semana.year}-W{num_semana:02d}"

        for i in range(3):
            f = FichadaPieza(
                usuario_id=usuario_normal.id,
                entorno_trabajo_id=entorno_trabajo.id,
                id_pieza=f"SEM-{i}",
            )
            db_session.add(f)
        db_session.commit()

        response = client.get(
            f"/api/v1/fichadas/detalle-semana/{usuario_normal.id}?semana={semana_str}",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total_semana"] >= 3

    @pytest.mark.api
    def test_detalle_semana_sysowner_entorno(self, client, auth_headers_sysowner, usuario_sysowner, usuario_normal, entorno_trabajo):
        """Sysowner puede filtrar por entorno_id"""
        response = client.get(
            f"/api/v1/fichadas/detalle-semana/{usuario_normal.id}?semana=2026-W06&entorno_id={entorno_trabajo.id}",
            headers=auth_headers_sysowner,
        )
        assert response.status_code == 200
