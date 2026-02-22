"""
Smoke Tests — Verifica que TODOS los endpoints de la API responden
sin errores 500. No valida lógica de negocio, solo que no explotan.

Organizado por router. Cada test hace una petición y comprueba
que el status_code NO sea 500/502/503.
"""
import pytest
import json
from io import BytesIO


def _ok(status_code: int) -> bool:
    """Cualquier código que no sea error de servidor es aceptable en smoke."""
    return status_code < 500


# ============================================================
# SECCIÓN 0: Endpoints sin autenticación
# ============================================================

class TestSmokePublic:
    """Endpoints que NO requieren autenticación"""

    @pytest.mark.smoke
    def test_root(self, client):
        """GET / — landing del API"""
        r = client.get("/")
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_health(self, client):
        """GET /api/v1/health — health check"""
        r = client.get("/api/v1/health")
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_desguace_campos(self, client):
        """GET /api/v1/desguace/campos — campos disponibles"""
        r = client.get("/api/v1/desguace/campos")
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_plataformas_listar(self, client):
        """GET /api/v1/plataformas/ — lista de plataformas"""
        r = client.get("/api/v1/plataformas/")
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_plataformas_detalle(self, client):
        """GET /api/v1/plataformas/ecooparts — detalle plataforma"""
        r = client.get("/api/v1/plataformas/ecooparts")
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_ebay_account_deletion_get(self, client):
        """GET /api/v1/ebay/account-deletion — eBay marketplace compliance"""
        r = client.get("/api/v1/ebay/account-deletion")
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_ebay_account_deletion_post(self, client):
        """POST /api/v1/ebay/account-deletion — eBay notification"""
        r = client.post("/api/v1/ebay/account-deletion", json={})
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 1: Auth — /api/v1/auth
# ============================================================

