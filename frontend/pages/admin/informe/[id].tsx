'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface BusquedaDetalle {
  id: number;
  referencia: string;
  plataforma: string;
  cantidad_precios: number;
  precio_medio: number;
  precio_minimo: number;
  precio_maximo: number;
  fecha: string;
}

interface ResumenDiario {
  fecha: string;
  total_busquedas: number;
  referencias_unicas: number;
  plataformas: string[];
}

interface InformeData {
  usuario: {
    id: number;
    email: string;
    nombre: string;
    rol: string;
  };
  periodo_dias: number;
  fecha_inicio: string;
  fecha_fin: string;
  estadisticas: {
    total_busquedas: number;
    referencias_unicas: number;
    plataformas_usadas: string[];
    promedio_busquedas_dia: number;
    intervalo_medio_minutos: number | null;
    intervalo_medio_texto: string | null;
  };
  resumen_diario: ResumenDiario[];
  ultimas_busquedas: BusquedaDetalle[];
}

export default function InformeUsuarioPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [informe, setInforme] = useState<InformeData | null>(null);
  const [dias, setDias] = useState(30);
  const [vistaActiva, setVistaActiva] = useState<'resumen' | 'detalle'>('resumen');
  const [usarFechas, setUsarFechas] = useState(false);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && id) {
      fetchInforme();
    }
  }, [mounted, id, dias, usarFechas, fechaInicio, fechaFin]);

  const fetchInforme = async () => {
    try {
      setLoading(true);
      let url = `${process.env.NEXT_PUBLIC_API_URL}/auth/usuarios/${id}/informe?dias=${dias}`;
      if (usarFechas && fechaInicio && fechaFin) {
        url += `&fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}`;
      }
      const response = await axios.get(url, { withCredentials: true });
      setInforme(response.data);
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al cargar informe');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Calcular intervalo entre búsquedas y devolver color/clase
  const getRowColorClass = (index: number): { bg: string; badge: string; intervalo: string | null } => {
    if (!informe || index === informe.ultimas_busquedas.length - 1) {
      // Última búsqueda (la más antigua) no tiene intervalo
      return { bg: '', badge: '', intervalo: null };
    }
    
    const busquedaActual = new Date(informe.ultimas_busquedas[index].fecha);
    const busquedaSiguiente = new Date(informe.ultimas_busquedas[index + 1].fecha);
    const diffMinutos = (busquedaActual.getTime() - busquedaSiguiente.getTime()) / (1000 * 60);
    
    // Formatear intervalo
    let intervaloTexto: string;
    if (diffMinutos < 60) {
      intervaloTexto = `${Math.round(diffMinutos)} min`;
    } else {
      intervaloTexto = `${(diffMinutos / 60).toFixed(1)} h`;
    }
    
    // Determinar color según el intervalo
    if (diffMinutos < 7) {
      return { bg: 'bg-green-50', badge: 'bg-green-100 text-green-700', intervalo: intervaloTexto };
    } else if (diffMinutos <= 25) {
      return { bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700', intervalo: intervaloTexto };
    } else {
      return { bg: 'bg-red-50', badge: 'bg-red-100 text-red-700', intervalo: intervaloTexto };
    }
  };

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    });
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
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/admin/users')}
                className="text-gray-600 hover:text-gray-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
              </button>
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                M
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Informe de Usuario
                </h1>
                <p className="text-xs text-gray-500">
                  {informe?.usuario.email || 'Cargando...'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando informe...</p>
          </div>
        ) : informe ? (
          <>
            {/* Header con info del usuario */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {informe.usuario.nombre || informe.usuario.email}
                  </h2>
                  <p className="text-gray-500">{informe.usuario.email}</p>
                  <span className="inline-block mt-2 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                    {informe.usuario.rol === 'sysowner' && 'Prop. Sistema'}
                    {informe.usuario.rol === 'owner' && 'Propietario'}
                    {informe.usuario.rol === 'admin' && 'Administrador'}
                    {informe.usuario.rol === 'user' && 'Usuario'}
                  </span>
                </div>
              </div>
            </div>

            {/* Estadísticas generales */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-500">Total Búsquedas</p>
                    <p className="text-2xl font-bold text-gray-900">{informe.estadisticas.total_busquedas}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-500">Referencias Únicas</p>
                    <p className="text-2xl font-bold text-gray-900">{informe.estadisticas.referencias_unicas}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-500">Promedio/Día</p>
                    <p className="text-2xl font-bold text-gray-900">{informe.estadisticas.promedio_busquedas_dia}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-500">Intervalo Medio</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {informe.estadisticas.intervalo_medio_texto || '-'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm text-gray-500">Plataformas</p>
                    <p className="text-2xl font-bold text-gray-900">{informe.estadisticas.plataformas_usadas.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Plataformas usadas */}
            {informe.estadisticas.plataformas_usadas.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Plataformas utilizadas</h3>
                <div className="flex flex-wrap gap-2">
                  {informe.estadisticas.plataformas_usadas.map((plat) => (
                    <span key={plat} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                      {plat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs y Filtros */}
            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setVistaActiva('resumen')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    vistaActiva === 'resumen'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Resumen Diario
                </button>
                <button
                  onClick={() => setVistaActiva('detalle')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    vistaActiva === 'detalle'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Búsquedas Detalladas
                </button>
              </div>
              
              {/* Filtros de período */}
              <div className="flex items-center gap-2 bg-white rounded-lg shadow px-3 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                {!usarFechas ? (
                  <>
                    <select
                      value={dias}
                      onChange={(e) => setDias(Number(e.target.value))}
                      className="px-2 py-1 border-0 text-sm focus:ring-0 bg-transparent cursor-pointer"
                    >
                      <option value={7}>Últimos 7 días</option>
                      <option value={30}>Últimos 30 días</option>
                      <option value={90}>Últimos 90 días</option>
                      <option value={180}>Últimos 6 meses</option>
                      <option value={365}>Último año</option>
                    </select>
                    <button
                      onClick={() => setUsarFechas(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
                    >
                      Personalizar
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded text-sm w-32"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="date"
                      value={fechaFin}
                      onChange={(e) => setFechaFin(e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded text-sm w-32"
                    />
                    <button
                      onClick={() => setUsarFechas(false)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Contenido según tab */}
            {vistaActiva === 'resumen' ? (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Actividad por día</h3>
                  {informe.resumen_diario.length > 0 ? (
                    <div className="space-y-3">
                      {informe.resumen_diario.map((dia) => (
                        <div
                          key={dia.fecha}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-16 text-center">
                              <p className="text-sm font-medium text-gray-900">
                                {formatDateShort(dia.fecha)}
                              </p>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {dia.total_busquedas} búsquedas
                              </p>
                              <p className="text-sm text-gray-500">
                                {dia.referencias_unicas} referencias únicas
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {dia.plataformas.map((p) => (
                              <span key={p} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">No hay actividad en este período</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    Últimas búsquedas
                    <span className="text-gray-400 text-sm font-normal ml-2">
                      ({informe.ultimas_busquedas.length})
                    </span>
                  </h3>
                </div>
                {informe.ultimas_busquedas.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Fecha/Hora</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Referencia</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Plataforma</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Precios</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Precio Medio</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Min - Max</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-900">Intervalo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {informe.ultimas_busquedas.map((busqueda, index) => {
                          const colorInfo = getRowColorClass(index);
                          return (
                            <tr key={busqueda.id} className={`${colorInfo.bg} hover:opacity-80 transition-opacity`}>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {formatDate(busqueda.fecha)}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {busqueda.referencia}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                                  {busqueda.plataforma || 'N/A'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 text-right">
                                {busqueda.cantidad_precios || 0}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                                {busqueda.precio_medio ? `${busqueda.precio_medio.toFixed(2)}€` : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 text-right">
                                {busqueda.precio_minimo && busqueda.precio_maximo
                                  ? `${busqueda.precio_minimo.toFixed(2)}€ - ${busqueda.precio_maximo.toFixed(2)}€`
                                  : '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {colorInfo.intervalo ? (
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorInfo.badge}`}>
                                    {colorInfo.intervalo}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-500">
                    No hay búsquedas en este período
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No se pudo cargar el informe</p>
          </div>
        )}
      </main>
    </div>
  );
}
