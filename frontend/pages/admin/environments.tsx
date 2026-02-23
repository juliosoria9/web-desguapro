'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface EntornoTrabajo {
  id: number;
  nombre: string;
  descripcion: string;
  activo: boolean;
  // Módulos
  modulo_fichadas: boolean;
  modulo_stock_masivo: boolean;
  modulo_referencias: boolean;
  modulo_piezas_nuevas: boolean;
  modulo_ventas: boolean;
  modulo_precios_sugeridos: boolean;
  modulo_importacion_csv: boolean;
  modulo_inventario_piezas: boolean;
  modulo_estudio_coches: boolean;
  modulo_paqueteria: boolean;
  modulo_oem_equivalentes: boolean;
  modulo_catalogo_vehiculos: boolean;
  modulo_venta_comercial: boolean;
}

interface ModuloConfig {
  key: string;
  label: string;
  descripcion: string;
}

const MODULOS_DISPONIBLES: ModuloConfig[] = [
  { key: 'modulo_fichadas', label: 'Fichadas', descripcion: 'Control de fichadas de piezas' },
  { key: 'modulo_stock_masivo', label: 'Stock Masivo', descripcion: 'Verificación masiva de precios' },
  { key: 'modulo_referencias', label: 'Referencias', descripcion: 'Cruce de referencias OEM/IAM' },
  { key: 'modulo_piezas_nuevas', label: 'Piezas Nuevas', descripcion: 'Gestión de piezas desde CSV' },
  { key: 'modulo_ventas', label: 'Ventas', descripcion: 'Historial de ventas' },
  { key: 'modulo_precios_sugeridos', label: 'Precios Sugeridos', descripcion: 'Cálculo de precios sugeridos' },
  { key: 'modulo_importacion_csv', label: 'Importación CSV', descripcion: 'Importación automática de stock' },
  { key: 'modulo_inventario_piezas', label: 'Inventario Piezas', descripcion: 'Gestión de inventario de piezas (stock)' },
  { key: 'modulo_estudio_coches', label: 'Estudio Coches', descripcion: 'Análisis y estudio de vehículos' },
  { key: 'modulo_paqueteria', label: 'Gestión Paquetería', descripcion: 'Control de envíos y paquetes' },
  { key: 'modulo_oem_equivalentes', label: 'OEM Equivalentes', descripcion: 'Búsqueda OEM equivalentes (eBay)' },
  { key: 'modulo_catalogo_vehiculos', label: 'Catálogo Vehículos', descripcion: 'Catálogo de marcas, modelos y precios' },
  { key: 'modulo_venta_comercial', label: 'Venta', descripcion: 'Clientes interesados y buscar piezas' },
];

