'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';
import Link from 'next/link';

interface DatoDia {
  fecha: string;
  dia_semana: string;
  total_fichadas: number;
  primera_hora: string | null;
  ultima_hora: string | null;
  tiempo_promedio_entre_piezas: number | null;
}

interface DetalleSemana {
  usuario_id: number;
  usuario_email: string;
  usuario_nombre: string | null;
  semana: string;
  label: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias: DatoDia[];
  total_semana: number;
  promedio_diario: number;
}

interface SemanaOption {
  semana: string;
  label: string;
  fecha_inicio: string;
  fecha_fin: string;
}

interface DatoPeriodo {
  periodo: string;
  label: string;
  total_fichadas: number;
  dias_trabajados: number;
  promedio_diario: number;
  mejor_dia: number;
  peor_dia: number;
  tiempo_promedio_entre_piezas: number | null;
}

interface InformeRendimiento {
  usuario_id: number;
  usuario_email: string;
  usuario_nombre: string | null;
  tipo_periodo: string;
  periodos: DatoPeriodo[];
  total_fichadas: number;
  promedio_general: number;
}

// Iconos SVG
const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const TableIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const TrophyIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

export default function InformeFichadasPage() {
  const router = useRouter();
  const { id, entorno } = router.query;
  const { user, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Tipo de vista: dias, semana, mes
  const [tipoVista, setTipoVista] = useState<'dias' | 'semana' | 'mes'>('dias');
  const [cantidad, setCantidad] = useState(8);
  
  // Estado para semanas (vista días)
  const [semanas, setSemanas] = useState<SemanaOption[]>([]);
  const [semanaSeleccionada, setSemanaSeleccionada] = useState<string>('');
  const [detalleSemana, setDetalleSemana] = useState<DetalleSemana | null>(null);
  
  // Estado para vista semanas/meses
  const [informe, setInforme] = useState<InformeRendimiento | null>(null);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && user && id) {
      if (tipoVista === 'dias') {
        cargarSemanas();
      } else {
        cargarInforme();
      }
    }
  }, [mounted, user, id, tipoVista, cantidad]);

  useEffect(() => {
    if (semanaSeleccionada && id && tipoVista === 'dias') {
      cargarDetalleSemana();
    }
  }, [semanaSeleccionada]);

  const cargarInforme = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/informe-rendimiento/${id}?tipo=${tipoVista}&cantidad=${cantidad}`;
      if (entorno) {
        url += `&entorno_id=${entorno}`;
      }
      
      const response = await axios.get<InformeRendimiento>(url, { withCredentials: true });
      setInforme(response.data);
    } catch (error) {
      console.error('Error cargando informe:', error);
      toast.error('Error al cargar el informe');
    } finally {
      setLoading(false);
    }
  };

  const cargarSemanas = async () => {
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/semanas-disponibles/${id}?cantidad=12`;
      if (entorno) {
        url += `&entorno_id=${entorno}`;
      }
      
      const response = await axios.get<{ semanas: SemanaOption[] }>(url, { withCredentials: true });
      setSemanas(response.data.semanas);
      
      if (response.data.semanas.length > 0) {
        setSemanaSeleccionada(response.data.semanas[0].semana);
      }
    } catch (error) {
      console.error('Error cargando semanas:', error);
      toast.error('Error al cargar semanas');
    }
  };

  const cargarDetalleSemana = async () => {
    if (!id || !semanaSeleccionada) return;
    
    setLoading(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/detalle-semana/${id}?semana=${semanaSeleccionada}`;
      if (entorno) {
        url += `&entorno_id=${entorno}`;
      }
      
      const response = await axios.get<DetalleSemana>(url, { withCredentials: true });
      setDetalleSemana(response.data);
    } catch (error) {
      console.error('Error cargando detalle:', error);
      toast.error('Error al cargar el detalle');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  if (!user) {
    router.push('/login');
    return null;
  }

  const esAdmin = user?.rol && ['admin', 'owner', 'sysowner'].includes(user.rol);
  if (!esAdmin) {
    router.push('/fichadas');
    return null;
  }

  const maxFichadas = detalleSemana 
    ? Math.max(...detalleSemana.dias.map(d => d.total_fichadas), 1) 
    : 100;

  const getBarColor = (total: number, promedio: number) => {
    if (total === 0) return 'bg-gray-300';
    if (total >= promedio * 1.2) return 'bg-green-500';
    if (total >= promedio * 0.8) return 'bg-blue-500';
    if (total >= promedio * 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const mejorDia = detalleSemana?.dias.reduce((max, dia) => 
    dia.total_fichadas > max.total_fichadas ? dia : max, 
    detalleSemana.dias[0]
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/fichadas" className="text-gray-600 hover:text-gray-900">
              <ArrowLeftIcon />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <ChartIcon />
                Informe de Rendimiento
              </h1>
              {detalleSemana && (
                <p className="text-sm text-gray-500">
                  {detalleSemana.usuario_nombre || detalleSemana.usuario_email}
                </p>
              )}
            </div>
          </div>
          <span className="text-sm text-gray-500">{user.email}</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <ChartIcon />
              <label className="text-sm font-medium text-gray-700">Vista por:</label>
            </div>
            <select
              value={tipoVista}
              onChange={(e) => setTipoVista(e.target.value as 'dias' | 'semana' | 'mes')}
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="dias">Días</option>
              <option value="semana">Semanas</option>
              <option value="mes">Meses</option>
            </select>

            {tipoVista === 'dias' ? (
              <>
                <div className="flex items-center gap-2 ml-4">
                  <CalendarIcon />
                  <label className="text-sm font-medium text-gray-700">Semana:</label>
                </div>
                <select
                  value={semanaSeleccionada}
                  onChange={(e) => setSemanaSeleccionada(e.target.value)}
                  className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                >
                  {semanas.map((sem) => (
                    <option key={sem.semana} value={sem.semana}>
                      {sem.label}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 ml-4">
                  <CalendarIcon />
                  <label className="text-sm font-medium text-gray-700">Cantidad:</label>
                </div>
                <select
                  value={cantidad}
                  onChange={(e) => setCantidad(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value={4}>Últimos 4</option>
                  <option value={8}>Últimos 8</option>
                  <option value={12}>Últimos 12</option>
                </select>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : tipoVista === 'dias' && detalleSemana ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <ChartIcon />
                  Total semana
                </div>
                <div className="text-2xl font-bold text-blue-600">{detalleSemana.total_semana}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <CalendarIcon />
                  Promedio diario
                </div>
                <div className="text-2xl font-bold text-green-600">{detalleSemana.promedio_diario}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <TrophyIcon />
                  Mejor día
                </div>
                <div className="text-2xl font-bold text-purple-600">
                  {mejorDia?.total_fichadas || 0}
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ({mejorDia?.dia_semana || '-'})
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <ClockIcon />
                  Días trabajados
                </div>
                <div className="text-2xl font-bold text-orange-600">
                  {detalleSemana.dias.filter(d => d.total_fichadas > 0).length}
                  <span className="text-sm font-normal text-gray-500 ml-1">/ 7</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ChartIcon />
                Fichadas por Día
              </h2>
              <div className="flex items-end gap-4 h-64 border-b border-l border-gray-200 pb-2 pl-2 overflow-visible pt-20">
                {detalleSemana.dias.map((dia) => (
                  <div 
                    key={dia.fecha}
                    className="flex-1 flex flex-col items-center justify-end group relative"
                  >
                    <div className="absolute left-1/2 -translate-x-1/2 top-0 -translate-y-full hidden group-hover:block bg-gray-900 text-white text-xs rounded py-2 px-3 whitespace-nowrap z-50 shadow-lg pointer-events-none">
                      <div className="font-medium">{dia.dia_semana} {dia.fecha.split('-')[2]}</div>
                      <div>Fichadas: {dia.total_fichadas}</div>
                      {dia.primera_hora && <div>Inicio: {dia.primera_hora}</div>}
                      {dia.ultima_hora && <div>Fin: {dia.ultima_hora}</div>}
                      {dia.tiempo_promedio_entre_piezas && (
                        <div>Tiempo/pieza: {dia.tiempo_promedio_entre_piezas} min</div>
                      )}
                      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                    </div>
                    
                    <span className="text-sm font-bold text-gray-700 mb-1">
                      {dia.total_fichadas}
                    </span>
                    
                    <div 
                      className={`w-full rounded-t transition-all duration-300 ${getBarColor(dia.total_fichadas, detalleSemana.promedio_diario)}`}
                      style={{ 
                        height: `${Math.max((dia.total_fichadas / maxFichadas) * 180, 4)}px`,
                        minHeight: '4px'
                      }}
                    ></div>
                    
                    <div className="mt-2 text-center">
                      <span className="text-sm font-medium text-gray-700">
                        {dia.dia_semana.substring(0, 3)}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {dia.fecha.split('-')[2]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-center gap-6 mt-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-green-500"></span> Excelente (+20%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-blue-500"></span> Normal (±20%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-yellow-500"></span> Bajo (-20% a -50%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-500"></span> Muy bajo (-50%)
                </span>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ClockIcon />
                Tiempo promedio entre piezas (minutos)
              </h2>
              <div className="flex items-end gap-4 h-48 border-b border-l border-gray-200 pb-2 pl-2">
                {detalleSemana.dias.map((dia) => {
                  const tiempo = dia.tiempo_promedio_entre_piezas || 0;
                  const maxTiempo = Math.max(...detalleSemana.dias.map(d => d.tiempo_promedio_entre_piezas || 0), 30);
                  
                  const getTimeColor = (min: number) => {
                    if (min === 0) return 'bg-gray-300';
                    if (min <= 5) return 'bg-green-500';
                    if (min <= 10) return 'bg-blue-500';
                    if (min <= 15) return 'bg-yellow-500';
                    return 'bg-orange-500';
                  };
                  
                  return (
                    <div key={dia.fecha} className="flex-1 flex flex-col items-center justify-end">
                      <span className="text-sm font-medium text-gray-600 mb-1">
                        {tiempo > 0 ? tiempo.toFixed(1) : '-'}
                      </span>
                      <div 
                        className={`w-full rounded-t ${getTimeColor(tiempo)}`}
                        style={{ 
                          height: `${tiempo > 0 ? Math.max((tiempo / maxTiempo) * 120, 4) : 4}px`
                        }}
                      ></div>
                      <div className="mt-2 text-center">
                        <span className="text-sm font-medium text-gray-700">
                          {dia.dia_semana.substring(0, 3)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="flex justify-center gap-6 mt-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-green-500"></span> 0-5 min (rápido)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-blue-500"></span> 5-10 min (normal)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-yellow-500"></span> 10-15 min (lento)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-orange-500"></span> +15 min (muy lento)
                </span>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <h2 className="text-lg font-semibold p-4 border-b flex items-center gap-2">
                <TableIcon />
                Detalle por Día
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Día</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Fichadas</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Inicio</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Fin</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tiempo/Pieza</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {detalleSemana.dias.map((dia) => (
                      <tr key={dia.fecha} className={`hover:bg-gray-50 ${dia.total_fichadas === 0 ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{dia.dia_semana}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{dia.fecha}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                            dia.total_fichadas > 0 
                              ? dia.total_fichadas >= detalleSemana.promedio_diario 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-400'
                          }`}>
                            {dia.total_fichadas}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600 font-mono">
                          {dia.primera_hora || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600 font-mono">
                          {dia.ultima_hora || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {dia.tiempo_promedio_entre_piezas ? `${dia.tiempo_promedio_entre_piezas} min` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900" colSpan={2}>TOTAL SEMANA</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-blue-600">{detalleSemana.total_semana}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600" colSpan={3}>
                        Promedio: {detalleSemana.promedio_diario} fichadas/día
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        ) : (tipoVista === 'semana' || tipoVista === 'mes') && informe ? (
          <>
            {(() => {
              const mejorPeriodo = informe.periodos.reduce((max, p) => 
                p.total_fichadas > max.total_fichadas ? p : max, 
                informe.periodos[0]
              );
              
              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                      <ChartIcon />
                      Total periodo
                    </div>
                    <div className="text-2xl font-bold text-blue-600">{informe.total_fichadas}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                      <CalendarIcon />
                      Promedio por {tipoVista === 'semana' ? 'semana' : 'mes'}
                    </div>
                    <div className="text-2xl font-bold text-green-600">{informe.promedio_general}</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                      <TrophyIcon />
                      Mejor {tipoVista === 'semana' ? 'semana' : 'mes'}
                    </div>
                    <div className="text-2xl font-bold text-purple-600">
                      {mejorPeriodo?.total_fichadas || 0}
                      <span className="text-sm font-normal text-gray-500 ml-2">
                        ({mejorPeriodo?.label || '-'})
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <ChartIcon />
                Fichadas por {tipoVista === 'semana' ? 'Semana' : 'Mes'}
              </h2>
              <div className="flex items-end gap-4 h-64 border-b border-l border-gray-200 pb-2 pl-2 overflow-visible pt-20">
                {informe.periodos.map((dato) => {
                  const maxPeriodo = Math.max(...informe.periodos.map(d => d.total_fichadas), 1);
                  const promedio = informe.promedio_general;
                  
                  return (
                    <div 
                      key={dato.periodo}
                      className="flex-1 flex flex-col items-center justify-end group relative min-w-[60px]"
                    >
                      <div className="absolute left-1/2 -translate-x-1/2 top-0 -translate-y-full hidden group-hover:block bg-gray-900 text-white text-xs rounded py-2 px-3 whitespace-nowrap z-50 shadow-lg pointer-events-none">
                        <div className="font-medium">{dato.label}</div>
                        <div>Fichadas: {dato.total_fichadas}</div>
                        <div>Días: {dato.dias_trabajados}</div>
                        <div>Tiempo promedio: {dato.tiempo_promedio_entre_piezas?.toFixed(1) || '-'} min</div>
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                      
                      <span className="text-sm font-bold text-gray-700 mb-1">
                        {dato.total_fichadas}
                      </span>
                      
                      <div 
                        className={`w-full rounded-t transition-all duration-300 ${getBarColor(dato.total_fichadas, promedio)}`}
                        style={{ 
                          height: `${Math.max((dato.total_fichadas / maxPeriodo) * 180, 4)}px`,
                          minHeight: '4px'
                        }}
                      ></div>
                      
                      <div className="mt-2 text-center">
                        <span className="text-xs font-medium text-gray-700">
                          {dato.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="flex justify-center gap-6 mt-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-green-500"></span> Excelente (+20%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-blue-500"></span> Normal (±20%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-yellow-500"></span> Bajo (-20% a -50%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-500"></span> Muy bajo (-50%)
                </span>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <h2 className="text-lg font-semibold p-4 border-b flex items-center gap-2">
                <TableIcon />
                Detalle por {tipoVista === 'semana' ? 'Semana' : 'Mes'}
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{tipoVista === 'semana' ? 'Semana' : 'Mes'}</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Fichadas</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Días trabajados</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tiempo/Pieza</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {informe.periodos.map((dato) => (
                      <tr key={dato.periodo} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{dato.label}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`inline-flex items-center justify-center w-10 h-8 rounded-full font-bold ${
                            dato.total_fichadas >= informe.promedio_general 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {dato.total_fichadas}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">{dato.dias_trabajados}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {dato.tiempo_promedio_entre_piezas ? `${dato.tiempo_promedio_entre_piezas.toFixed(1)} min` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900">TOTAL</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-blue-600">{informe.total_fichadas}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600" colSpan={2}>
                        Promedio: {informe.promedio_general} fichadas/{tipoVista === 'semana' ? 'semana' : 'mes'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            No se encontraron datos
          </div>
        )}
      </main>
    </div>
  );
}
