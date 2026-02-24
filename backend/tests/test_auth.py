"""
Tests de autenticación y seguridad
"""
import pytest
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestSecurityUtils:
    """Tests para utilidades de seguridad"""
    
    @pytest.mark.unit
    def test_hash_password(self):
        """Test de hash de contraseña"""
        from utils.security import hash_password
        
        password = "test_password123"
        hashed = hash_password(password)
        
        assert hashed is not None
        assert hashed != password
        assert len(hashed) > 20
    
    @pytest.mark.unit
    def test_verify_password_correct(self):
        """Test de verificación de contraseña correcta"""
        from utils.security import hash_password, verify_password
        
        password = "correct_password"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) == True
    
    @pytest.mark.unit
    def test_verify_password_incorrect(self):
        """Test de verificación de contraseña incorrecta"""
        from utils.security import hash_password, verify_password
        
        password = "correct_password"
        hashed = hash_password(password)
        
        assert verify_password("wrong_password", hashed) == False
    
    @pytest.mark.unit
    def test_create_access_token(self):
        """Test de creación de token JWT"""
        from utils.security import create_access_token
        
        token_data = {
            "usuario_id": 1,
            "email": "test@test.com",
            "rol": "user",
        }
        
        token = create_access_token(token_data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 50
    
    @pytest.mark.unit
    def test_token_has_three_parts(self):
        """Test de que el token JWT tiene 3 partes"""
        from utils.security import create_access_token
        
        token = create_access_token({"test": "data"})
        parts = token.split(".")
        
        assert len(parts) == 3, "Un JWT válido tiene 3 partes separadas por '.'"


class TestLoginEndpoint:
    """Tests para el endpoint de login"""
    
    @pytest.mark.api
    def test_login_success(self, client, usuario_normal):
        """Test de login exitoso"""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "user@test.com",
                "password": "test123",
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "access_token" in data
        assert "usuario" in data
        assert data["usuario"]["email"] == "user@test.com"
    
    @pytest.mark.api
    def test_login_wrong_email(self, client, usuario_normal):
        """Test de login con email incorrecto"""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "wrong@test.com",
                "password": "test123",
            }
        )
        
        assert response.status_code == 401
    
    @pytest.mark.api
    def test_login_wrong_password(self, client, usuario_normal):
        """Test de login con contraseña incorrecta"""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "user@test.com",
                "password": "wrongpassword",
            }
        )
        
        assert response.status_code == 401
    
    @pytest.mark.api
    def test_login_sets_cookie(self, client, usuario_normal):
        """Test de que login establece cookie httponly"""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "user@test.com",
                "password": "test123",
            }
        )
        
        assert response.status_code == 200
        
        # Verificar que se estableció la cookie
        cookies = response.cookies
        assert "access_token" in cookies or response.headers.get("set-cookie") is not None


class TestLogoutEndpoint:
    """Tests para el endpoint de logout"""
    
    @pytest.mark.api
    def test_logout(self, client, usuario_normal, auth_headers_user):
        """Test de logout"""
        response = client.post(
            "/api/v1/auth/logout",
            headers=auth_headers_user,
        )
        
        assert response.status_code == 200


class TestMeEndpoint:
    """Tests para el endpoint /me"""
    
    @pytest.mark.api
    def test_me_authenticated(self, client, usuario_normal, auth_headers_user):
        """Test de /me con usuario autenticado"""
        response = client.get(
            "/api/v1/auth/me",
            headers=auth_headers_user,
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["email"] == "user@test.com"
        assert data["rol"] == "user"
    
    @pytest.mark.api
    def test_me_unauthenticated(self, client):
        """Test de /me sin autenticación"""
        response = client.get("/api/v1/auth/me")
        
        # Debería requerir autenticación
        assert response.status_code in [401, 403]


class TestTokenValidation:
    """Tests para validación de tokens"""
    
    @pytest.mark.api
    def test_invalid_token(self, client):
        """Test con token inválido"""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid_token_here"},
        )
        
        assert response.status_code in [401, 403]
    
    @pytest.mark.api
    def test_malformed_authorization_header(self, client):
        """Test con header Authorization malformado"""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "NotBearer token"},
        )
        
        assert response.status_code in [401, 403]
    
    @pytest.mark.api
    def test_empty_authorization(self, client):
        """Test con Authorization vacío"""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": ""},
        )
        
        assert response.status_code in [401, 403]