class TestSmokeAuth:
    """Endpoints de autenticación y gestión de usuarios"""

    @pytest.mark.smoke
    def test_login_credenciales_invalidas(self, client):
        """POST /api/v1/auth/login — login con credenciales inválidas, no debe dar 500"""
        r = client.post("/api/v1/auth/login", json={"email": "noexiste@test.com", "password": "wrong"})
        assert _ok(r.status_code)
        assert r.status_code in (401, 422, 400)

    @pytest.mark.smoke
    def test_login_credenciales_validas(self, client, usuario_admin):
        """POST /api/v1/auth/login — login con credenciales correctas"""
        r = client.post("/api/v1/auth/login", json={"email": "admin@test.com", "password": "test123"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_logout(self, client, auth_headers_admin):
        """POST /api/v1/auth/logout — cerrar sesión"""
        r = client.post("/api/v1/auth/logout", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_me(self, client, auth_headers_admin):
        """GET /api/v1/auth/me — perfil usuario actual"""
        r = client.get("/api/v1/auth/me", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_me_sin_token(self, client):
        """GET /api/v1/auth/me — sin token debe dar 401/403"""
        r = client.get("/api/v1/auth/me")
        assert _ok(r.status_code)
        assert r.status_code in (401, 403)

    @pytest.mark.smoke
    def test_listar_usuarios_owner(self, client, auth_headers_owner):
        """GET /api/v1/auth/usuarios — listar usuarios (owner)"""
        r = client.get("/api/v1/auth/usuarios", headers=auth_headers_owner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_listar_usuarios_sin_permiso(self, client, auth_headers_user):
        """GET /api/v1/auth/usuarios — sin permiso debe dar 403"""
        r = client.get("/api/v1/auth/usuarios", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_crear_usuario_owner(self, client, auth_headers_owner, entorno_trabajo):
        """POST /api/v1/auth/usuarios — crear usuario"""
        r = client.post("/api/v1/auth/usuarios", headers=auth_headers_owner, json={
            "email": "smoke-new@test.com", "nombre": "Smoke", "password": "test123",
            "rol": "user", "entorno_trabajo_id": entorno_trabajo.id,
        })
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_editar_usuario(self, client, auth_headers_admin, usuario_normal):
        """PUT /api/v1/auth/usuarios/{id} — editar usuario"""
        r = client.put(f"/api/v1/auth/usuarios/{usuario_normal.id}",
                       headers=auth_headers_admin, params={"usuario": "Editado"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_eliminar_usuario(self, client, auth_headers_admin, usuario_normal):
        """DELETE /api/v1/auth/usuarios/{id} — eliminar usuario"""
        r = client.delete(f"/api/v1/auth/usuarios/{usuario_normal.id}", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_cambiar_rol(self, client, auth_headers_owner, usuario_normal):
        """PUT /api/v1/auth/usuarios/{id}/rol — cambiar rol"""
        r = client.put(f"/api/v1/auth/usuarios/{usuario_normal.id}/rol",
                       headers=auth_headers_owner, params={"nuevo_rol": "admin"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_listar_usuarios_admin(self, client, auth_headers_admin):
        """GET /api/v1/auth/usuarios-admin — listar usuarios (admin)"""
        r = client.get("/api/v1/auth/usuarios-admin", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_crear_usuario_admin(self, client, auth_headers_admin, entorno_trabajo):
        """POST /api/v1/auth/usuarios-admin — crear usuario como admin"""
        r = client.post("/api/v1/auth/usuarios-admin", headers=auth_headers_admin, json={
            "email": "smoke-admin-new@test.com", "nombre": "Smoke Admin",
            "password": "test123", "rol": "user", "entorno_trabajo_id": entorno_trabajo.id,
        })
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_informe_usuario(self, client, auth_headers_admin, usuario_normal):
        """GET /api/v1/auth/usuarios/{id}/informe — informe de usuario"""
        r = client.get(f"/api/v1/auth/usuarios/{usuario_normal.id}/informe",
                       headers=auth_headers_admin)
        assert _ok(r.status_code)

    # --- Entornos (sysowner) ---

    @pytest.mark.smoke
    def test_listar_entornos(self, client, auth_headers_sysowner):
        """GET /api/v1/auth/entornos — listar entornos"""
        r = client.get("/api/v1/auth/entornos", headers=auth_headers_sysowner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_crear_entorno(self, client, auth_headers_sysowner):
        """POST /api/v1/auth/entornos — crear entorno"""
        r = client.post("/api/v1/auth/entornos", headers=auth_headers_sysowner, json={
            "nombre": "Smoke Entorno", "descripcion": "Test",
        })
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_actualizar_modulos_entorno(self, client, auth_headers_sysowner, entorno_trabajo):
        """PUT /api/v1/auth/entornos/{id}/modulos — actualizar módulos"""
        r = client.put(f"/api/v1/auth/entornos/{entorno_trabajo.id}/modulos",
                       headers=auth_headers_sysowner, json={"modulo_fichadas": True})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_asignar_usuario_entorno(self, client, auth_headers_sysowner, usuario_normal, entorno_trabajo):
        """POST /api/v1/auth/usuarios/{uid}/entorno/{eid} — asignar usuario a entorno"""
        r = client.post(f"/api/v1/auth/usuarios/{usuario_normal.id}/entorno/{entorno_trabajo.id}",
                        headers=auth_headers_sysowner)
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 2: Desguace — /api/v1/desguace
# ============================================================

class TestSmokeDesguace:
    """Endpoints de gestión de stock, ventas, búsquedas, estudio coches"""

    @pytest.mark.smoke
    def test_info(self, client, auth_headers_admin):
        """GET /api/v1/desguace/info — info de la base de desguace"""
        r = client.get("/api/v1/desguace/info", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_buscar(self, client, auth_headers_admin):
        """GET /api/v1/desguace/buscar — buscar piezas por referencia"""
        r = client.get("/api/v1/desguace/buscar", headers=auth_headers_admin,
                       params={"referencia": "TEST"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_stock(self, client, auth_headers_admin):
        """GET /api/v1/desguace/stock — listado de stock"""
        r = client.get("/api/v1/desguace/stock", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_stock_buscar_pieza(self, client, auth_headers_admin):
        """GET /api/v1/desguace/stock/buscar-pieza/REF-001 — buscar pieza por refid"""
        r = client.get("/api/v1/desguace/stock/buscar-pieza/REF-001", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_stock_resumen(self, client, auth_headers_admin):
        """GET /api/v1/desguace/stock/resumen — resumen de stock"""
        r = client.get("/api/v1/desguace/stock/resumen", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_ventas(self, client, auth_headers_admin):
        """GET /api/v1/desguace/ventas — listado de ventas"""
        r = client.get("/api/v1/desguace/ventas", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_ventas_resumen(self, client, auth_headers_owner):
        """GET /api/v1/desguace/ventas/resumen — resumen de ventas"""
        r = client.get("/api/v1/desguace/ventas/resumen", headers=auth_headers_owner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_eliminar_venta_inexistente(self, client, auth_headers_admin):
        """DELETE /api/v1/desguace/ventas/99999 — eliminar venta que no existe"""
        r = client.delete("/api/v1/desguace/ventas/99999", headers=auth_headers_admin)
        assert _ok(r.status_code)
        assert r.status_code in (404, 200)

    @pytest.mark.smoke
    def test_eliminar_base(self, client, auth_headers_admin):
        """DELETE /api/v1/desguace/eliminar — eliminar base de desguace"""
        r = client.delete("/api/v1/desguace/eliminar", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_analizar_csv(self, client, auth_headers_admin):
        """POST /api/v1/desguace/analizar — analizar CSV (con archivo dummy)"""
        csv_content = b"refid;oem;precio\nREF-001;OEM-001;100"
        r = client.post("/api/v1/desguace/analizar", headers=auth_headers_admin,
                        files={"file": ("test.csv", BytesIO(csv_content), "text/csv")})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_upload_csv(self, client, auth_headers_admin):
        """POST /api/v1/desguace/upload — subir CSV con mapeo"""
        csv_content = b"refid;oem;precio;articulo\nREF-001;OEM-001;100;Motor"
        mapeo = json.dumps({"refid": "refid", "oem": "oem", "precio": "precio", "articulo": "articulo"})
        r = client.post("/api/v1/desguace/upload", headers=auth_headers_admin,
                        files={"file": ("test.csv", BytesIO(csv_content), "text/csv")},
                        data={"mapeo": mapeo})
        assert _ok(r.status_code)

    # --- Estudio de coches ---

    @pytest.mark.smoke
    def test_estudio_coches(self, client, auth_headers_admin):
        """GET /api/v1/desguace/estudio-coches — resumen estudio coches"""
        r = client.get("/api/v1/desguace/estudio-coches", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_estudio_coches_marcas(self, client, auth_headers_admin):
        """GET /api/v1/desguace/estudio-coches/marcas — marcas disponibles"""
        r = client.get("/api/v1/desguace/estudio-coches/marcas", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_estudio_coches_modelos(self, client, auth_headers_admin):
        """GET /api/v1/desguace/estudio-coches/modelos — modelos por marca"""
        r = client.get("/api/v1/desguace/estudio-coches/modelos", headers=auth_headers_admin,
                       params={"marca": "TEST"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_estudio_coches_versiones(self, client, auth_headers_admin):
        """GET /api/v1/desguace/estudio-coches/versiones — versiones por marca/modelo"""
        r = client.get("/api/v1/desguace/estudio-coches/versiones", headers=auth_headers_admin,
                       params={"marca": "TEST", "modelo": "TEST"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_estudio_coches_piezas(self, client, auth_headers_admin):
        """GET /api/v1/desguace/estudio-coches/piezas — piezas por marca/modelo"""
        r = client.get("/api/v1/desguace/estudio-coches/piezas", headers=auth_headers_admin,
                       params={"marca": "TEST", "modelo": "TEST"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_estudio_coches_buscar_precios(self, client, auth_headers_admin):
        """POST /api/v1/desguace/estudio-coches/buscar-precios — buscar precios estudio"""
        r = client.post("/api/v1/desguace/estudio-coches/buscar-precios",
                        headers=auth_headers_admin, params={"marca": "TEST", "modelo": "TEST"})
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 3: Precios — /api/v1/precios
# ============================================================

class TestSmokePrecios:
    """Endpoints de búsqueda de precios (scrapers)"""

    @pytest.mark.smoke
    def test_plataformas_disponibles(self, client, auth_headers_admin):
        """GET /api/v1/precios/plataformas-disponibles — plataformas de scraping"""
        r = client.get("/api/v1/precios/plataformas-disponibles", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_buscar_precios(self, client, auth_headers_admin):
        """POST /api/v1/precios/buscar — buscar precios (sin scraping real)"""
        r = client.post("/api/v1/precios/buscar", headers=auth_headers_admin,
                        json={"referencia": "TEST-NONEXIST-12345", "plataforma": "demo"})
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 4: Stock masivo — /api/v1/stock
# ============================================================

class TestSmokeStockMasivo:
    """Endpoints de verificación masiva de stock"""

    @pytest.mark.smoke
    def test_verificar_masivo(self, client, auth_headers_admin):
        """POST /api/v1/stock/verificar-masivo — verificación masiva"""
        r = client.post("/api/v1/stock/verificar-masivo", headers=auth_headers_admin,
                        json={"items": []})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_verificar(self, client, auth_headers_admin):
        """POST /api/v1/stock/verificar — verificación simple (legacy)"""
        r = client.post("/api/v1/stock/verificar", headers=auth_headers_admin,
                        json={"items": []})
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 5: Token TOEN — /api/v1/token
# ============================================================

class TestSmokeToken:
    """Endpoints de gestión del token TOEN"""

    @pytest.mark.smoke
    def test_obtener_token(self, client, auth_headers_admin):
        """GET /api/v1/token/obtener — obtener token TOEN configurado"""
        r = client.get("/api/v1/token/obtener", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_configurar_token(self, client, auth_headers_admin):
        """POST /api/v1/token/configurar — configurar token TOEN"""
        r = client.post("/api/v1/token/configurar", headers=auth_headers_admin,
                        params={"token": "test-token-123"})
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 6: Precios Config — /api/v1/precios-config
# ============================================================

class TestSmokePreciosConfig:
    """Endpoints de configuración de familias/precios"""

    @pytest.mark.smoke
    def test_estado(self, client, auth_headers_admin):
        """GET /api/v1/precios-config/estado — estado de configuración"""
        r = client.get("/api/v1/precios-config/estado", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_entornos(self, client, auth_headers_sysowner):
        """GET /api/v1/precios-config/entornos — entornos (sysowner)"""
        r = client.get("/api/v1/precios-config/entornos", headers=auth_headers_sysowner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_piezas_familia(self, client, auth_headers_admin):
        """GET /api/v1/precios-config/piezas-familia — listar pieza-familia"""
        r = client.get("/api/v1/precios-config/piezas-familia", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_familias_precios(self, client, auth_headers_admin):
        """GET /api/v1/precios-config/familias-precios — listar familia-precios"""
        r = client.get("/api/v1/precios-config/familias-precios", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_subir_pieza_familia_csv(self, client, auth_headers_admin):
        """POST /api/v1/precios-config/pieza-familia — subir CSV pieza-familia"""
        csv = b"pieza;familia\nMotor;Motores"
        r = client.post("/api/v1/precios-config/pieza-familia", headers=auth_headers_admin,
                        files={"file": ("pf.csv", BytesIO(csv), "text/csv")})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_subir_familia_precios_csv(self, client, auth_headers_admin):
        """POST /api/v1/precios-config/familia-precios — subir CSV familia-precios"""
        csv = b"familia;precios\nMotores;100"
        r = client.post("/api/v1/precios-config/familia-precios", headers=auth_headers_admin,
                        files={"file": ("fp.csv", BytesIO(csv), "text/csv")})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_crear_pieza_familia(self, client, auth_headers_admin):
        """POST /api/v1/precios-config/pieza-familia/nuevo — crear registro"""
        r = client.post("/api/v1/precios-config/pieza-familia/nuevo", headers=auth_headers_admin,
                        params={"pieza": "TestPieza", "familia": "TestFam"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_crear_familia_precios(self, client, auth_headers_admin):
        """POST /api/v1/precios-config/familia-precios/nuevo — crear registro"""
        r = client.post("/api/v1/precios-config/familia-precios/nuevo", headers=auth_headers_admin,
                        params={"familia": "TestFam2", "precios": "150"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_editar_pieza_familia(self, client, auth_headers_admin, db_session, config_precios_ejemplo):
        """PUT /api/v1/precios-config/pieza-familia/{id} — editar registro"""
        from app.models.busqueda import PiezaFamiliaDesguace
        pf = PiezaFamiliaDesguace(configuracion_id=config_precios_ejemplo.id, pieza="A", familia="B")
        db_session.add(pf); db_session.commit(); db_session.refresh(pf)
        r = client.put(f"/api/v1/precios-config/pieza-familia/{pf.id}", headers=auth_headers_admin,
                       params={"pieza": "Editada"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_editar_familia_precios(self, client, auth_headers_admin, db_session, config_precios_ejemplo):
        """PUT /api/v1/precios-config/familia-precios/{id} — editar registro"""
        from app.models.busqueda import FamiliaPreciosDesguace
        fp = FamiliaPreciosDesguace(configuracion_id=config_precios_ejemplo.id, familia="X", precios="200")
        db_session.add(fp); db_session.commit(); db_session.refresh(fp)
        r = client.put(f"/api/v1/precios-config/familia-precios/{fp.id}", headers=auth_headers_admin,
                       params={"familia": "Editada"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_eliminar_config(self, client, auth_headers_owner):
        """DELETE /api/v1/precios-config/eliminar — eliminar configuración"""
        r = client.delete("/api/v1/precios-config/eliminar", headers=auth_headers_owner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_exportar_pieza_familia(self, client, auth_headers_admin):
        """GET /api/v1/precios-config/exportar/pieza-familia — exportar CSV"""
        r = client.get("/api/v1/precios-config/exportar/pieza-familia", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_exportar_familia_precios(self, client, auth_headers_admin):
        """GET /api/v1/precios-config/exportar/familia-precios — exportar CSV"""
        r = client.get("/api/v1/precios-config/exportar/familia-precios", headers=auth_headers_admin)
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 7: Referencias — /api/v1/referencias
# ============================================================

class TestSmokeReferencias:
    """Endpoints de búsqueda de referencias IAM"""

    @pytest.mark.smoke
    def test_buscar(self, client, auth_headers_admin):
        """POST /api/v1/referencias/buscar — buscar referencias"""
        r = client.post("/api/v1/referencias/buscar", headers=auth_headers_admin,
                        json={"referencia": "TEST123"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_rapidas(self, client, auth_headers_admin):
        """POST /api/v1/referencias/rapidas — búsqueda rápida"""
        r = client.post("/api/v1/referencias/rapidas", headers=auth_headers_admin,
                        json={"referencia": "TEST123"})
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 8: Fichadas — /api/v1/fichadas
# ============================================================

class TestSmokeFichadas:
    """Endpoints de control de fichadas de piezas"""

    @pytest.mark.smoke
    def test_registrar(self, client, auth_headers_user):
        """POST /api/v1/fichadas/registrar — registrar fichada"""
        r = client.post("/api/v1/fichadas/registrar", headers=auth_headers_user,
                        json={"id_pieza": "SMOKE-001"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_mis_fichadas(self, client, auth_headers_user):
        """GET /api/v1/fichadas/mis-fichadas — mis fichadas del día"""
        r = client.get("/api/v1/fichadas/mis-fichadas", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_resumen_equipo(self, client, auth_headers_user):
        """GET /api/v1/fichadas/resumen-equipo — resumen del equipo"""
        r = client.get("/api/v1/fichadas/resumen-equipo", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_resumen_dia(self, client, auth_headers_admin):
        """GET /api/v1/fichadas/resumen-dia — resumen diario (admin)"""
        r = client.get("/api/v1/fichadas/resumen-dia", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_detalle_usuario(self, client, auth_headers_admin, usuario_normal):
        """GET /api/v1/fichadas/detalle-usuario/{id} — detalle fichadas de usuario"""
        r = client.get(f"/api/v1/fichadas/detalle-usuario/{usuario_normal.id}",
                       headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_borrar_fichada(self, client, auth_headers_user, fichada_ejemplo):
        """DELETE /api/v1/fichadas/borrar/{id} — borrar fichada"""
        r = client.delete(f"/api/v1/fichadas/borrar/{fichada_ejemplo.id}", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_actualizar_descripcion(self, client, auth_headers_user, fichada_ejemplo):
        """PATCH /api/v1/fichadas/descripcion/{id} — actualizar descripción"""
        r = client.patch(f"/api/v1/fichadas/descripcion/{fichada_ejemplo.id}",
                         headers=auth_headers_user, json={"descripcion": "Actualizada"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_actualizar_comentario(self, client, auth_headers_user, fichada_ejemplo):
        """PATCH /api/v1/fichadas/comentario/{id} — actualizar comentario"""
        r = client.patch(f"/api/v1/fichadas/comentario/{fichada_ejemplo.id}",
                         headers=auth_headers_user, json={"comentario": "Nota smoke"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_verificaciones(self, client, auth_headers_admin, usuario_normal):
        """GET /api/v1/fichadas/verificaciones/{id} — verificaciones de usuario"""
        r = client.get(f"/api/v1/fichadas/verificaciones/{usuario_normal.id}",
                       headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_informe_rendimiento(self, client, auth_headers_admin, usuario_normal):
        """GET /api/v1/fichadas/informe-rendimiento/{id} — informe rendimiento"""
        r = client.get(f"/api/v1/fichadas/informe-rendimiento/{usuario_normal.id}",
                       headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_semanas_disponibles(self, client, auth_headers_admin, usuario_normal):
        """GET /api/v1/fichadas/semanas-disponibles/{id} — semanas disponibles"""
        r = client.get(f"/api/v1/fichadas/semanas-disponibles/{usuario_normal.id}",
                       headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_detalle_semana(self, client, auth_headers_admin, usuario_normal):
        """GET /api/v1/fichadas/detalle-semana/{id} — detalle de semana"""
        r = client.get(f"/api/v1/fichadas/detalle-semana/{usuario_normal.id}",
                       headers=auth_headers_admin, params={"semana": "2026-W07"})
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 9: Piezas — /api/v1/piezas
# ============================================================

class TestSmokePiezas:
    """Endpoints de piezas nuevas, CSV guardados, pedidos"""

    @pytest.mark.smoke
    def test_piezas_nuevas(self, client, auth_headers_admin, base_desguace_ejemplo):
        """POST /api/v1/piezas/nuevas — añadir piezas nuevas"""
        r = client.post("/api/v1/piezas/nuevas", headers=auth_headers_admin,
                        json={"piezas": [{"refid": "NEW-001", "oem": "OEM-NEW", "precio": 50}]})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_recientes(self, client, auth_headers_admin):
        """GET /api/v1/piezas/recientes — piezas recientes"""
        r = client.get("/api/v1/piezas/recientes", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_eliminar_pieza_inexistente(self, client, auth_headers_admin):
        """DELETE /api/v1/piezas/99999 — eliminar pieza que no existe"""
        r = client.delete("/api/v1/piezas/99999", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_verificar_csv(self, client, auth_headers_admin):
        """POST /api/v1/piezas/verificar-csv — verificar CSV"""
        csv = b"referencia;cantidad\nREF-001;1"
        r = client.post("/api/v1/piezas/verificar-csv", headers=auth_headers_admin,
                        files={"file": ("pedido.csv", BytesIO(csv), "text/csv")})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_csv_guardados(self, client, auth_headers_admin):
        """GET /api/v1/piezas/csv-guardados — listar CSV guardados"""
        r = client.get("/api/v1/piezas/csv-guardados", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_pedidas_listar(self, client, auth_headers_admin):
        """GET /api/v1/piezas/pedidas — listar piezas pedidas"""
        r = client.get("/api/v1/piezas/pedidas", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_pedidas_crear(self, client, auth_headers_admin):
        """POST /api/v1/piezas/pedidas — marcar pieza como pedida"""
        r = client.post("/api/v1/piezas/pedidas", headers=auth_headers_admin,
                        json={"referencia": "SMOKE-PED-001"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_pedidas_eliminar(self, client, auth_headers_admin):
        """DELETE /api/v1/piezas/pedidas/NONEXIST — eliminar pedida"""
        r = client.delete("/api/v1/piezas/pedidas/NONEXIST", headers=auth_headers_admin)
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 10: Admin — /api/v1/admin
# ============================================================

class TestSmokeAdmin:
    """Endpoints de administración: audit logs, backups, scheduler, API logs"""

    @pytest.mark.smoke
    def test_audit_logs(self, client, auth_headers_admin):
        """GET /api/v1/admin/audit-logs — logs de auditoría"""
        r = client.get("/api/v1/admin/audit-logs", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_audit_logs_acciones(self, client, auth_headers_admin):
        """GET /api/v1/admin/audit-logs/acciones — acciones disponibles"""
        r = client.get("/api/v1/admin/audit-logs/acciones", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_backups_listar(self, client, auth_headers_owner):
        """GET /api/v1/admin/backups — listar backups"""
        r = client.get("/api/v1/admin/backups", headers=auth_headers_owner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_backups_estadisticas(self, client, auth_headers_owner):
        """GET /api/v1/admin/backups/estadisticas — estadísticas backups"""
        r = client.get("/api/v1/admin/backups/estadisticas", headers=auth_headers_owner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_scheduler_estado(self, client, auth_headers_admin):
        """GET /api/v1/admin/scheduler/estado — estado del scheduler"""
        r = client.get("/api/v1/admin/scheduler/estado", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_api_logs(self, client, auth_headers_admin):
        """GET /api/v1/admin/api-logs — logs de peticiones API"""
        r = client.get("/api/v1/admin/api-logs", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_api_stats(self, client, auth_headers_admin):
        """GET /api/v1/admin/api-stats — estadísticas API"""
        r = client.get("/api/v1/admin/api-stats", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_api_logs_entornos(self, client, auth_headers_sysowner):
        """GET /api/v1/admin/api-logs/entornos — entornos con logs"""
        r = client.get("/api/v1/admin/api-logs/entornos", headers=auth_headers_sysowner)
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 11: Stockeo — /api/v1/stockeo
# ============================================================

class TestSmokeStockeo:
    """Endpoints de configuración de stockeo automático"""

    @pytest.mark.smoke
    def test_campos_disponibles(self, client, auth_headers_sysowner):
        """GET /api/v1/stockeo/campos-disponibles — campos CSV"""
        r = client.get("/api/v1/stockeo/campos-disponibles", headers=auth_headers_sysowner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_configuraciones(self, client, auth_headers_sysowner):
        """GET /api/v1/stockeo/configuraciones — listar configuraciones"""
        r = client.get("/api/v1/stockeo/configuraciones", headers=auth_headers_sysowner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_configuracion_por_entorno(self, client, auth_headers_sysowner, entorno_trabajo):
        """GET /api/v1/stockeo/configuracion/{eid} — configuración de un entorno"""
        r = client.get(f"/api/v1/stockeo/configuracion/{entorno_trabajo.id}",
                       headers=auth_headers_sysowner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_crear_configuracion(self, client, auth_headers_sysowner, entorno_trabajo):
        """POST /api/v1/stockeo/configuracion — crear configuración de stockeo"""
        r = client.post("/api/v1/stockeo/configuracion", headers=auth_headers_sysowner, json={
            "entorno_trabajo_id": entorno_trabajo.id,
            "ruta_csv": "/tmp/test.csv",
            "mapeo_columnas": {"refid": "ref", "oem": "oem"},
        })
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 12: Tickets — /api/v1/tickets
# ============================================================

class TestSmokeTickets:
    """Endpoints del sistema de tickets/soporte"""

    @pytest.mark.smoke
    def test_crear(self, client, auth_headers_user):
        """POST /api/v1/tickets/crear — crear ticket"""
        r = client.post("/api/v1/tickets/crear", headers=auth_headers_user, json={
            "tipo": "error", "asunto": "Smoke test", "descripcion": "Test desde smoke",
        })
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_mis_tickets(self, client, auth_headers_user):
        """GET /api/v1/tickets/mis-tickets — mis tickets"""
        r = client.get("/api/v1/tickets/mis-tickets", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_todos_tickets(self, client, auth_headers_sysowner):
        """GET /api/v1/tickets/todos — todos los tickets (sysowner)"""
        r = client.get("/api/v1/tickets/todos", headers=auth_headers_sysowner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_detalle_ticket(self, client, auth_headers_user, ticket_ejemplo):
        """GET /api/v1/tickets/{id} — detalle de ticket"""
        r = client.get(f"/api/v1/tickets/{ticket_ejemplo.id}", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_enviar_mensaje(self, client, auth_headers_user, ticket_ejemplo):
        """POST /api/v1/tickets/{id}/mensaje — enviar mensaje"""
        r = client.post(f"/api/v1/tickets/{ticket_ejemplo.id}/mensaje",
                        headers=auth_headers_user, json={"mensaje": "Smoke msg"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_cambiar_estado(self, client, auth_headers_sysowner, ticket_ejemplo):
        """PUT /api/v1/tickets/{id}/estado — cambiar estado"""
        r = client.put(f"/api/v1/tickets/{ticket_ejemplo.id}/estado",
                       headers=auth_headers_sysowner, json={"estado": "en_progreso"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_estadisticas(self, client, auth_headers_sysowner):
        """GET /api/v1/tickets/estadisticas/resumen — estadísticas"""
        r = client.get("/api/v1/tickets/estadisticas/resumen", headers=auth_headers_sysowner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_eliminar_ticket(self, client, auth_headers_user, ticket_ejemplo):
        """DELETE /api/v1/tickets/{id} — eliminar ticket"""
        r = client.delete(f"/api/v1/tickets/{ticket_ejemplo.id}", headers=auth_headers_user)
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 13: Anuncios — /api/v1/anuncios
# ============================================================

class TestSmokeAnuncios:
    """Endpoints del sistema de anuncios/changelog"""

    @pytest.mark.smoke
    def test_crear(self, client, auth_headers_sysowner):
        """POST /api/v1/anuncios/crear — crear anuncio"""
        r = client.post("/api/v1/anuncios/crear", headers=auth_headers_sysowner, json={
            "titulo": "Smoke Test", "contenido": "Contenido smoke",
            "tipo": "changelog", "mostrar_popup": False,
        })
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_admin_todos(self, client, auth_headers_sysowner):
        """GET /api/v1/anuncios/admin/todos — todos los anuncios (admin)"""
        r = client.get("/api/v1/anuncios/admin/todos", headers=auth_headers_sysowner)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_no_leidos(self, client, auth_headers_user):
        """GET /api/v1/anuncios/no-leidos — anuncios no leídos"""
        r = client.get("/api/v1/anuncios/no-leidos", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_changelog(self, client, auth_headers_user):
        """GET /api/v1/anuncios/changelog — historial de cambios"""
        r = client.get("/api/v1/anuncios/changelog", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_marcar_leido(self, client, auth_headers_user, anuncio_ejemplo):
        """POST /api/v1/anuncios/{id}/marcar-leido — marcar como leído"""
        r = client.post(f"/api/v1/anuncios/{anuncio_ejemplo.id}/marcar-leido",
                        headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_marcar_todos_leidos(self, client, auth_headers_user):
        """POST /api/v1/anuncios/marcar-todos-leidos — marcar todos leídos"""
        r = client.post("/api/v1/anuncios/marcar-todos-leidos", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_editar(self, client, auth_headers_sysowner, anuncio_ejemplo):
        """PUT /api/v1/anuncios/{id} — editar anuncio"""
        r = client.put(f"/api/v1/anuncios/{anuncio_ejemplo.id}", headers=auth_headers_sysowner,
                       json={"titulo": "Editado smoke"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_eliminar(self, client, auth_headers_sysowner, anuncio_ejemplo):
        """DELETE /api/v1/anuncios/{id} — eliminar anuncio"""
        r = client.delete(f"/api/v1/anuncios/{anuncio_ejemplo.id}", headers=auth_headers_sysowner)
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 14: Paquetería — /api/v1/paqueteria
# ============================================================

class TestSmokePaqueteria:
    """Endpoints de paquetería: sucursales, registros, cajas, estadísticas"""

    # --- Sucursales ---

    @pytest.mark.smoke
    def test_listar_sucursales(self, client, auth_headers_user):
        """GET /api/v1/paqueteria/sucursales — listar sucursales"""
        r = client.get("/api/v1/paqueteria/sucursales", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_crear_sucursal(self, client, auth_headers_admin, entorno_trabajo):
        """POST /api/v1/paqueteria/sucursales — crear sucursal"""
        r = client.post("/api/v1/paqueteria/sucursales", headers=auth_headers_admin, json={
            "nombre": "Sucursal Smoke", "color_hex": "#FF0000",
        })
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_editar_sucursal(self, client, auth_headers_admin, sucursal_ejemplo):
        """PUT /api/v1/paqueteria/sucursales/{id} — editar sucursal"""
        r = client.put(f"/api/v1/paqueteria/sucursales/{sucursal_ejemplo.id}",
                       headers=auth_headers_admin, json={"nombre": "Editada"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_eliminar_sucursal(self, client, auth_headers_admin, sucursal_ejemplo):
        """DELETE /api/v1/paqueteria/sucursales/{id} — eliminar sucursal"""
        r = client.delete(f"/api/v1/paqueteria/sucursales/{sucursal_ejemplo.id}",
                          headers=auth_headers_admin)
        assert _ok(r.status_code)

    # --- Registros ---

    @pytest.mark.smoke
    def test_registrar(self, client, auth_headers_user, sucursal_ejemplo):
        """POST /api/v1/paqueteria/registrar — registrar paquete"""
        r = client.post("/api/v1/paqueteria/registrar", headers=auth_headers_user, json={
            "id_caja": "CAJA-SMOKE", "id_pieza": "PIEZA-SMOKE",
            "sucursal_id": sucursal_ejemplo.id,
        })
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_ranking(self, client, auth_headers_user):
        """GET /api/v1/paqueteria/ranking — ranking del día"""
        r = client.get("/api/v1/paqueteria/ranking", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_mis_registros(self, client, auth_headers_user):
        """GET /api/v1/paqueteria/mis-registros — mis registros"""
        r = client.get("/api/v1/paqueteria/mis-registros", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_detalle_usuario(self, client, auth_headers_admin, usuario_normal):
        """GET /api/v1/paqueteria/detalle-usuario/{id} — detalle de usuario"""
        r = client.get(f"/api/v1/paqueteria/detalle-usuario/{usuario_normal.id}",
                       headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_todos_registros(self, client, auth_headers_admin):
        """GET /api/v1/paqueteria/todos-registros — todos los registros"""
        r = client.get("/api/v1/paqueteria/todos-registros", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_estadisticas(self, client, auth_headers_user):
        """GET /api/v1/paqueteria/estadisticas — estadísticas paquetería"""
        r = client.get("/api/v1/paqueteria/estadisticas", headers=auth_headers_user)
        assert _ok(r.status_code)

    # --- Tipos de caja ---

    @pytest.mark.smoke
    def test_tipos_caja_listar(self, client, auth_headers_admin):
        """GET /api/v1/paqueteria/tipos-caja — listar tipos de caja"""
        r = client.get("/api/v1/paqueteria/tipos-caja", headers=auth_headers_admin)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_tipos_caja_crear(self, client, auth_headers_admin):
        """POST /api/v1/paqueteria/tipos-caja — crear tipo de caja"""
        r = client.post("/api/v1/paqueteria/tipos-caja", headers=auth_headers_admin, json={
            "referencia_caja": "SMOKE-001", "tipo_nombre": "Smoke Box",
        })
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_tipos_caja_editar(self, client, auth_headers_admin, tipo_caja_ejemplo):
        """PUT /api/v1/paqueteria/tipos-caja/{id} — editar tipo de caja"""
        r = client.put(f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}",
                       headers=auth_headers_admin, json={"tipo_nombre": "Editada"})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_tipos_caja_stock(self, client, auth_headers_admin, tipo_caja_ejemplo):
        """PUT /api/v1/paqueteria/tipos-caja/{id}/stock — ajustar stock"""
        r = client.put(f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}/stock",
                       headers=auth_headers_admin, params={"stock": 20})
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_tipos_caja_movimiento(self, client, auth_headers_admin, tipo_caja_ejemplo):
        """POST /api/v1/paqueteria/tipos-caja/{id}/movimiento — registrar movimiento"""
        r = client.post(f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}/movimiento",
                        headers=auth_headers_admin, json={
                            "cantidad": 5, "tipo_movimiento": "entrada", "notas": "Smoke",
                        })
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_tipos_caja_movimientos_listar(self, client, auth_headers_user, tipo_caja_ejemplo):
        """GET /api/v1/paqueteria/tipos-caja/{id}/movimientos — listar movimientos"""
        r = client.get(f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}/movimientos",
                       headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_tipos_caja_resumen(self, client, auth_headers_user):
        """GET /api/v1/paqueteria/tipos-caja/resumen — resumen de cajas"""
        r = client.get("/api/v1/paqueteria/tipos-caja/resumen", headers=auth_headers_user)
        assert _ok(r.status_code)

    @pytest.mark.smoke
    def test_tipos_caja_eliminar(self, client, auth_headers_admin, tipo_caja_ejemplo):
        """DELETE /api/v1/paqueteria/tipos-caja/{id} — eliminar tipo de caja"""
        r = client.delete(f"/api/v1/paqueteria/tipos-caja/{tipo_caja_ejemplo.id}",
                          headers=auth_headers_admin)
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 15: Tests — /api/v1/tests (meta)
# ============================================================

class TestSmokeTestSuites:
    """Endpoints del sistema de tests (meta-test)"""

    @pytest.mark.smoke
    def test_listar_suites(self, client, auth_headers_sysowner):
        """GET /api/v1/tests/suites — listar suites disponibles"""
        r = client.get("/api/v1/tests/suites", headers=auth_headers_sysowner)
        assert _ok(r.status_code)


# ============================================================
# SECCIÓN 16: Permisos cruzados — roles insuficientes
# ============================================================

class TestSmokePermisos:
    """Verifica que endpoints protegidos rechazan roles insuficientes"""

    @pytest.mark.smoke
    def test_user_no_puede_admin_audit(self, client, auth_headers_user):
        """User intenta acceder a audit logs (admin+)"""
        r = client.get("/api/v1/admin/audit-logs", headers=auth_headers_user)
        assert _ok(r.status_code)
        assert r.status_code in (403, 401)

    @pytest.mark.smoke
    def test_user_no_puede_entornos(self, client, auth_headers_user):
        """User intenta listar entornos (sysowner)"""
        r = client.get("/api/v1/auth/entornos", headers=auth_headers_user)
        assert _ok(r.status_code)
        assert r.status_code in (403, 401)

    @pytest.mark.smoke
    def test_admin_no_puede_stockeo(self, client, auth_headers_admin):
        """Admin intenta acceder a stockeo (sysowner)"""
        r = client.get("/api/v1/stockeo/configuraciones", headers=auth_headers_admin)
        assert _ok(r.status_code)
        assert r.status_code in (403, 401)

    @pytest.mark.smoke
    def test_sin_token_fichadas(self, client):
        """Sin token intenta registrar fichada"""
        r = client.post("/api/v1/fichadas/registrar", json={"id_pieza": "X"})
        assert _ok(r.status_code)
        assert r.status_code in (401, 403)

    @pytest.mark.smoke
    def test_sin_token_paqueteria(self, client):
        """Sin token intenta ver ranking paquetería"""
        r = client.get("/api/v1/paqueteria/ranking")
        assert _ok(r.status_code)
        assert r.status_code in (401, 403)

    @pytest.mark.smoke
    def test_user_no_puede_crear_anuncio(self, client, auth_headers_user):
        """User intenta crear anuncio (sysowner)"""
        r = client.post("/api/v1/anuncios/crear", headers=auth_headers_user, json={
            "titulo": "No", "contenido": "No", "tipo": "changelog",
        })
        assert _ok(r.status_code)
        assert r.status_code in (403, 401)

    @pytest.mark.smoke
    def test_user_no_puede_tickets_todos(self, client, auth_headers_user):
        """User intenta ver todos los tickets (sysowner)"""
        r = client.get("/api/v1/tickets/todos", headers=auth_headers_user)
        assert _ok(r.status_code)
        assert r.status_code in (403, 401)
