'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface AuditLog {
  id: number;
  usuario_email: string | null;
  accion: string;
  entidad: string;
  descripcion: string;
  ip_address: string | null;
  fecha: string;
}

interface Backup {
  id: number;
  filename: string;
  size_mb: number;
  tipo: string;
  exitoso: boolean;
  mensaje: string | null;
  fecha: string | null;
  existe: boolean;
}

interface EstadisticasBackup {
  total_backups: number;
  exitosos: number;
  fallidos: number;
  espacio_usado_mb: number;
  ultimo_backup: string | null;
  ultimo_filename: string | null;
}

// Iconos SVG
const ShieldIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const DatabaseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const COLORES_ACCION: { [key: string]: string } = {
  LOGIN: 'bg-green-100 text-green-800',
  LOGOUT: 'bg-gray-100 text-gray-800',
  LOGIN_FAILED: 'bg-red-100 text-red-800',
  CREATE: 'bg-blue-100 text-blue-800',
  UPDATE: 'bg-yellow-100 text-yellow-800',
  DELETE: 'bg-red-100 text-red-800',
  SEARCH: 'bg-purple-100 text-purple-800',
  BACKUP: 'bg-indigo-100 text-indigo-800',
  BACKUP_FAILED: 'bg-red-100 text-red-800',
  RESTORE: 'bg-orange-100 text-orange-800',
};