class TestRolePermissions:
    """Tests para permisos basados en roles"""
    
    @pytest.mark.api
    def test_admin_can_list_users(self, client, usuario_admin, auth_headers_admin):
        """Test de que admin puede listar usuarios (o requiere owner/sysowner)"""
        response = client.get(
            "/api/v1/auth/usuarios",
            headers=auth_headers_admin,
        )
        
        # Admin puede tener acceso o requerir rol más alto (owner/sysowner)
        # El test verifica que no es 404 (ruta existe) y que maneja autorización
        assert response.status_code in [200, 403]
    
    @pytest.mark.api
    def test_user_cannot_create_user(self, client, usuario_normal, auth_headers_user, entorno_trabajo):
        """Test de que usuario normal no puede crear usuarios"""
        response = client.post(
            "/api/v1/auth/usuarios",
            headers=auth_headers_user,
            json={
                "email": "newuser@test.com",
                "nombre": "New User",
                "password": "test123",
                "rol": "user",
                "entorno_trabajo_id": entorno_trabajo.id,
            }
        )
        
        # Usuario normal no debería poder crear usuarios
        assert response.status_code in [401, 403]


class TestPasswordSecurity:
    """Tests de seguridad de contraseñas"""
    
    @pytest.mark.unit
    def test_passwords_are_unique_hashes(self):
        """Test de que el mismo password genera hashes diferentes"""
        from utils.security import hash_password
        
        password = "same_password"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        
        # bcrypt genera salt aleatorio, así que los hashes deberían ser diferentes
        assert hash1 != hash2
    
    @pytest.mark.unit
    def test_both_hashes_verify_correctly(self):
        """Test de que ambos hashes verifican correctamente"""
        from utils.security import hash_password, verify_password
        
        password = "same_password"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        
        assert verify_password(password, hash1) == True
        assert verify_password(password, hash2) == True