export default function EnvironmentsAdminPage() {
  const router = useRouter();
  const { user, token, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [environments, setEnvironments] = useState<EntornoTrabajo[]>([]);
  const [loading, setLoading] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [newEnvDesc, setNewEnvDesc] = useState('');
  const [expandedEnv, setExpandedEnv] = useState<number | null>(null);
  const [updatingModules, setUpdatingModules] = useState<number | null>(null);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && user && (user.rol === 'sysowner' || user.rol === 'owner')) {
      fetchEnvironments();
    }
  }, [mounted, user]);

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

  if (user.rol !== 'sysowner' && user.rol !== 'owner') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Acceso Denegado</h1>
          <p className="text-gray-600 mt-2">Solo propietarios pueden acceder a esta sección</p>
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

  const fetchEnvironments = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/entornos`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setEnvironments(response.data);
    } catch (error: any) {
      console.error('Error fetching environments:', error);
      toast.error(error.response?.data?.detail || 'Error al cargar entornos');
    }
  };

  const handleCreateEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnvName) {
      toast.error('Ingresa el nombre del entorno');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/entornos`,
        {
          nombre: newEnvName,
          descripcion: newEnvDesc,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      toast.success('Entorno creado exitosamente');
      setNewEnvName('');
      setNewEnvDesc('');
      await fetchEnvironments();
    } catch (error: any) {
      console.error('Error creating environment:', error);
      toast.error(error.response?.data?.detail || 'Error al crear entorno');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEnv = async (envId: number, envNombre: string) => {
    if (!confirm(`¿Estás seguro de eliminar la empresa "${envNombre}"?\n\n⚠️ ATENCIÓN: Esto eliminará también TODOS los usuarios de esta empresa.`)) {
      return;
    }

    try {
      const response = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/entornos/${envId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(response.data.message || 'Empresa eliminada');
      await fetchEnvironments();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al eliminar empresa');
    }
  };

  const handleToggleModule = async (envId: number, moduleKey: string, currentValue: boolean) => {
    setUpdatingModules(envId);
    try {
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/entornos/${envId}/modulos`,
        { [moduleKey]: !currentValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Actualizar el estado local
      setEnvironments(prev => prev.map(env => 
        env.id === envId ? { ...env, [moduleKey]: !currentValue } : env
      ));
      
      toast.success(`Módulo ${!currentValue ? 'activado' : 'desactivado'}`);
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al actualizar módulo');
    } finally {
      setUpdatingModules(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4 cursor-pointer" onClick={() => router.push('/dashboard')}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-white shadow-sm p-1">
                <img src="/logo.png" alt="DesguaPro" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  DesguaPro
                </h1>
                <p className="text-xs text-gray-500">Gestionar Entornos</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.email}</p>
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Create Environment Form */}
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Crear Nuevo Entorno</h2>
          
          <form onSubmit={handleCreateEnv} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nombre</label>
              <input
                type="text"
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                placeholder="Ej: DesguaPro Centro"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
              <textarea
                value={newEnvDesc}
                onChange={(e) => setNewEnvDesc(e.target.value)}
                placeholder="Descripción del entorno..."
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition-colors"
            >
              {loading ? 'Creando...' : 'Crear Entorno'}
            </button>
          </form>
        </div>

        {/* Environments List */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Entornos de Trabajo</h2>
          
          {environments.length > 0 ? (
            <div className="space-y-4">
              {environments.map((env) => (
                <div key={env.id} className="border border-gray-200 rounded-lg overflow-hidden hover:border-blue-300">
                  {/* Header del entorno */}
                  <div className="p-4 bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">{env.nombre}</h3>
                        <p className="text-gray-600 mt-1">{env.descripcion}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          env.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {env.activo ? 'Activo' : 'Inactivo'}
                        </span>
                        <button
                          onClick={() => setExpandedEnv(expandedEnv === env.id ? null : env.id)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Gestionar módulos"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 transition-transform ${expandedEnv === env.id ? 'rotate-180' : ''}`}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteEnv(env.id, env.nombre)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar empresa"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Panel de módulos expandible */}
                  {expandedEnv === env.id && (
                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                      <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        Módulos Activos
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {MODULOS_DISPONIBLES.map((modulo) => {
                          const isActive = env[modulo.key as keyof EntornoTrabajo] as boolean;
                          return (
                            <div 
                              key={modulo.key}
                              className={`flex items-center justify-between p-4 rounded-xl border-2 shadow-sm transition-all ${
                                isActive 
                                  ? 'bg-white border-green-300 shadow-green-100' 
                                  : 'bg-white border-gray-200'
                              }`}
                            >
                              <div className="flex-1 min-w-0 mr-3">
                                <p className={`font-semibold text-sm ${isActive ? 'text-green-700' : 'text-gray-500'}`}>
                                  {modulo.label}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5 truncate">{modulo.descripcion}</p>
                              </div>
                              <button
                                onClick={() => handleToggleModule(env.id, modulo.key, isActive)}
                                disabled={updatingModules === env.id}
                                className={`relative flex-shrink-0 w-14 h-7 rounded-full transition-all duration-200 ${
                                  isActive ? 'bg-green-500' : 'bg-gray-300'
                                } ${updatingModules === env.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}`}
                              >
                                <span 
                                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-200 ${
                                    isActive ? 'left-7' : 'left-0.5'
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600">No hay entornos creados</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

