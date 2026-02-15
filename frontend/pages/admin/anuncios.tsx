'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Anuncio {
  id: number;
  titulo: string;
  contenido: string;
  version: string | null;
  tipo: string;
  activo: boolean;
  mostrar_popup: boolean;
  creado_por_email: string | null;
  fecha_creacion: string;
}

const TIPOS_ANUNCIO = [
  { value: 'changelog', label: '📋 Changelog', color: 'bg-blue-100 text-blue-800' },
  { value: 'anuncio', label: '📢 Anuncio', color: 'bg-green-100 text-green-800' },
  { value: 'mantenimiento', label: '🔧 Mantenimiento', color: 'bg-orange-100 text-orange-800' },
];

export default function AnunciosAdminPage() {
  const router = useRouter();
  const { user, token, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Formulario
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [version, setVersion] = useState('');
  const [tipo, setTipo] = useState('changelog');
  const [mostrarPopup, setMostrarPopup] = useState(true);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && user?.rol === 'sysowner') {
      fetchAnuncios();
    }
  }, [mounted, user]);

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (user.rol !== 'sysowner') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Acceso Denegado</h1>
          <p className="text-gray-600 mt-2">Solo el administrador del sistema puede acceder</p>
          <button onClick={() => router.push('/dashboard')} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg">
            Volver
          </button>
        </div>
      </div>
    );
  }

  const fetchAnuncios = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/anuncios/admin/todos`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAnuncios(response.data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar anuncios');
    }
  };

  const resetForm = () => {
    setTitulo('');
    setContenido('');
    setVersion('');
    setTipo('changelog');
    setMostrarPopup(true);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (anuncio: Anuncio) => {
    setTitulo(anuncio.titulo);
    setContenido(anuncio.contenido);
    setVersion(anuncio.version || '');
    setTipo(anuncio.tipo);
    setMostrarPopup(anuncio.mostrar_popup);
    setEditingId(anuncio.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !contenido.trim()) {
      toast.error('Título y contenido son obligatorios');
      return;
    }

    setLoading(true);
    try {
      const data = {
        titulo: titulo.trim(),
        contenido: contenido.trim(),
        version: version.trim() || null,
        tipo,
        mostrar_popup: mostrarPopup,
      };

      if (editingId) {
        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/anuncios/${editingId}`,
          data,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Anuncio actualizado');
      } else {
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/anuncios/crear`,
          data,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Anuncio creado');
      }

      resetForm();
      await fetchAnuncios();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActivo = async (anuncio: Anuncio) => {
    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/anuncios/${anuncio.id}`,
        { activo: !anuncio.activo },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(anuncio.activo ? 'Anuncio desactivado' : 'Anuncio activado');
      await fetchAnuncios();
    } catch (error) {
      toast.error('Error al cambiar estado');
    }
  };

  const handleDelete = async (anuncio: Anuncio) => {
    if (!confirm(`¿Eliminar el anuncio "${anuncio.titulo}"?`)) return;
    
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/anuncios/${anuncio.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Anuncio eliminado');
      await fetchAnuncios();
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  const getTipoConfig = (tipoValue: string) => {
    return TIPOS_ANUNCIO.find(t => t.value === tipoValue) || TIPOS_ANUNCIO[0];
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
                <h1 className="text-xl font-bold text-gray-900">DesguaPro</h1>
                <p className="text-xs text-gray-500">Gestión de Anuncios</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button onClick={() => { logout(); router.push('/login'); }} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg">
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">📢 Anuncios y Changelog</h2>
            <p className="text-gray-600">Gestiona los anuncios que verán los usuarios al iniciar sesión</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nuevo Anuncio
          </button>
        </div>

        {/* Formulario */}
        {showForm && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {editingId ? '✏️ Editar Anuncio' : '➕ Nuevo Anuncio'}
              </h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                  <input
                    type="text"
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ej: Nueva versión 1.7 disponible"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Versión</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="Ej: 1.7.0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contenido * (soporta Markdown)</label>
                <textarea
                  value={contenido}
                  onChange={(e) => setContenido(e.target.value)}
                  placeholder="### Novedades&#10;- Nueva función de fichadas&#10;- Mejoras de rendimiento&#10;&#10;### Correcciones&#10;- Solucionado error en login"
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {TIPOS_ANUNCIO.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mostrarPopup}
                      onChange={(e) => setMostrarPopup(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ms-3 text-sm font-medium text-gray-700">Mostrar como popup</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={resetForm} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear Anuncio')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de anuncios */}
        <div className="space-y-4">
          {anuncios.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-12 text-center">
              <div className="text-6xl mb-4">📭</div>
              <p className="text-gray-500 text-lg">No hay anuncios creados</p>
              <p className="text-gray-400">Crea el primer anuncio para que los usuarios lo vean al iniciar sesión</p>
            </div>
          ) : (
            anuncios.map(anuncio => {
              const tipoConfig = getTipoConfig(anuncio.tipo);
              return (
                <div
                  key={anuncio.id}
                  className={`bg-white rounded-2xl shadow-lg overflow-hidden border-l-4 ${anuncio.activo ? 'border-green-500' : 'border-gray-300 opacity-60'}`}
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${tipoConfig.color}`}>
                          {tipoConfig.label}
                        </span>
                        {anuncio.version && (
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            v{anuncio.version}
                          </span>
                        )}
                        {anuncio.mostrar_popup && (
                          <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">
                            🔔 Popup
                          </span>
                        )}
                        {!anuncio.activo && (
                          <span className="px-2 py-1 rounded text-xs bg-gray-200 text-gray-600">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleActivo(anuncio)}
                          className={`p-2 rounded-lg transition-colors ${anuncio.activo ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                          title={anuncio.activo ? 'Desactivar' : 'Activar'}
                        >
                          {anuncio.activo ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleEdit(anuncio)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Editar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(anuncio)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Eliminar"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-gray-900 mb-2">{anuncio.titulo}</h3>
                    
                    <div className="bg-gray-50 rounded-lg p-4 mb-3 max-h-40 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{anuncio.contenido}</pre>
                    </div>

                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Creado por: {anuncio.creado_por_email || 'Sistema'}</span>
                      <span>{new Date(anuncio.fecha_creacion).toLocaleString('es-ES')}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
