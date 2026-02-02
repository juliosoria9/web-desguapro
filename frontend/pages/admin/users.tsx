'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Usuario {
  id: number;
  email: string;  // Este es el nombre de usuario
  nombre?: string;
  rol: string;
  activo: boolean;
  entorno_trabajo_id?: number;
  showPassword?: boolean;  // Para mostrar/ocultar contraseña en UI
  password?: string;       // Contraseña obtenida del servidor
}

interface Entorno {
  id: number;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

export default function UsersAdminPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  
  // Estados para usuarios
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  
  // Estados para empresas (solo OWNER)
  const [empresas, setEmpresas] = useState<Entorno[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
  const [showCreateEmpresa, setShowCreateEmpresa] = useState(false);
  const [newEmpresaNombre, setNewEmpresaNombre] = useState('');
  const [newEmpresaDescripcion, setNewEmpresaDescripcion] = useState('');

  // Estados para edición de usuario
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editUsuario, setEditUsuario] = useState('');
  const [editPassword, setEditPassword] = useState('');

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && user) {
      if (user.rol === 'sysowner') {
        // Sysowner puede ver empresas y gestionar todo
        fetchEmpresas();
      } else if (user.rol === 'owner') {
        // Owner solo ve usuarios de su empresa directamente
        fetchUsersOwner();
      } else if (user.rol === 'admin') {
        fetchUsersAdmin();
      }
    }
  }, [mounted, user]);

  useEffect(() => {
    if (user?.rol === 'sysowner' && selectedEmpresa !== null) {
      fetchUsersByEmpresa(selectedEmpresa);
    }
  }, [selectedEmpresa]);

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (user.rol !== 'sysowner' && user.rol !== 'owner' && user.rol !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Acceso Denegado</h1>
          <p className="text-gray-600 mt-2">No tienes permiso para acceder a esta sección</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  const fetchEmpresas = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/entornos`,
        { withCredentials: true }
      );
      setEmpresas(response.data || []);
    } catch (error) {
      console.error('Error fetching empresas:', error);
    }
  };

  const fetchUsersByEmpresa = async (empresaId: number) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/usuarios?entorno_id=${empresaId}`,
        { withCredentials: true }
      );
      setUsers(response.data.usuarios || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    }
  };

  const fetchUsersOwner = async () => {
    // Owner solo ve usuarios de su empresa (sin seleccionar empresa)
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/usuarios`,
        { withCredentials: true }
      );
      setUsers(response.data.usuarios || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    }
  };

  const fetchUsersAdmin = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/usuarios-admin`,
        { withCredentials: true }
      );
      setUsers(response.data.usuarios || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    }
  };

  const handleCreateEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpresaNombre) {
      toast.error('Ingresa el nombre de la empresa');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/entornos`,
        { nombre: newEmpresaNombre, descripcion: newEmpresaDescripcion },
        { withCredentials: true }
      );
      toast.success('Empresa creada exitosamente');
      setNewEmpresaNombre('');
      setNewEmpresaDescripcion('');
      setShowCreateEmpresa(false);
      await fetchEmpresas();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al crear empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEmpresa = async (empresaId: number, empresaNombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar la empresa "${empresaNombre}"?\n\n⚠️ ATENCIÓN: Esto eliminará también TODOS los usuarios de esta empresa.`)) {
      return;
    }

    try {
      const response = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/entornos/${empresaId}`,
        { withCredentials: true }
      );
      toast.success(response.data.message || 'Empresa eliminada');
      
      // Si era la empresa seleccionada, limpiar selección
      if (selectedEmpresa === empresaId) {
        setSelectedEmpresa(null);
        setUsers([]);
      }
      
      await fetchEmpresas();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al eliminar empresa');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserPassword) {
      toast.error('Completa todos los campos');
      return;
    }

    if (user.rol === 'sysowner' && selectedEmpresa === null) {
      toast.error('Selecciona una empresa primero');
      return;
    }

    setLoading(true);
    try {
      // sysowner y owner usan /usuarios, admin usa /usuarios-admin
      const endpoint = (user.rol === 'sysowner' || user.rol === 'owner')
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/usuarios`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/usuarios-admin`;
      
      const payload: any = {
        email: newUserName,
        password: newUserPassword,
        rol: newUserRole,
      };

      // Si es SYSOWNER, asignar a la empresa seleccionada
      if (user.rol === 'sysowner' && selectedEmpresa) {
        payload.entorno_trabajo_id = selectedEmpresa;
      }

      await axios.post(endpoint, payload, {
        withCredentials: true
      });
      
      toast.success('Usuario creado exitosamente');
      setNewUserName('');
      setNewUserPassword('');
      setNewUserRole('user');
      
      // Refrescar lista de usuarios
      if (user.rol === 'sysowner' && selectedEmpresa) {
        await fetchUsersByEmpresa(selectedEmpresa);
      } else if (user.rol === 'owner') {
        await fetchUsersOwner();
      } else {
        await fetchUsersAdmin();
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      let errorMsg = 'Error al crear usuario';
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        errorMsg = detail[0]?.msg || errorMsg;
      }
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleDeleteUser = async (userId: number, userEmail: string) => {
    if (!confirm(`¿Estás seguro de eliminar al usuario "${userEmail}"?`)) {
      return;
    }

    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/usuarios/${userId}`,
        { withCredentials: true }
      );
      toast.success('Usuario eliminado');
      // Refrescar lista
      if (user?.rol === 'sysowner' && selectedEmpresa) {
        await fetchUsersByEmpresa(selectedEmpresa);
      } else if (user?.rol === 'owner') {
        await fetchUsersOwner();
      } else {
        await fetchUsersAdmin();
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al eliminar usuario');
    }
  };

  const handleChangeRole = async (userId: number, newRole: string) => {
    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/usuarios/${userId}/rol?nuevo_rol=${newRole}`,
        {},
        { withCredentials: true }
      );
      toast.success('Rol actualizado');
      // Refrescar lista
      if (user?.rol === 'sysowner' && selectedEmpresa) {
        await fetchUsersByEmpresa(selectedEmpresa);
      } else if (user?.rol === 'owner') {
        await fetchUsersOwner();
      } else {
        await fetchUsersAdmin();
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al cambiar rol');
    }
  };

  const handleViewPassword = async (userId: number) => {
    // Buscar el usuario en la lista
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    // Si ya tiene la contraseña cargada, solo alternar visibilidad
    if (targetUser.password) {
      setUsers(users.map(u => 
        u.id === userId ? { ...u, showPassword: !u.showPassword } : u
      ));
      return;
    }

    // Verificar jerarquía de roles (pero permitir ver la propia contraseña)
    const rolJerarquia: { [key: string]: number } = { sysowner: 4, owner: 3, admin: 2, user: 1 };
    const miNivel = rolJerarquia[user?.rol || 'user'] || 0;
    const suNivel = rolJerarquia[targetUser.rol] || 0;
    const esPropio = user?.id === userId;

    if (!esPropio && suNivel >= miNivel) {
      toast.error('No puedes ver la contraseña de un usuario de igual o mayor rango');
      return;
    }

    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/usuarios/${userId}/password`,
        { withCredentials: true }
      );
      
      setUsers(users.map(u => 
        u.id === userId ? { ...u, password: response.data.password, showPassword: true } : u
      ));
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al obtener contraseña');
    }
  };

  const canDeleteUser = (targetUser: Usuario): boolean => {
    if (!user) return false;
    
    // Jerarquía de roles
    const rolJerarquia: { [key: string]: number } = { sysowner: 4, owner: 3, admin: 2, user: 1 };
    const miNivel = rolJerarquia[user.rol] || 0;
    const suNivel = rolJerarquia[targetUser.rol] || 0;
    
    // Solo puede eliminar usuarios de menor rango
    if (suNivel >= miNivel) return false;
    
    // No puede eliminarse a sí mismo
    if (targetUser.id === user.id) return false;
    
    return true;
  };

  const canViewPassword = (targetUser: Usuario): boolean => {
    if (!user) return false;
    
    // Puede ver su propia contraseña
    if (targetUser.id === user.id) return true;
    
    // Jerarquía de roles
    const rolJerarquia: { [key: string]: number } = { sysowner: 4, owner: 3, admin: 2, user: 1 };
    const miNivel = rolJerarquia[user.rol] || 0;
    const suNivel = rolJerarquia[targetUser.rol] || 0;
    
    // Solo puede ver contraseñas de usuarios de menor rango
    return suNivel < miNivel;
  };

  const canEditUser = (targetUser: Usuario): boolean => {
    if (!user) return false;
    
    // Puede editar su propio perfil (nombre y contraseña)
    if (targetUser.id === user.id) return true;
    
    // Jerarquía de roles
    const rolJerarquia: { [key: string]: number } = { sysowner: 4, owner: 3, admin: 2, user: 1 };
    const miNivel = rolJerarquia[user.rol] || 0;
    const suNivel = rolJerarquia[targetUser.rol] || 0;
    
    // Solo puede editar usuarios de menor rango
    return suNivel < miNivel;
  };

  const handleEditUser = (targetUser: Usuario) => {
    setEditingUser(targetUser);
    setEditUsuario(targetUser.email);
    setEditPassword('');
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    
    try {
      const params = new URLSearchParams();
      // Enviar el nuevo nombre de usuario si cambió
      if (editUsuario.trim() && editUsuario.trim() !== editingUser.email) {
        params.append('usuario', editUsuario.trim());
      }
      if (editPassword.trim()) params.append('password', editPassword.trim());
      
      // Solo hacer la petición si hay algo que cambiar
      if (params.toString()) {
        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/usuarios/${editingUser.id}?${params.toString()}`,
          {},
          { withCredentials: true }
        );
        toast.success('Usuario actualizado');
      }
      
      setEditingUser(null);
      setEditUsuario('');
      setEditPassword('');
      
      // Refrescar lista
      if (user?.rol === 'sysowner' && selectedEmpresa) {
        await fetchUsersByEmpresa(selectedEmpresa);
      } else if (user?.rol === 'owner') {
        await fetchUsersOwner();
      } else {
        await fetchUsersAdmin();
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al actualizar usuario');
    }
  };

  const handleInforme = (userId: number) => {
    router.push(`/admin/informe/${userId}`);
  };

  const getEmpresaNombre = () => {
    if (selectedEmpresa === null) return '';
    const empresa = empresas.find(e => e.id === selectedEmpresa);
    return empresa?.nombre || '';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modal de edición de usuario */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Editar Usuario
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                <input
                  type="text"
                  value={editUsuario}
                  onChange={(e) => setEditUsuario(e.target.value)}
                  placeholder="Nombre de usuario"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Dejar vacío para no cambiar"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">Dejar vacío si no deseas cambiar la contraseña</p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4 cursor-pointer" onClick={() => router.push('/dashboard')}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-white shadow-sm p-1">
                <img src="/logo.png" alt="DesguaPro" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">DesguaPro</h1>
                <p className="text-xs text-gray-500">
                  {user.rol === 'sysowner' ? 'Gestión de Sistema' : user.rol === 'owner' ? 'Gestión de Usuarios' : 'Gestionar Usuarios'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.email}</p>
                <p className="text-xs text-gray-500">
                  {user.rol === 'sysowner' ? 'Propietario de Sistema' : 
                   user.rol === 'owner' ? 'Propietario' : 'Admin'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* SYSOWNER: Sección de Empresas */}
        {user.rol === 'sysowner' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Empresas</h2>
              <button
                onClick={() => setShowCreateEmpresa(!showCreateEmpresa)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                {showCreateEmpresa ? 'Cancelar' : '+ Nueva Empresa'}
              </button>
            </div>

            {/* Formulario crear empresa */}
            {showCreateEmpresa && (
              <form onSubmit={handleCreateEmpresa} className="bg-green-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
                    <input
                      type="text"
                      value={newEmpresaNombre}
                      onChange={(e) => setNewEmpresaNombre(e.target.value)}
                      placeholder="Nombre de la empresa"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                    <input
                      type="text"
                      value={newEmpresaDescripcion}
                      onChange={(e) => setNewEmpresaDescripcion(e.target.value)}
                      placeholder="Descripción (opcional)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      Crear Empresa
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Lista de empresas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {empresas.map((empresa) => (
                <div
                  key={empresa.id}
                  className={`relative p-4 rounded-lg border-2 transition-all ${
                    selectedEmpresa === empresa.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <button
                    onClick={() => setSelectedEmpresa(empresa.id)}
                    className="w-full text-left"
                  >
                    <p className="font-semibold text-gray-900 pr-6">{empresa.nombre}</p>
                    {empresa.descripcion && (
                      <p className="text-xs text-gray-500 mt-1">{empresa.descripcion}</p>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEmpresa(empresa.id, empresa.nombre);
                    }}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Eliminar empresa"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              ))}
              {empresas.length === 0 && (
                <p className="col-span-4 text-center text-gray-500 py-4">
                  No hay empresas. Crea una nueva para empezar.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Sección de Usuarios */}
        {(user.rol === 'admin' || user.rol === 'owner' || (user.rol === 'sysowner' && selectedEmpresa !== null)) && (
          <>
            {/* Crear Usuario */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Crear Usuario 
                {user.rol === 'sysowner' && selectedEmpresa && (
                  <span className="text-blue-600 text-base font-normal ml-2">
                    en {getEmpresaNombre()}
                  </span>
                )}
              </h2>
              
              <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Usuario</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="nombre de usuario"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Contraseña</label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Rol</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="user">Usuario</option>
                    <option value="admin">Administrador</option>
                    {user.rol === 'sysowner' && <option value="owner">Propietario</option>}
                    {user.rol === 'sysowner' && <option value="sysowner">Propietario de Sistema</option>}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    {loading ? 'Creando...' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>

            {/* Lista de Usuarios */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Usuarios
                {user.rol === 'sysowner' && selectedEmpresa && (
                  <span className="text-gray-500 text-base font-normal ml-2">
                    de {getEmpresaNombre()}
                  </span>
                )}
                <span className="text-gray-400 text-sm font-normal ml-2">({users.length})</span>
              </h2>
              
              {users.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900">Usuario</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900">Contraseña</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900">Rol</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900">Estado</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-900">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{u.email}</td>
                          <td className="px-4 py-3 text-sm">
                            {canViewPassword(u) ? (
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-gray-700">
                                  {u.showPassword ? u.password : '********'}
                                </span>
                                <button
                                  onClick={() => handleViewPassword(u.id)}
                                  className="text-blue-600 hover:text-blue-800 text-xs underline"
                                >
                                  {u.showPassword ? 'Ocultar' : 'Ver'}
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {user?.rol === 'sysowner' && u.id !== user.id ? (
                              <select
                                value={u.rol}
                                onChange={(e) => handleChangeRole(u.id, e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-xs"
                              >
                                <option value="user">Usuario</option>
                                <option value="admin">Admin</option>
                                <option value="owner">Propietario</option>
                                <option value="sysowner">Prop. Sistema</option>
                              </select>
                            ) : (
                              <span>
                                {u.rol === 'sysowner' && 'Prop. Sistema'}
                                {u.rol === 'owner' && 'Propietario'}
                                {u.rol === 'admin' && 'Admin'}
                                {u.rol === 'user' && 'Usuario'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              u.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {u.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex gap-2">
                              {(user?.rol === 'sysowner' || user?.rol === 'owner' || user?.rol === 'admin') && (
                                <button
                                  onClick={() => handleInforme(u.id)}
                                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                                >
                                  Informe
                                </button>
                              )}
                              {canEditUser(u) && (
                                <button
                                  onClick={() => handleEditUser(u)}
                                  className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200"
                                >
                                  Editar
                                </button>
                              )}
                              {canDeleteUser(u) && (
                                <button
                                  onClick={() => handleDeleteUser(u.id, u.email)}
                                  className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                                >
                                  Eliminar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No hay usuarios en esta empresa</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Mensaje cuando SYSOWNER no ha seleccionado empresa */}
        {user.rol === 'sysowner' && selectedEmpresa === null && empresas.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <p className="text-blue-800">
              Selecciona una empresa para gestionar sus usuarios
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