export default function SistemaPage() {
  const router = useRouter();
  const { user, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<'logs' | 'backups'>('logs');
  
  // Estado logs
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [paginaLogs, setPaginaLogs] = useState(1);
  const [cargandoLogs, setCargandoLogs] = useState(false);
  const [filtroAccion, setFiltroAccion] = useState('');
  const [filtroEntidad, setFiltroEntidad] = useState('');
  const [accionesDisponibles, setAccionesDisponibles] = useState<string[]>([]);
  const [entidadesDisponibles, setEntidadesDisponibles] = useState<string[]>([]);
  
  // Estado backups
  const [backups, setBackups] = useState<Backup[]>([]);
  const [estadisticas, setEstadisticas] = useState<EstadisticasBackup | null>(null);
  const [cargandoBackups, setCargandoBackups] = useState(false);
  const [creandoBackup, setCreandoBackup] = useState(false);

  const esOwnerPlus = user?.rol && ['owner', 'sysowner'].includes(user.rol);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && user) {
      cargarFiltros();
      if (tab === 'logs') {
        cargarLogs();
      } else if (esOwnerPlus) {
        cargarBackups();
      }
    }
  }, [mounted, user, tab, paginaLogs, filtroAccion, filtroEntidad]);

  const cargarFiltros = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/audit-logs/acciones`,
        { withCredentials: true }
      );
      setAccionesDisponibles(response.data.acciones);
      setEntidadesDisponibles(response.data.entidades);
    } catch (error) {
      console.error('Error cargando filtros:', error);
    }
  };

  const cargarLogs = async () => {
    setCargandoLogs(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/admin/audit-logs?pagina=${paginaLogs}&por_pagina=50`;
      if (filtroAccion) url += `&accion=${filtroAccion}`;
      if (filtroEntidad) url += `&entidad=${filtroEntidad}`;
      
      const response = await axios.get(url, { withCredentials: true });
      setLogs(response.data.logs);
      setTotalLogs(response.data.total);
    } catch (error) {
      console.error('Error cargando logs:', error);
      toast.error('Error al cargar logs');
    } finally {
      setCargandoLogs(false);
    }
  };

  const cargarBackups = async () => {
    setCargandoBackups(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/backups`,
        { withCredentials: true }
      );
      setBackups(response.data.backups);
      setEstadisticas(response.data.estadisticas);
    } catch (error) {
      console.error('Error cargando backups:', error);
      toast.error('Error al cargar backups');
    } finally {
      setCargandoBackups(false);
    }
  };

  const crearBackup = async () => {
    setCreandoBackup(true);
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/backups/crear`,
        {},
        { withCredentials: true }
      );
      if (response.data.success) {
        toast.success(`Backup creado: ${response.data.filename} (${response.data.size_mb} MB)`);
        cargarBackups();
      } else {
        toast.error(response.data.error || 'Error al crear backup');
      }
    } catch (error: any) {
      console.error('Error creando backup:', error);
      toast.error(error.response?.data?.detail || 'Error al crear backup');
    } finally {
      setCreandoBackup(false);
    }
  };

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (!mounted) return null;

  if (!user) {
    router.push('/login');
    return null;
  }

  const esAdmin = user?.rol && ['admin', 'owner', 'sysowner'].includes(user.rol);
  if (!esAdmin) {
    router.push('/dashboard');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              <ArrowLeftIcon />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <ShieldIcon />
                Administración del Sistema
              </h1>
              <p className="text-sm text-gray-500">Logs de auditoría y backups</p>
            </div>
          </div>
          <span className="text-sm text-gray-500">{user.email}</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setTab('logs')}
                className={`py-4 px-6 text-sm font-medium border-b-2 ${
                  tab === 'logs'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <ShieldIcon />
                  Logs de Auditoría
                </span>
              </button>
              {esOwnerPlus && (
                <button
                  onClick={() => setTab('backups')}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    tab === 'backups'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <DatabaseIcon />
                    Backups
                  </span>
                </button>
              )}
            </nav>
          </div>
        </div>

        {/* Tab Logs */}
        {tab === 'logs' && (
          <div className="bg-white rounded-lg shadow">
            {/* Filtros */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex flex-wrap gap-4 items-center">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Acción</label>
                  <select
                    value={filtroAccion}
                    onChange={(e) => { setFiltroAccion(e.target.value); setPaginaLogs(1); }}
                    className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                  >
                    <option value="">Todas</option>
                    {accionesDisponibles.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Entidad</label>
                  <select
                    value={filtroEntidad}
                    onChange={(e) => { setFiltroEntidad(e.target.value); setPaginaLogs(1); }}
                    className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                  >
                    <option value="">Todas</option>
                    {entidadesDisponibles.map(e => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1"></div>
                <div className="text-sm text-gray-500">
                  Total: {totalLogs} registros
                </div>
                <button
                  onClick={() => cargarLogs()}
                  className="p-2 text-gray-500 hover:text-gray-700"
                  title="Refrescar"
                >
                  <RefreshIcon />
                </button>
              </div>
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto">
              {cargandoLogs ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entidad</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          No hay logs registrados
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600 font-mono whitespace-nowrap">
                            {formatearFecha(log.fecha)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {log.usuario_email || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${COLORES_ACCION[log.accion] || 'bg-gray-100 text-gray-800'}`}>
                              {log.accion}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {log.entidad}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={log.descripcion}>
                            {log.descripcion}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                            {log.ip_address || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Paginación */}
            {totalLogs > 50 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <button
                  onClick={() => setPaginaLogs(p => Math.max(1, p - 1))}
                  disabled={paginaLogs === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {paginaLogs} de {Math.ceil(totalLogs / 50)}
                </span>
                <button
                  onClick={() => setPaginaLogs(p => p + 1)}
                  disabled={paginaLogs >= Math.ceil(totalLogs / 50)}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab Backups */}
        {tab === 'backups' && esOwnerPlus && (
          <div className="space-y-6">
            {/* Estadísticas */}
            {estadisticas && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-500">Total backups</div>
                  <div className="text-2xl font-bold text-blue-600">{estadisticas.total_backups}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-500">Exitosos</div>
                  <div className="text-2xl font-bold text-green-600">{estadisticas.exitosos}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-500">Espacio usado</div>
                  <div className="text-2xl font-bold text-purple-600">{estadisticas.espacio_usado_mb} MB</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="text-sm text-gray-500">Último backup</div>
                  <div className="text-sm font-medium text-gray-900">
                    {estadisticas.ultimo_backup 
                      ? formatearFecha(estadisticas.ultimo_backup)
                      : 'Nunca'}
                  </div>
                </div>
              </div>
            )}

            {/* Acciones */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <DatabaseIcon />
                  Gestión de Backups
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={cargarBackups}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                  >
                    <RefreshIcon />
                    Refrescar
                  </button>
                  <button
                    onClick={crearBackup}
                    disabled={creandoBackup}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {creandoBackup ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Creando...
                      </>
                    ) : (
                      <>
                        <DownloadIcon />
                        Crear Backup Ahora
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Lista de backups */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                {cargandoBackups ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Archivo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tamaño</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {backups.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                            No hay backups. Crea el primero.
                          </td>
                        </tr>
                      ) : (
                        backups.map((backup) => (
                          <tr key={backup.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-600 font-mono whitespace-nowrap">
                              {backup.fecha ? formatearFecha(backup.fecha) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                              {backup.filename}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {backup.size_mb} MB
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                backup.tipo === 'manual' ? 'bg-blue-100 text-blue-800' :
                                backup.tipo === 'automatico' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {backup.tipo}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {backup.exitoso ? (
                                <span className="flex items-center gap-1 text-green-600">
                                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                  {backup.existe ? 'Disponible' : 'Archivo eliminado'}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-red-600">
                                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                  Error
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">ℹ️ Información sobre backups</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Los backups se guardan comprimidos (.gz) en la carpeta <code className="bg-blue-100 px-1 rounded">backups/</code></li>
                <li>• Se mantienen los últimos 30 backups automáticamente</li>
                <li>• Los backups expiran después de 30 días</li>
                <li>• Solo owner y sysowner pueden gestionar backups</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
