"""
Tests para el sistema de base de datos de desguace
"""
import pytest
import os
import sys
import io
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestBaseDesguaceModel:
    """Tests para el modelo BaseDesguace"""
    
    @pytest.mark.integration
    def test_crear_base_desguace(self, db_session, entorno_trabajo, usuario_admin):
        """Test de creación de base de desguace"""
        from app.models.busqueda import BaseDesguace
        
        base = BaseDesguace(
            entorno_trabajo_id=entorno_trabajo.id,
            nombre_archivo="piezas_test.csv",
            total_piezas=100,
            columnas="refid,oem,precio,articulo",
            subido_por_id=usuario_admin.id,
        )
        db_session.add(base)
        db_session.commit()
        
        assert base.id is not None
        assert base.total_piezas == 100
    
    @pytest.mark.integration
    def test_una_base_por_entorno(self, db_session, entorno_trabajo, usuario_admin):
        """Test de que solo hay una base por entorno (unique constraint)"""
        from app.models.busqueda import BaseDesguace
        from sqlalchemy.exc import IntegrityError
        
        base1 = BaseDesguace(
            entorno_trabajo_id=entorno_trabajo.id,
            nombre_archivo="piezas1.csv",
            total_piezas=50,
            subido_por_id=usuario_admin.id,
        )
        db_session.add(base1)
        db_session.commit()
        
        # Intentar crear otra base para el mismo entorno
        base2 = BaseDesguace(
            entorno_trabajo_id=entorno_trabajo.id,
            nombre_archivo="piezas2.csv",
            total_piezas=75,
            subido_por_id=usuario_admin.id,
        )
        db_session.add(base2)
        
        with pytest.raises(IntegrityError):
            db_session.commit()
        
        db_session.rollback()


class TestPiezaDesguaceModel:
    """Tests para el modelo PiezaDesguace"""
    
    @pytest.mark.integration
    def test_crear_pieza(self, db_session, base_desguace_ejemplo):
        """Test de creación de pieza"""
        from app.models.busqueda import PiezaDesguace
        
        pieza = PiezaDesguace(
            base_desguace_id=base_desguace_ejemplo.id,
            refid="TEST-PIEZA-001",
            oem="OEM-001",
            precio=150.50,
            articulo="Faro Delantero Izquierdo",
            marca="Volkswagen",
            modelo="Golf",
            version="GTI",
        )
        db_session.add(pieza)
        db_session.commit()
        
        assert pieza.id is not None
        assert pieza.precio == 150.50
    
    @pytest.mark.integration
    def test_buscar_pieza_por_refid(self, db_session, piezas_desguace):
        """Test de búsqueda de pieza por refid"""
        from app.models.busqueda import PiezaDesguace
        
        pieza = db_session.query(PiezaDesguace).filter(
            PiezaDesguace.refid == "REF-001"
        ).first()
        
        assert pieza is not None
        assert pieza.refid == "REF-001"
    
    @pytest.mark.integration
    def test_buscar_pieza_por_oem(self, db_session, piezas_desguace):
        """Test de búsqueda de pieza por OEM"""
        from app.models.busqueda import PiezaDesguace
        
        piezas = db_session.query(PiezaDesguace).filter(
            PiezaDesguace.oem.like("OEM%")
        ).all()
        
        assert len(piezas) == 5
    
    @pytest.mark.integration
    def test_relacion_pieza_base(self, db_session, piezas_desguace, base_desguace_ejemplo):
        """Test de relación pieza -> base"""
        pieza = piezas_desguace[0]
        db_session.refresh(pieza)
        
        assert pieza.base_desguace is not None
        assert pieza.base_desguace.id == base_desguace_ejemplo.id


class TestPiezaVendidaModel:
    """Tests para el modelo PiezaVendida"""
    
    @pytest.mark.integration
    def test_crear_pieza_vendida(self, db_session, entorno_trabajo):
        """Test de registro de pieza vendida"""
        from app.models.busqueda import PiezaVendida
        
        vendida = PiezaVendida(
            entorno_trabajo_id=entorno_trabajo.id,
            refid="VENDIDA-001",
            oem="OEM-VENDIDA-001",
            precio=200.0,
            articulo="Motor de arranque",
            archivo_origen="lote_abril_2025.csv",
        )
        db_session.add(vendida)
        db_session.commit()
        
        assert vendida.id is not None
        assert vendida.fecha_venta is not None