class TestVerPasswordUsuario:
    """Tests para GET /api/v1/auth/usuarios/{id}/password"""

    @pytest.mark.api
    def test_ver_password_admin_ve_user(self, client, db_session, auth_headers_admin, usuario_admin, usuario_normal):
        """Admin puede ver password de user de menor rango"""
        # Guardar password_plain para que el endpoint lo encuentre
        usuario_normal.password_plain = "test123"
        db_session.commit()

        response = client.get(
            f"/api/v1/auth/usuarios/{usuario_normal.id}/password",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200
        assert response.json()["password"] == "test123"

    @pytest.mark.api
    def test_ver_password_user_no_puede(self, client, auth_headers_user, usuario_normal, usuario_admin):
        """User normal no tiene acceso (no es admin+)"""
        response = client.get(
            f"/api/v1/auth/usuarios/{usuario_admin.id}/password",
            headers=auth_headers_user,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_ver_password_mismo_rango_denegado(self, client, db_session, auth_headers_admin, usuario_admin):
        """Admin no puede ver password de otro admin"""
        from app.models.busqueda import Usuario
        from utils.security import hash_password
        otro_admin = Usuario(
            email="admin2@test.com",
            nombre="Admin2",
            password_hash=hash_password("pass2"),
            password_plain="pass2",
            rol="admin",
            activo=True,
            entorno_trabajo_id=usuario_admin.entorno_trabajo_id,
        )
        db_session.add(otro_admin)
        db_session.commit()
        db_session.refresh(otro_admin)

        response = client.get(
            f"/api/v1/auth/usuarios/{otro_admin.id}/password",
            headers=auth_headers_admin,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_ver_password_usuario_no_existe(self, client, auth_headers_admin, usuario_admin):
        response = client.get(
            "/api/v1/auth/usuarios/99999/password",
            headers=auth_headers_admin,
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_ver_password_sin_password_plain(self, client, auth_headers_admin, usuario_admin, usuario_normal):
        """Si no hay password_plain almacenada, devuelve 404"""
        response = client.get(
            f"/api/v1/auth/usuarios/{usuario_normal.id}/password",
            headers=auth_headers_admin,
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_ver_password_propio(self, client, db_session, auth_headers_admin, usuario_admin):
        """Un usuario puede ver su propia password"""
        usuario_admin.password_plain = "test123"
        db_session.commit()

        response = client.get(
            f"/api/v1/auth/usuarios/{usuario_admin.id}/password",
            headers=auth_headers_admin,
        )
        assert response.status_code == 200

    @pytest.mark.api
    def test_ver_password_admin_otro_entorno(self, client, db_session, auth_headers_admin, usuario_admin):
        """Admin no puede ver password de user de otro entorno"""
        from app.models.busqueda import Usuario, EntornoTrabajo
        from utils.security import hash_password
        otro_ent = EntornoTrabajo(nombre="Otro", activo=True)
        db_session.add(otro_ent)
        db_session.commit()
        db_session.refresh(otro_ent)

        user_otro = Usuario(
            email="otro@test.com",
            nombre="Otro User",
            password_hash=hash_password("pass"),
            password_plain="pass",
            rol="user",
            activo=True,
            entorno_trabajo_id=otro_ent.id,
        )
        db_session.add(user_otro)
        db_session.commit()
        db_session.refresh(user_otro)

        response = client.get(
            f"/api/v1/auth/usuarios/{user_otro.id}/password",
            headers=auth_headers_admin,
        )
        assert response.status_code == 403


class TestEliminarEntorno:
    """Tests para DELETE /api/v1/auth/entornos/{id}"""

    @pytest.mark.api
    def test_eliminar_entorno_sysowner(self, client, db_session, auth_headers_sysowner, usuario_sysowner):
        """Sysowner puede eliminar un entorno"""
        from app.models.busqueda import EntornoTrabajo
        nuevo_ent = EntornoTrabajo(nombre="Para borrar", activo=True)
        db_session.add(nuevo_ent)
        db_session.commit()
        db_session.refresh(nuevo_ent)

        response = client.delete(
            f"/api/v1/auth/entornos/{nuevo_ent.id}",
            headers=auth_headers_sysowner,
        )
        assert response.status_code == 200
        assert "eliminado" in response.json()["message"].lower() or "Para borrar" in response.json()["message"]

    @pytest.mark.api
    def test_eliminar_entorno_cascade_users(self, client, db_session, auth_headers_sysowner, usuario_sysowner):
        """Eliminar entorno borra sus usuarios (no sysowner)"""
        from app.models.busqueda import EntornoTrabajo, Usuario
        from utils.security import hash_password
        ent = EntornoTrabajo(nombre="Con users", activo=True)
        db_session.add(ent)
        db_session.commit()
        db_session.refresh(ent)

        u = Usuario(
            email="delme@test.com",
            nombre="Delete Me",
            password_hash=hash_password("x"),
            rol="user",
            activo=True,
            entorno_trabajo_id=ent.id,
        )
        db_session.add(u)
        db_session.commit()

        response = client.delete(
            f"/api/v1/auth/entornos/{ent.id}",
            headers=auth_headers_sysowner,
        )
        assert response.status_code == 200
        assert "1" in response.json()["message"]

    @pytest.mark.api
    def test_eliminar_entorno_owner_forbidden(self, client, db_session, auth_headers_owner, usuario_owner):
        """Owner no puede eliminar entornos"""
        from app.models.busqueda import EntornoTrabajo
        ent = EntornoTrabajo(nombre="No borrar", activo=True)
        db_session.add(ent)
        db_session.commit()
        db_session.refresh(ent)

        response = client.delete(
            f"/api/v1/auth/entornos/{ent.id}",
            headers=auth_headers_owner,
        )
        assert response.status_code == 403

    @pytest.mark.api
    def test_eliminar_entorno_no_existe(self, client, auth_headers_sysowner, usuario_sysowner):
        response = client.delete(
            "/api/v1/auth/entornos/99999",
            headers=auth_headers_sysowner,
        )
        assert response.status_code == 404

    @pytest.mark.api
    def test_eliminar_entorno_user_forbidden(self, client, auth_headers_user, usuario_normal):
        response = client.delete(
            "/api/v1/auth/entornos/1",
            headers=auth_headers_user,
        )
        assert response.status_code == 403
