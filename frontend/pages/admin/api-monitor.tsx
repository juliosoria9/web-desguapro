'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface APILog {
  id: number;
  metodo: string;
  ruta: string;
  status_code: number;
  duracion_ms: number;
  usuario_email: string | null;
  entorno_nombre: string | null;
  rol: string | null;
  ip_address: string | null;
  fecha: string;
}

interface APIStats {
  total_peticiones: number;
  peticiones_hoy: number;
  peticiones_ultima_hora: number;
  tiempo_respuesta_medio: number;
  errores_hoy: number;
  por_entorno: { entorno_id: number; nombre: string; peticiones: number; tiempo_medio: number }[];
  por_ruta: { ruta: string; peticiones: number; tiempo_medio: number }[];
  por_usuario: { email: string; usuario_id: number; peticiones: number }[];
  por_hora: { hora: string; peticiones: number; errores: number }[];
}

interface Entorno {
  id: number;
  nombre: string;
}

export default function APILogsPage() {
  const router = useRouter();
  const { token, user, isAuthenticated, logout } = useAuthStore();
  
  // Estado para logs
  const [logs, setLogs] = useState<APILog[]>([]);
  const [realtimeLogs, setRealtimeLogs] = useState<APILog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [porPagina] = useState(100);
  
  // Estado para estadísticas
  const [stats, setStats] = useState<APIStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  
  // Estado para entornos
  const [entornos, setEntornos] = useState<Entorno[]>([]);
  
  // Filtros
  const [filtroEntorno, setFiltroEntorno] = useState<number | ''>('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroRuta, setFiltroRuta] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  
  // Tiempo real
  const [modoTiempoReal, setModoTiempoReal] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Vista activa
  const [vistaActiva, setVistaActiva] = useState<'logs' | 'stats' | 'entornos'>('stats');
  
  const API_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`;

  // Verificar acceso
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user?.rol !== 'sysowner') {
      toast.error('Acceso denegado - Solo sysowner');
      router.push('/dashboard');
    }
  }, [isAuthenticated, user, router]);

  // Cargar entornos
  useEffect(() => {
    if (user?.rol === 'sysowner') {
      cargarEntornos();
    }
  }, [user]);

  const cargarEntornos = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/api-logs/entornos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEntornos(response.data);
    } catch (error) {
      console.error('Error cargando entornos:', error);
    }
  };

  // Cargar logs
  const cargarLogs = useCallback(async () => {
    if (modoTiempoReal) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('pagina', pagina.toString());
      params.append('por_pagina', porPagina.toString());
      if (filtroEntorno) params.append('entorno_id', filtroEntorno.toString());
      if (filtroUsuario) params.append('usuario_email', filtroUsuario);
      if (filtroRuta) params.append('ruta', filtroRuta);
      if (filtroMetodo) params.append('metodo', filtroMetodo);
      if (filtroStatus) {
        if (filtroStatus === 'error') {
          params.append('status_min', '400');
        } else if (filtroStatus === 'ok') {
          params.append('status_max', '399');
        }
      }
      if (fechaDesde) params.append('desde', fechaDesde);
      if (fechaHasta) params.append('hasta', fechaHasta);

      const response = await axios.get(`${API_URL}/admin/api-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setLogs(response.data.logs);
      setTotal(response.data.total);
    } catch (error: any) {
      if (error.response?.status === 401) {
        logout();
        router.push('/login');
      } else {
        toast.error('Error al cargar logs');
      }
    } finally {
      setLoading(false);
    }
  }, [pagina, filtroEntorno, filtroUsuario, filtroRuta, filtroMetodo, filtroStatus, fechaDesde, fechaHasta, modoTiempoReal, token]);

  // Cargar estadísticas
  const cargarStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const params = new URLSearchParams();
      if (filtroEntorno) params.append('entorno_id', filtroEntorno.toString());
      params.append('horas', '24');
      
      const response = await axios.get(`${API_URL}/admin/api-stats?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setStats(response.data);
    } catch (error: any) {
      console.error('Error cargando stats:', error);
    } finally {
      setLoadingStats(false);
    }
  }, [filtroEntorno, token]);

  // Cargar datos según vista
  useEffect(() => {
    if (user?.rol !== 'sysowner') return;
    
    if (vistaActiva === 'logs') {
      cargarLogs();
    } else if (vistaActiva === 'stats' || vistaActiva === 'entornos') {
      cargarStats();
    }
  }, [vistaActiva, cargarLogs, cargarStats, user]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh && !modoTiempoReal) {
      refreshIntervalRef.current = setInterval(() => {
        if (vistaActiva === 'logs') {
          cargarLogs();
        } else {
          cargarStats();
        }
      }, 5000);
    }
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh, modoTiempoReal, vistaActiva, cargarLogs, cargarStats]);

  // Tiempo real con polling (más robusto que SSE)
  useEffect(() => {
    if (modoTiempoReal && user?.rol === 'sysowner') {
      let lastId = 0;
      
      const fetchNewLogs = async () => {
        try {
          const params = new URLSearchParams();
          params.append('pagina', '1');
          params.append('por_pagina', '50');
          
          const response = await axios.get(`${API_URL}/admin/api-logs?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          const newLogs = response.data.logs;
          if (newLogs.length > 0) {
            // Encontrar logs nuevos (id mayor que lastId)
            const latestLogs = lastId > 0 
              ? newLogs.filter((log: APILog) => log.id > lastId)
              : newLogs;
            
            if (latestLogs.length > 0) {
              setRealtimeLogs(prev => {
                const combined = [...latestLogs, ...prev].slice(0, 200);
                return combined;
              });
              lastId = Math.max(...newLogs.map((l: APILog) => l.id));
            }
          }
        } catch (error) {
          console.error('Error fetching realtime logs:', error);
        }
      };
      
      // Fetch inicial
      fetchNewLogs();
      
      // Polling cada 2 segundos
      const interval = setInterval(fetchNewLogs, 2000);
      
      return () => {
        clearInterval(interval);
      };
    }
  }, [modoTiempoReal, user, token]);

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusColor = (status: number) => {
    if (status >= 500) return 'bg-red-100 text-red-800';
    if (status >= 400) return 'bg-orange-100 text-orange-800';
    if (status >= 300) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const getMetodoColor = (metodo: string) => {
    const colors: Record<string, string> = {
      'GET': 'bg-blue-100 text-blue-800',
      'POST': 'bg-green-100 text-green-800',
      'PUT': 'bg-yellow-100 text-yellow-800',
      'DELETE': 'bg-red-100 text-red-800',
      'PATCH': 'bg-purple-100 text-purple-800',
    };
    return colors[metodo] || 'bg-gray-100 text-gray-800';
  };

  const totalPaginas = Math.ceil(total / porPagina);
  const logsToShow = modoTiempoReal ? realtimeLogs : logs;

  if (user?.rol !== 'sysowner') {
    return null;
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
                <p className="text-xs text-gray-500">Monitor de API</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Indicador tiempo real */}
              {modoTiempoReal && (
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <span className="text-sm text-green-600 font-medium">EN VIVO</span>
                </div>
              )}
              
              <span className="text-sm bg-red-100 text-red-800 px-2 py-1 rounded">SYSOWNER</span>
              <button
                onClick={() => router.push('/dashboard')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs de navegación */}
        <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setVistaActiva('stats')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              vistaActiva === 'stats' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Estadísticas
          </button>
          <button
            onClick={() => setVistaActiva('entornos')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              vistaActiva === 'entornos' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Por Empresa
          </button>
          <button
            onClick={() => setVistaActiva('logs')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              vistaActiva === 'logs' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Logs Detallados
          </button>
        </div>

        {/* ============= VISTA: ESTADÍSTICAS ============= */}
        {vistaActiva === 'stats' && (
          <div className="space-y-6">
            {/* Controles */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Dashboard de Actividad API</h2>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span className="text-sm text-gray-600">Auto-actualizar (5s)</span>
                </label>
                <button
                  onClick={cargarStats}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar
                </button>
              </div>
            </div>

            {/* Tarjetas de métricas */}
            {loadingStats ? (
              <div className="text-center py-8 text-gray-500">Cargando estadísticas...</div>
            ) : stats && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-500">Total Peticiones</div>
                    <div className="text-2xl font-bold text-gray-900">{stats.total_peticiones.toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-500">Hoy</div>
                    <div className="text-2xl font-bold text-blue-600">{stats.peticiones_hoy.toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-500">Última Hora</div>
                    <div className="text-2xl font-bold text-green-600">{stats.peticiones_ultima_hora.toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-500">Tiempo Medio</div>
                    <div className="text-2xl font-bold text-purple-600">{stats.tiempo_respuesta_medio.toFixed(1)} ms</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-500">Errores Hoy</div>
                    <div className={`text-2xl font-bold ${stats.errores_hoy > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {stats.errores_hoy}
                    </div>
                  </div>
                </div>

                {/* Gráfico de actividad por hora */}
                <div className="bg-white rounded-lg shadow p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Actividad últimas 24 horas</h3>
                  <div className="h-40 flex items-end space-x-1">
                    {stats.por_hora.map((h, i) => {
                      const maxPeticiones = Math.max(...stats.por_hora.map(x => x.peticiones), 1);
                      const altura = (h.peticiones / maxPeticiones) * 100;
                      const horaStr = h.hora.split(' ')[1] || h.hora;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center group">
                          <div className="relative w-full">
                            <div 
                              className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                              style={{ height: `${Math.max(altura, 2)}px` }}
                            />
                            {h.errores > 0 && (
                              <div 
                                className="absolute bottom-0 w-full bg-red-500 rounded-t"
                                style={{ height: `${(h.errores / maxPeticiones) * 100}px` }}
                              />
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 mt-1 opacity-0 group-hover:opacity-100">
                            {horaStr}
                          </span>
                          <div className="hidden group-hover:block absolute bg-gray-800 text-white text-xs p-2 rounded -mt-16">
                            {h.peticiones} peticiones, {h.errores} errores
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Rutas */}
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Endpoints</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {stats.por_ruta.map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 truncate flex-1 mr-2 font-mono text-xs">{r.ruta}</span>
                          <div className="flex items-center space-x-3">
                            <span className="text-gray-400 text-xs">{r.tiempo_medio}ms</span>
                            <span className="font-medium text-gray-900 w-16 text-right">{r.peticiones}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Usuarios */}
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Usuarios</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {stats.por_usuario.map((u, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 truncate flex-1 mr-2">{u.email}</span>
                          <span className="font-medium text-gray-900">{u.peticiones} peticiones</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ============= VISTA: POR EMPRESA ============= */}
        {vistaActiva === 'entornos' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Carga por Empresa</h2>
            
            {loadingStats ? (
              <div className="text-center py-8 text-gray-500">Cargando datos...</div>
            ) : stats && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empresa</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Peticiones (24h)</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tiempo Medio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carga</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.por_entorno.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          No hay datos de actividad por empresa
                        </td>
                      </tr>
                    ) : (
                      stats.por_entorno.map((e, i) => {
                        const maxPeticiones = Math.max(...stats.por_entorno.map(x => x.peticiones), 1);
                        const porcentaje = (e.peticiones / maxPeticiones) * 100;
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{e.nombre}</div>
                              <div className="text-xs text-gray-500">ID: {e.entorno_id}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {e.peticiones.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {e.tiempo_medio.toFixed(1)} ms
                            </td>
                            <td className="px-4 py-3 w-48">
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${
                                    porcentaje > 80 ? 'bg-red-500' : 
                                    porcentaje > 50 ? 'bg-yellow-500' : 'bg-green-500'
                                  }`}
                                  style={{ width: `${porcentaje}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => {
                                  setFiltroEntorno(e.entorno_id);
                                  setVistaActiva('logs');
                                }}
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                Ver logs
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ============= VISTA: LOGS DETALLADOS ============= */}
        {vistaActiva === 'logs' && (
          <div className="space-y-4">
            {/* Controles de tiempo real */}
            <div className="flex items-center justify-between bg-white rounded-lg shadow p-4">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modoTiempoReal}
                    onChange={(e) => {
                      setModoTiempoReal(e.target.checked);
                      if (e.target.checked) {
                        setRealtimeLogs([]);
                      }
                    }}
                    className="rounded text-green-600"
                  />
                  <span className="text-sm font-medium text-gray-700">Tiempo Real</span>
                </label>
                
                {!modoTiempoReal && (
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-600">Auto-actualizar (5s)</span>
                  </label>
                )}
              </div>
              
              <div className="text-sm text-gray-500">
                {modoTiempoReal 
                  ? `${realtimeLogs.length} logs en vivo`
                  : `Total: ${total.toLocaleString()} registros`
                }
              </div>
            </div>

            {/* Filtros */}
            {!modoTiempoReal && (
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Filtros</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Empresa</label>
                    <select
                      value={filtroEntorno}
                      onChange={(e) => { setFiltroEntorno(e.target.value ? Number(e.target.value) : ''); setPagina(1); }}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">Todas</option>
                      {entornos.map(e => (
                        <option key={e.id} value={e.id}>{e.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Usuario</label>
                    <input
                      type="text"
                      value={filtroUsuario}
                      onChange={(e) => { setFiltroUsuario(e.target.value); setPagina(1); }}
                      placeholder="email..."
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Ruta</label>
                    <input
                      type="text"
                      value={filtroRuta}
                      onChange={(e) => { setFiltroRuta(e.target.value); setPagina(1); }}
                      placeholder="/api/v1/..."
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Método</label>
                    <select
                      value={filtroMetodo}
                      onChange={(e) => { setFiltroMetodo(e.target.value); setPagina(1); }}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">Todos</option>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Status</label>
                    <select
                      value={filtroStatus}
                      onChange={(e) => { setFiltroStatus(e.target.value); setPagina(1); }}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">Todos</option>
                      <option value="ok">OK (2xx-3xx)</option>
                      <option value="error">Errores (4xx-5xx)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Desde</label>
                    <input
                      type="date"
                      value={fechaDesde}
                      onChange={(e) => { setFechaDesde(e.target.value); setPagina(1); }}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                    <input
                      type="date"
                      value={fechaHasta}
                      onChange={(e) => { setFechaHasta(e.target.value); setPagina(1); }}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => {
                      setFiltroEntorno('');
                      setFiltroUsuario('');
                      setFiltroRuta('');
                      setFiltroMetodo('');
                      setFiltroStatus('');
                      setFechaDesde('');
                      setFechaHasta('');
                      setPagina(1);
                    }}
                    className="text-sm text-gray-600 hover:text-gray-800"
                  >
                    Limpiar filtros
                  </button>
                </div>
              </div>
            )}

            {/* Tabla de logs */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              {loading && !modoTiempoReal ? (
                <div className="p-8 text-center text-gray-500">Cargando logs...</div>
              ) : logsToShow.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  {modoTiempoReal ? 'Esperando peticiones...' : 'No se encontraron logs'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Método</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ruta</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tiempo</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Empresa</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {logsToShow.map((log, idx) => (
                        <tr key={modoTiempoReal ? `rt-${idx}` : log.id} className={`hover:bg-gray-50 ${modoTiempoReal && idx === 0 ? 'bg-green-50' : ''}`}>
                          <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap font-mono">
                            {formatFecha(log.fecha)}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded ${getMetodoColor(log.metodo)}`}>
                              {log.metodo}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 font-mono max-w-xs truncate" title={log.ruta}>
                            {log.ruta}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded ${getStatusColor(log.status_code)}`}>
                              {log.status_code}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                            <span className={log.duracion_ms > 1000 ? 'text-red-600 font-medium' : ''}>
                              {log.duracion_ms.toFixed(1)} ms
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[150px]" title={log.usuario_email || ''}>
                            {log.usuario_email || <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[120px]" title={log.entorno_nombre || ''}>
                            {log.entorno_nombre || <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 font-mono">
                            {log.ip_address || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Paginación */}
              {!modoTiempoReal && totalPaginas > 1 && (
                <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t">
                  <div className="text-sm text-gray-500">
                    Página {pagina} de {totalPaginas}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPagina(1)}
                      disabled={pagina === 1}
                      className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                      Primera
                    </button>
                    <button
                      onClick={() => setPagina(p => Math.max(1, p - 1))}
                      disabled={pagina === 1}
                      className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                      disabled={pagina === totalPaginas}
                      className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                      Siguiente
                    </button>
                    <button
                      onClick={() => setPagina(totalPaginas)}
                      disabled={pagina === totalPaginas}
                      className="px-2 py-1 text-xs border rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                      Última
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
