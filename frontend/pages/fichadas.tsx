'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface FichadaDetalle {
  id: number;
  id_pieza: string;
  descripcion: string | null;
  comentario: string | null;
  hora: string;
  minutos_desde_anterior: number | null;
  color: string;
  en_stock: boolean | null;  // null=no verificado, true=entró, false=no entró
}

interface MiFichada {
  id: number;
  id_pieza: string;
  descripcion: string | null;
  fecha_fichada: string;
  usuario_email: string;
}

interface ResumenUsuario {
  usuario_id: number;
  usuario_email: string;
  usuario_nombre: string | null;
  total_fichadas: number;
  primera_fichada: string | null;
  ultima_fichada: string | null;
}

interface ResumenDia {
  fecha: string;
  usuarios: ResumenUsuario[];
  total_general: number;
}

interface DetalleFichadas {
  usuario_email: string;
  fecha: string;
  fichadas: FichadaDetalle[];
  total: number;
}

interface ResumenEquipoItem {
  usuario_nombre: string | null;
  usuario_email: string;
  total_fichadas: number;
}

interface ResumenEquipo {
  fecha: string;
  usuarios: ResumenEquipoItem[];
  total_general: number;
}

const COLORES_TIEMPO: { [key: string]: string } = {
  gray: 'bg-gray-100 border-gray-300 text-gray-700',
  green: 'bg-green-100 border-green-300 text-green-700',
  yellow: 'bg-yellow-100 border-yellow-300 text-yellow-700',
  orange: 'bg-orange-100 border-orange-300 text-orange-700',
  red: 'bg-red-100 border-red-300 text-red-700',
};

