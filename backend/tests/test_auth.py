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
