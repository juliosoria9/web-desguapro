'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface AuditLog {
  id: number;
  usuario_email: string | null;
  accion: string;
  entidad: string;
  descripcion: string;
  ip_address: string | null;
  fecha: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  pagina: number;
  por_pagina: number;
}

export default function LogsAuditoriaPage() {
  const router = useRouter();
  const { token, user, isAuthenticated, logout } = useAuthStore();
  
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [porPagina] = useState(50);
  
  // Filtros
  const [filtroAccion, setFiltroAccion] = useState('');
  const [filtroEntidad, setFiltroEntidad] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const API_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1`;

  // Verificar acceso sysowner
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

  const cargarLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('pagina', pagina.toString());
      params.append('por_pagina', porPagina.toString());
      if (filtroAccion) params.append('accion', filtroAccion);
      if (filtroEntidad) params.append('entidad', filtroEntidad);
      if (fechaDesde) params.append('desde', fechaDesde);
      if (fechaHasta) params.append('hasta', fechaHasta);

      const response = await axios.get<AuditLogsResponse>(
        `${API_URL}/admin/audit-logs?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
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
  };

  useEffect(() => {
    if (user?.rol === 'sysowner') {
      cargarLogs();
    }
  }, [pagina, filtroAccion, filtroEntidad, fechaDesde, fechaHasta]);

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getAccionColor = (accion: string) => {
    const colors: Record<string, string> = {
      'LOGIN': 'bg-green-100 text-green-800',
      'LOGIN_FAILED': 'bg-red-100 text-red-800',
      'LOGOUT': 'bg-gray-100 text-gray-800',
      'CREATE': 'bg-blue-100 text-blue-800',
      'DELETE': 'bg-red-100 text-red-800',
      'UPDATE': 'bg-yellow-100 text-yellow-800',
      'BACKUP': 'bg-purple-100 text-purple-800',
      'RESTORE': 'bg-orange-100 text-orange-800',
    };
    return colors[accion] || 'bg-gray-100 text-gray-800';
  };

  const totalPaginas = Math.ceil(total / porPagina);

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
                <p className="text-xs text-gray-500">Logs de Auditoría</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
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
        {/* Filtros */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">🔍 Filtros</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Acción</label>
              <select
                value={filtroAccion}
                onChange={(e) => { setFiltroAccion(e.target.value); setPagina(1); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                <option value="LOGIN">LOGIN</option>
                <option value="LOGIN_FAILED">LOGIN_FAILED</option>
                <option value="LOGOUT">LOGOUT</option>
                <option value="CREATE">CREATE</option>
                <option value="DELETE">DELETE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="BACKUP">BACKUP</option>
                <option value="RESTORE">RESTORE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entidad</label>
              <select
                value={filtroEntidad}
                onChange={(e) => { setFiltroEntidad(e.target.value); setPagina(1); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                <option value="usuario">Usuario</option>
                <option value="fichada">Fichada</option>
                <option value="backup">Backup</option>
                <option value="sistema">Sistema</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => { setFechaDesde(e.target.value); setPagina(1); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => { setFechaHasta(e.target.value); setPagina(1); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={() => {
                setFiltroAccion('');
                setFiltroEntidad('');
                setFechaDesde('');
                setFechaHasta('');
                setPagina(1);
              }}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Limpiar filtros
            </button>
            <span className="text-sm text-gray-500">
              Total: {total} registros
            </span>
          </div>
        </div>

        {/* Tabla de logs */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              Cargando logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No se encontraron logs con los filtros aplicados
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatFecha(log.fecha)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {log.usuario_email || <span className="text-gray-400">Sistema</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getAccionColor(log.accion)}`}>
                          {log.accion}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {log.entidad}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-md truncate" title={log.descripcion}>
                        {log.descripcion}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                        {log.ip_address || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t">
              <div className="text-sm text-gray-500">
                Página {pagina} de {totalPaginas}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

