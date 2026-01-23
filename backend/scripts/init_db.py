"""
Script para inicializar la base de datos con usuario OWNER inicial
Ejecutar desde la carpeta backend:

    python scripts/init_db.py
"""

import sys
import os

# Agregar el directorio backend al path
backend_dir = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, backend_dir)

from app.database import SessionLocal, engine, Base
from app.models.busqueda import Usuario, EntornoTrabajo
from utils.security import hash_password


def init_db():
    """
    Inicializar la base de datos con usuario OWNER y entorno por defecto
    """
    # 1. Crear todas las tablas
    print("📋 Creando tablas...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tablas creadas\n")
    
    db = SessionLocal()
    
    try:
        # Verificar si ya existe un usuario
        usuario_existente = db.query(Usuario).filter(
            Usuario.rol == "OWNER"
        ).first()
        
        if usuario_existente:
            print("⚠️  Ya existe un usuario OWNER en la base de datos")
            print(f"   Email: {usuario_existente.email}")
            print("   No se crearán usuarios nuevos")
            return
        
        # Crear usuario OWNER inicial
        email_owner = "julio@motocoche.com"
        password = "julio123456"
        
        print(f"\n📧 Email del propietario: {email_owner}")
        print(f"🔐 Contraseña: {password}")
        
        # Verificar que no exista
        if db.query(Usuario).filter(Usuario.email == email_owner).first():
            print(f"❌ El email {email_owner} ya está registrado")
            return
        
        if len(password) < 8:
            print("❌ La contraseña debe tener al menos 8 caracteres")
            return
        
        password_confirm = input("🔐 Confirmar contraseña: ").strip()
        if password != password_confirm:
            print("❌ Las contraseñas no coinciden")
            return
        
        # Crear usuario
        usuario = Usuario(
            email=email_owner,
            password_hash=hash_password(password),
            rol="OWNER",
            entorno_trabajo_id=None,  # Owner no tiene entorno asignado
        )
        db.add(usuario)
        db.flush()
        
        print(f"\n✅ Usuario OWNER creado exitosamente")
        print(f"   Email: {email_owner}")
        print(f"   ID: {usuario.id}")
        
        # Crear entorno por defecto
        nombre_entorno = input("\n🏢 Nombre del entorno de trabajo principal: ").strip()
        if not nombre_entorno:
            nombre_entorno = "Entorno Principal"
        
        entorno = EntornoTrabajo(
            owner_id=usuario.id,
            nombre=nombre_entorno,
            descripcion=f"Entorno de trabajo principal para {email_owner}",
        )
        db.add(entorno)
        db.flush()
        
        print(f"\n✅ Entorno de trabajo creado exitosamente")
        print(f"   Nombre: {nombre_entorno}")
        print(f"   ID: {entorno.id}")
        
        # Asignar usuario al entorno (owner puede estar en su propio entorno)
        usuario.entorno_trabajo_id = entorno.id
        
        db.commit()
        
        print("\n" + "="*60)
        print("✅ BASE DE DATOS INICIALIZADA CORRECTAMENTE")
        print("="*60)
        print(f"""
Usuario OWNER creado:
  Email: {email_owner}
  ID: {usuario.id}

Entorno de trabajo creado:
  Nombre: {nombre_entorno}
  ID: {entorno.id}

Próximos pasos:
1. Iniciar el servidor: python -m uvicorn app.main:app --reload
2. Login en http://localhost:8000/docs
3. Usar credenciales:
   - Email: {email_owner}
   - Contraseña: (la que ingresaste)
4. Crear más usuarios desde /auth/usuarios (solo owner)
5. Crear más entornos desde /auth/entornos (solo owner)
        """)
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error durante la inicialización: {str(e)}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("="*60)
    print("🔧 INICIALIZADOR DE BASE DE DATOS - Ecooparts Web API")
    print("="*60)
    print()
    init_db()