export default function FichadasPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  
  // Estado para empresas (sysowner)
  const [empresas, setEmpresas] = useState<{id: number, nombre: string}[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
  
  // Estado para resumen
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  
  // Estado para detalle
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<DetalleFichadas | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Estado para mis fichadas (usuarios normales)
  const [misFichadas, setMisFichadas] = useState<MiFichada[]>([]);
  const [cargandoMisFichadas, setCargandoMisFichadas] = useState(false);

  // Estado para resumen del equipo (usuarios normales)
  const [resumenEquipo, setResumenEquipo] = useState<ResumenEquipo | null>(null);

  // Estado para borrar
  const [borrando, setBorrando] = useState<number | null>(null);

  // Estado para comentarios
  const [editandoComentario, setEditandoComentario] = useState<number | null>(null);
  const [comentarioTemp, setComentarioTemp] = useState<string>('');
  const [guardandoComentario, setGuardandoComentario] = useState(false);

  const esAdmin = user?.rol && ['admin', 'owner', 'sysowner'].includes(user.rol);
  const esSysowner = user?.rol === 'sysowner';

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  // Cargar empresas para sysowner
  useEffect(() => {
    if (mounted && user && esSysowner) {
      fetchEmpresas();
    }
  }, [mounted, user]);

  // Cargar datos cuando cambie la empresa seleccionada o la fecha
  useEffect(() => {
    if (mounted && user) {
      const esAdminActual = user?.rol && ['admin', 'owner', 'sysowner'].includes(user.rol);
      if (esAdminActual) {
        // sysowner necesita empresa seleccionada
        if (esSysowner && !selectedEmpresa) return;
        cargarResumen();
      } else {
        cargarMisFichadas();
        cargarResumenEquipo();
      }
    }
  }, [mounted, fechaFiltro, user, selectedEmpresa]);

  const fetchEmpresas = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/entornos`,
        { withCredentials: true }
      );
      setEmpresas(response.data || []);
    } catch (error) {
      console.error('Error fetching empresas:', error);
    }
  };

  const cargarResumen = async () => {
    setCargandoResumen(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/fichadas/resumen-dia?fecha=${fechaFiltro}`;
      if (esSysowner && selectedEmpresa) {
        url += `&entorno_id=${selectedEmpresa}`;
      }
      const response = await axios.get<ResumenDia>(
        url,
        { withCredentials: true }
      );
      setResumen(response.data);
    } catch (error) {
      console.error('Error cargando resumen:', error);
    } finally {
      setCargandoResumen(false);
    }
  };

  const cargarMisFichadas = async () => {
    setCargandoMisFichadas(true);
    try {
      const response = await axios.get<MiFichada[]>(
        `${process.env.NEXT_PUBLIC_API_URL}/fichadas/mis-fichadas?fecha=${fechaFiltro}&limite=100`,
        { withCredentials: true }
      );
      setMisFichadas(response.data);
    } catch (error) {
      console.error('Error cargando mis fichadas:', error);
    } finally {
      setCargandoMisFichadas(false);
    }
  };

  const cargarResumenEquipo = async () => {
    try {
      const response = await axios.get<ResumenEquipo>(
        `${process.env.NEXT_PUBLIC_API_URL}/fichadas/resumen-equipo?fecha=${fechaFiltro}`,
        { withCredentials: true }
      );
      setResumenEquipo(response.data);
    } catch (error) {
      console.error('Error cargando resumen equipo:', error);
    }
  };

  const verDetalle = async (usuarioId: number) => {
    if (usuarioSeleccionado === usuarioId) {
      setUsuarioSeleccionado(null);
      setDetalle(null);
      return;
    }
    
    setUsuarioSeleccionado(usuarioId);
    setCargandoDetalle(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/fichadas/detalle-usuario/${usuarioId}?fecha=${fechaFiltro}`;
      if (esSysowner && selectedEmpresa) {
        url += `&entorno_id=${selectedEmpresa}`;
      }
      const response = await axios.get<DetalleFichadas>(
        url,
        { withCredentials: true }
      );
      setDetalle(response.data);
    } catch (error) {
      console.error('Error cargando detalle:', error);
      toast.error('Error al cargar detalle');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const borrarFichada = async (fichadaId: number, esDeHoy: boolean) => {
    // Si no es admin y no es de hoy, no puede borrar
    if (!esAdmin && !esDeHoy) {
      toast.error('Solo puedes borrar fichadas del día actual');
      return;
    }

    if (!confirm('¿Estás seguro de que deseas borrar esta fichada?')) {
      return;
    }

    setBorrando(fichadaId);
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/fichadas/borrar/${fichadaId}`,
        { withCredentials: true }
      );
      toast.success('Fichada eliminada correctamente');
      
      // Recargar datos
      if (esAdmin) {
        cargarResumen();
        if (usuarioSeleccionado) {
          // Recargar detalle del usuario actual
          const response = await axios.get<DetalleFichadas>(
            `${process.env.NEXT_PUBLIC_API_URL}/fichadas/detalle-usuario/${usuarioSeleccionado}?fecha=${fechaFiltro}`,
            { withCredentials: true }
          );
          setDetalle(response.data);
        }
      } else {
        cargarMisFichadas();
      }
    } catch (error: any) {
      console.error('Error borrando fichada:', error);
      toast.error(error.response?.data?.detail || 'Error al borrar fichada');
    } finally {
      setBorrando(null);
    }
  };

  const guardarComentario = async (fichadaId: number) => {
    setGuardandoComentario(true);
    try {
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/fichadas/comentario/${fichadaId}`,
        { comentario: comentarioTemp || null },
        { withCredentials: true }
      );
      toast.success('Comentario guardado');
      
      // Actualizar el detalle local
      if (detalle) {
        setDetalle({
          ...detalle,
          fichadas: detalle.fichadas.map(f => 
            f.id === fichadaId ? { ...f, comentario: comentarioTemp || null } : f
          )
        });
      }
      
      setEditandoComentario(null);
      setComentarioTemp('');
    } catch (error: any) {
      console.error('Error guardando comentario:', error);
      toast.error(error.response?.data?.detail || 'Error al guardar comentario');
    } finally {
      setGuardandoComentario(false);
    }
  };

  const iniciarEdicionComentario = (fichada: FichadaDetalle) => {
    setEditandoComentario(fichada.id);
    setComentarioTemp(fichada.comentario || '');
  };

  const cancelarEdicionComentario = () => {
    setEditandoComentario(null);
    setComentarioTemp('');
  };

  const esFechaHoy = (fechaStr: string) => {
    const hoy = new Date().toISOString().split('T')[0];
    return fechaStr.startsWith(hoy);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

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
                <p className="text-xs text-gray-500">Fichadas de Piezas</p>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Selector de empresa para sysowner */}
        {esSysowner && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Empresa:</label>
              <select
                value={selectedEmpresa || ''}
                onChange={(e) => {
                  setSelectedEmpresa(e.target.value ? Number(e.target.value) : null);
                  setUsuarioSeleccionado(null);
                  setDetalle(null);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">-- Selecciona una empresa --</option>
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Piezas fichadas */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {esAdmin ? 'Piezas Fichadas - Todos los usuarios' : 'Mis Piezas Fichadas'}
              </h2>
              <button
                onClick={() => router.push('/escaner')}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
                title="Escanear código de barras"
              >
                <span>📱</span>
                <span className="hidden sm:inline">Escáner</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Fecha:</label>
              <input
                type="date"
                value={fechaFiltro}
                onChange={(e) => setFechaFiltro(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                onClick={() => setFechaFiltro(new Date().toISOString().split('T')[0])}
                className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Hoy
              </button>
            </div>
          </div>

          {/* Leyenda de colores (solo para admins) */}
          {esAdmin && (
            <div className="flex flex-wrap gap-4 mb-4 text-xs">
              <span className="text-gray-500">Tiempo entre piezas:</span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-500"></span> 0-5 min
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-yellow-500"></span> 5-15 min
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-orange-500"></span> 15-30 min
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-500"></span> +30 min
              </span>
            </div>
          )}

          {/* Vista para usuarios normales - Mis Fichadas */}
          {!esAdmin && (
            <>
              {cargandoMisFichadas ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : misFichadas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No tienes fichadas para esta fecha
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-3 py-2 bg-gray-50 rounded">
                    <div className="col-span-1">#</div>
                    <div className="col-span-3">Hora</div>
                    <div className="col-span-4">ID Pieza</div>
                    <div className="col-span-3">Descripción</div>
                    <div className="col-span-1 text-center">Acción</div>
                  </div>
                  
                  {misFichadas.map((fichada, idx) => {
                    const esDeHoy = esFechaHoy(fichada.fecha_fichada);
                    return (
                      <div 
                        key={fichada.id}
                        className="grid grid-cols-12 gap-2 items-center px-3 py-3 rounded border bg-white border-gray-200 hover:bg-gray-50"
                      >
                        <div className="col-span-1 text-xs text-gray-500">#{idx + 1}</div>
                        <div className="col-span-3 font-mono text-sm">
                          {new Date(fichada.fecha_fichada).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        <div className="col-span-4 font-mono font-medium text-gray-900">{fichada.id_pieza}</div>
                        <div className="col-span-3 text-sm text-gray-600 truncate">{fichada.descripcion || '-'}</div>
                        <div className="col-span-1 text-center">
                          {esDeHoy ? (
                            <button
                              onClick={() => borrarFichada(fichada.id, esDeHoy)}
                              disabled={borrando === fichada.id}
                              className="text-red-600 hover:text-red-800 disabled:opacity-50"
                              title="Borrar fichada"
                            >
                              {borrando === fichada.id ? (
                                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                </svg>
                              )}
                            </button>
                          ) : (
                            <span title="Solo puedes borrar fichadas del día actual">
                              <svg className="h-5 w-5 text-gray-300 cursor-not-allowed" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                              </svg>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Total */}
                  <div className="pt-3 mt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center px-3">
                      <span className="font-medium text-gray-700">Total del día:</span>
                      <span className="text-lg font-bold text-blue-600">{misFichadas.length} fichadas</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen del equipo */}
              {resumenEquipo && resumenEquipo.usuarios.length > 0 && (
                <div className="mt-6 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg border border-teal-200 p-4">
                  <h3 className="text-sm font-semibold text-teal-800 mb-3 flex items-center gap-2">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                    </svg>
                    Fichadas del equipo - {fechaFiltro === new Date().toISOString().split('T')[0] ? 'Hoy' : fechaFiltro}
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {resumenEquipo.usuarios.map((u) => (
                      <div 
                        key={u.usuario_email}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                          u.usuario_email === user?.email 
                            ? 'bg-teal-100 border-teal-400' 
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <span className="text-sm text-gray-700">
                          {u.usuario_nombre || u.usuario_email.split('@')[0]}
                        </span>
                        <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-sm font-bold ${
                          u.usuario_email === user?.email 
                            ? 'bg-teal-600 text-white' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {u.total_fichadas}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-teal-200 flex justify-between items-center text-sm">
                    <span className="text-teal-700">Total del equipo:</span>
                    <span className="font-bold text-teal-800">{resumenEquipo.total_general} fichadas</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Vista para admins - Resumen de todos */}
          {esAdmin && (
            <>
              {cargandoResumen ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : resumen ? (
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-3 py-2 bg-gray-50 rounded">
                <div className="col-span-3">Usuario</div>
                <div className="col-span-2 text-center">Fichadas</div>
                <div className="col-span-2 text-center">Primera</div>
                <div className="col-span-2 text-center">Última</div>
                <div className="col-span-1 text-center">Informe</div>
                <div className="col-span-2 text-center">Acción</div>
              </div>
              
              {resumen.usuarios.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No hay fichadas para esta fecha
                </div>
              ) : (
                resumen.usuarios.map((usuario) => (
                  <div key={usuario.usuario_id}>
                    <div 
                      className={`grid grid-cols-12 gap-2 items-center px-3 py-3 rounded border cursor-pointer transition-colors ${
                        usuarioSeleccionado === usuario.usuario_id 
                          ? 'bg-blue-50 border-blue-300' 
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => verDetalle(usuario.usuario_id)}
                    >
                      <div className="col-span-3">
                        <p className="font-medium text-gray-900">{usuario.usuario_nombre || usuario.usuario_email}</p>
                        {usuario.usuario_nombre && (
                          <p className="text-xs text-gray-500">{usuario.usuario_email}</p>
                        )}
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold ${
                          usuario.total_fichadas > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {usuario.total_fichadas}
                        </span>
                      </div>
                      <div className="col-span-2 text-center text-sm text-gray-600">
                        {usuario.primera_fichada || '-'}
                      </div>
                      <div className="col-span-2 text-center text-sm text-gray-600">
                        {usuario.ultima_fichada || '-'}
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = esSysowner && selectedEmpresa 
                              ? `/informe-fichadas/${usuario.usuario_id}?entorno=${selectedEmpresa}`
                              : `/informe-fichadas/${usuario.usuario_id}`;
                            router.push(url);
                          }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600 hover:bg-purple-200 transition-colors"
                          title="Ver informe de rendimiento"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </button>
                      </div>
                      <div className="col-span-2 text-center">
                        {usuario.total_fichadas > 0 && (
                          <button className="text-sm text-blue-600 hover:underline">
                            {usuarioSeleccionado === usuario.usuario_id ? 'Ocultar' : 'Ver detalle'}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Detalle expandido */}
                    {usuarioSeleccionado === usuario.usuario_id && detalle && (
                      <div className="ml-4 mt-2 mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        {cargandoDetalle ? (
                          <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-700 mb-3">
                              Desglose de {detalle.total} fichadas:
                            </div>
                            <div className="grid gap-2">
                              {detalle.fichadas.map((fichada, idx) => (
                                <div key={fichada.id} className="space-y-1">
                                  <div 
                                    className={`flex items-center gap-3 px-3 py-2 rounded border ${COLORES_TIEMPO[fichada.color]}`}
                                  >
                                    <span className="text-xs text-gray-500 w-6">#{idx + 1}</span>
                                    <span className="font-mono font-medium">{fichada.hora}</span>
                                    <span className="font-mono text-sm flex-1">{fichada.id_pieza}</span>
                                    {/* Indicador de stock */}
                                    <span className="w-6 text-center" title={
                                      fichada.en_stock === null 
                                        ? 'Pendiente de verificación' 
                                        : fichada.en_stock 
                                          ? 'Pieza encontrada en stock' 
                                          : 'Pieza no encontrada en stock'
                                    }>
                                      {fichada.en_stock === null ? (
                                        <span className="text-gray-400">-</span>
                                      ) : fichada.en_stock ? (
                                        <span className="text-green-600 font-bold">✓</span>
                                      ) : (
                                        <span className="text-red-600 font-bold">✗</span>
                                      )}
                                    </span>
                                    {fichada.minutos_desde_anterior !== null && (
                                      <span className="text-xs">
                                        +{fichada.minutos_desde_anterior} min
                                      </span>
                                    )}
                                    {/* Botón comentario */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (editandoComentario === fichada.id) {
                                          cancelarEdicionComentario();
                                        } else {
                                          iniciarEdicionComentario(fichada);
                                        }
                                      }}
                                      className={`${fichada.comentario ? 'text-blue-600' : 'text-gray-400'} hover:text-blue-800`}
                                      title={fichada.comentario || 'Añadir comentario'}
                                    >
                                      <svg className="h-5 w-5" fill={fichada.comentario ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                      </svg>
                                    </button>
                                    {/* Botón borrar para admins */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        borrarFichada(fichada.id, true);
                                      }}
                                      disabled={borrando === fichada.id}
                                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                      title="Borrar fichada"
                                    >
                                      {borrando === fichada.id ? (
                                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                      ) : (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                  
                                  {/* Mostrar comentario existente */}
                                  {fichada.comentario && editandoComentario !== fichada.id && (
                                    <div className="ml-8 px-3 py-1 text-sm text-gray-600 bg-blue-50 rounded border border-blue-200 flex items-center gap-2">
                                      <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                      </svg>
                                      <span className="flex-1">{fichada.comentario}</span>
                                    </div>
                                  )}
                                  
                                  {/* Editor de comentario */}
                                  {editandoComentario === fichada.id && (
                                    <div className="ml-8 flex gap-2">
                                      <input
                                        type="text"
                                        value={comentarioTemp}
                                        onChange={(e) => setComentarioTemp(e.target.value)}
                                        placeholder="Escribe un comentario..."
                                        className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            guardarComentario(fichada.id);
                                          } else if (e.key === 'Escape') {
                                            cancelarEdicionComentario();
                                          }
                                        }}
                                      />
                                      <button
                                        onClick={() => guardarComentario(fichada.id)}
                                        disabled={guardandoComentario}
                                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                                      >
                                        {guardandoComentario ? '...' : 'Guardar'}
                                      </button>
                                      <button
                                        onClick={cancelarEdicionComentario}
                                        className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
              
              {/* Total */}
              {resumen.total_general > 0 && (
                <div className="pt-3 mt-3 border-t border-gray-200">
                  <div className="flex justify-between items-center px-3">
                    <span className="font-medium text-gray-700">Total del día:</span>
                    <span className="text-lg font-bold text-blue-600">{resumen.total_general} fichadas</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Error al cargar datos
            </div>
          )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