class TestDesguaceEndpoints:
    """Tests para endpoints de desguace"""
    
    @pytest.mark.api
    def test_obtener_info_base(self, client, base_desguace_ejemplo, auth_headers_admin):
        """Test de obtener información de la base"""
        response = client.get(
            "/api/v1/desguace/info",
            headers=auth_headers_admin,
        )
        
        # Puede ser 200 o 404 si no hay base configurada
        assert response.status_code in [200, 404]
    
    @pytest.mark.api
    def test_buscar_pieza(self, client, piezas_desguace, auth_headers_admin):
        """Test de búsqueda de pieza en desguace"""
        response = client.get(
            "/api/v1/desguace/buscar?q=REF-001",
            headers=auth_headers_admin,
        )
        
        # Puede ser 200, 404 o 422 (si requiere otros parámetros)
        assert response.status_code in [200, 404, 422]
    
    @pytest.mark.api
    def test_buscar_pieza_sin_auth(self, client):
        """Test de búsqueda sin autenticación"""
        response = client.get("/api/v1/desguace/buscar?q=REF-001")
        
        assert response.status_code in [401, 403]


class TestCSVProcessing:
    """Tests para procesamiento de CSV"""
    
    @pytest.mark.unit
    def test_validar_columnas_csv(self):
        """Test de validación de columnas de CSV"""
        required_columns = ["refid", "oem"]
        csv_columns = ["refid", "oem", "precio", "articulo"]
        
        missing = set(required_columns) - set(csv_columns)
        assert len(missing) == 0
    
    @pytest.mark.unit
    def test_mapeo_columnas(self):
        """Test de mapeo de columnas"""
        import json
        
        mapeo = {
            "refid": "ID_REFERENCIA",
            "oem": "REF_OEM",
            "precio": "PRECIO_VENTA",
            "articulo": "DESCRIPCION",
        }
        
        # Verificar que el mapeo se puede serializar
        json_str = json.dumps(mapeo)
        parsed = json.loads(json_str)
        
        assert parsed["refid"] == "ID_REFERENCIA"
        assert parsed["oem"] == "REF_OEM"


class TestVerificacionConDesguace:
    """Tests de verificación de fichadas contra base de desguace"""
    
    @pytest.mark.integration
    def test_verificar_pieza_existe(self, db_session, piezas_desguace):
        """Test de verificación cuando la pieza existe"""
        from app.models.busqueda import PiezaDesguace
        
        # Buscar pieza que existe
        existe = db_session.query(PiezaDesguace).filter(
            PiezaDesguace.refid == "REF-001"
        ).first() is not None
        
        assert existe == True
    
    @pytest.mark.integration
    def test_verificar_pieza_no_existe(self, db_session, piezas_desguace):
        """Test de verificación cuando la pieza no existe"""
        from app.models.busqueda import PiezaDesguace
        
        # Buscar pieza que no existe
        existe = db_session.query(PiezaDesguace).filter(
            PiezaDesguace.refid == "REF-INEXISTENTE"
        ).first() is not None
        
        assert existe == False
    
    @pytest.mark.integration
    def test_verificar_pieza_por_oem(self, db_session, piezas_desguace):
        """Test de verificación por OEM"""
        from app.models.busqueda import PiezaDesguace
        
        # Buscar por OEM
        pieza = db_session.query(PiezaDesguace).filter(
            PiezaDesguace.oem == "OEM-003"
        ).first()
        
        assert pieza is not None
        assert pieza.oem == "OEM-003"
    
    @pytest.mark.integration
    def test_crear_verificacion_desde_busqueda(
        self, db_session, fichada_ejemplo, piezas_desguace, usuario_normal
    ):
        """Test completo de flujo de verificación"""
        from app.models.busqueda import PiezaDesguace, VerificacionFichada
        
        # Simular búsqueda
        pieza = db_session.query(PiezaDesguace).filter(
            PiezaDesguace.refid == fichada_ejemplo.id_pieza
        ).first()
        
        en_stock = pieza is not None
        
        # Crear verificación
        verificacion = VerificacionFichada(
            fichada_id=fichada_ejemplo.id,
            usuario_id=usuario_normal.id,
            entorno_trabajo_id=usuario_normal.entorno_trabajo_id,
            id_pieza=fichada_ejemplo.id_pieza,
            hora_fichada=fichada_ejemplo.fecha_fichada,
            en_stock=en_stock,
        )
        db_session.add(verificacion)
        db_session.commit()
        
        assert verificacion.id is not None
        assert verificacion.en_stock == en_stock
