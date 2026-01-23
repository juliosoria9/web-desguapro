'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface PiezaVendida {
  id: number;
  refid: string | null;
  oem: string | null;
  oe: string | null;
  iam: string | null;
  precio: number | null;
  ubicacion: string | null;
  observaciones: string | null;
  articulo: string | null;
  marca: string | null;
  modelo: string | null;
  version: string | null;
  imagen: string | null;
  fecha_venta: string | null;
  archivo_origen: string | null;
}

interface Resumen {
  total_vendidas: number;
  ingresos_totales: number;
  ventas_7_dias: number;
  ingresos_7_dias: number;
  ventas_30_dias: number;
  ingresos_30_dias: number;
}

interface Entorno {
  id: number;
  nombre: string;
}

export default function VentasPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ventas, setVentas] = useState<PiezaVendida[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  
  // Para sysowner
  const [empresas, setEmpresas] = useState<Entorno[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
  
  // Búsqueda
  const [busqueda, setBusqueda] = useState('');
  const [busquedaActiva, setBusquedaActiva] = useState('');
  
  // Filtros de fecha
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [fechaDesdeActiva, setFechaDesdeActiva] = useState('');
  const [fechaHastaActiva, setFechaHastaActiva] = useState('');
  const [filtroRapido, setFiltroRapido] = useState<string | null>(null);
  
  // Modal de detalle
  const [ventaDetalle, setVentaDetalle] = useState<PiezaVendida | null>(null);
  
  // Exportación
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && user) {
      if (user.rol === 'sysowner') {
        fetchEmpresas();
      } else {
        fetchData();
      }
    }
  }, [mounted, user]);

  useEffect(() => {
    if (user?.rol === 'sysowner' && selectedEmpresa) {
      fetchData();
    }
  }, [selectedEmpresa]);

  // Recargar cuando cambien los filtros activos o el offset
  useEffect(() => {
    if (mounted && user && (user.rol !== 'sysowner' || selectedEmpresa)) {
      fetchData();
    }
  }, [busquedaActiva, fechaDesdeActiva, fechaHastaActiva, offset]);

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

  const fetchData = async () => {
    setLoading(true);
    try {
      // Construir parámetros correctamente
      const queryParams = new URLSearchParams();
      if (selectedEmpresa) queryParams.append('entorno_id', selectedEmpresa.toString());
      if (busquedaActiva) queryParams.append('busqueda', busquedaActiva);
      if (fechaDesdeActiva) queryParams.append('fecha_desde', fechaDesdeActiva);
      if (fechaHastaActiva) queryParams.append('fecha_hasta', fechaHastaActiva);
      queryParams.append('limit', limit.toString());
      queryParams.append('offset', offset.toString());
      const queryString = queryParams.toString();
      
      // Fetch ventas
      const ventasRes = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/desguace/ventas?${queryString}`,
        { withCredentials: true }
      );
      setVentas(ventasRes.data.ventas || []);
      setTotal(ventasRes.data.total || 0);
      
      // Fetch resumen solo para sysowner y owner
      if (user && ['sysowner', 'owner'].includes(user.rol)) {
        const resumenParams = selectedEmpresa ? `?entorno_id=${selectedEmpresa}` : '';
        const resumenRes = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/desguace/ventas/resumen${resumenParams}`,
          { withCredentials: true }
        );
        setResumen(resumenRes.data);
      }
      
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVenta = async (id: number) => {
    if (!confirm('¿Eliminar este registro de venta del historial?')) return;
    
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/desguace/ventas/${id}`,
        { withCredentials: true }
      );
      toast.success('Registro eliminado');
      fetchData();
    } catch (error: any) {
      toast.error('Error al eliminar');
    }
  };

  // Función para obtener array de imágenes desde string separado por comas
  const getImagenes = (imagenStr: string | null): string[] => {
    if (!imagenStr) return [];
    return imagenStr.split(',').map(url => url.trim()).filter(url => url.length > 0);
  };

  // Calcular suma de precios de las ventas mostradas
  const sumaPreciosVentas = ventas.reduce((acc, v) => acc + (v.precio || 0), 0);

  // Función para aplicar filtro rápido de fecha
  const aplicarFiltroRapido = (dias: number, label: string) => {
    const hoy = new Date();
    const desde = new Date();
    desde.setDate(hoy.getDate() - dias);
    
    const fechaDesdeStr = desde.toISOString().split('T')[0];
    const fechaHastaStr = hoy.toISOString().split('T')[0];
    
    setFechaDesde(fechaDesdeStr);
    setFechaHasta(fechaHastaStr);
    setFechaDesdeActiva(fechaDesdeStr);
    setFechaHastaActiva(fechaHastaStr);
    setFiltroRapido(label);
    setOffset(0);
  };

  const exportarCSV = async () => {
    setExportando(true);
    try {
      // Obtener todos los datos con los filtros actuales
      const queryParams = new URLSearchParams();
      if (selectedEmpresa) queryParams.append('entorno_id', selectedEmpresa.toString());
      if (busquedaActiva) queryParams.append('busqueda', busquedaActiva);
      if (fechaDesdeActiva) queryParams.append('fecha_desde', fechaDesdeActiva);
      if (fechaHastaActiva) queryParams.append('fecha_hasta', fechaHastaActiva);
      queryParams.append('limit', '10000'); // Obtener todos
      queryParams.append('offset', '0');
      
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/desguace/ventas?${queryParams.toString()}`,
        { withCredentials: true }
      );
      
      const datos = response.data.ventas || [];
      if (datos.length === 0) {
        toast.error('No hay datos para exportar');
        return;
      }
      
      // Crear CSV
      const headers = ['Fecha Venta', 'Ref ID', 'Artículo', 'OEM', 'OE', 'IAM', 'Marca', 'Modelo', 'Versión', 'Precio', 'Ubicación', 'Observaciones'];
      const rows = datos.map((v: PiezaVendida) => [
        v.fecha_venta ? new Date(v.fecha_venta).toLocaleDateString('es-ES') : '',
        v.refid || '',
        v.articulo || '',
        v.oem || '',
        v.oe || '',
        v.iam || '',
        v.marca || '',
        v.modelo || '',
        v.version || '',
        v.precio?.toString() || '',
        v.ubicacion || '',
        v.observaciones || '',
      ]);
      
      const csvContent = [headers, ...rows]
        .map((row: string[]) => row.map((cell: string) => `"${cell}"`).join(';'))
        .join('\n');
      
      // Descargar
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ventas_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success(`${datos.length} registros exportados`);
    } catch (error) {
      toast.error('Error al exportar');
    } finally {
      setExportando(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
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

  // Definir si puede ver resumen de ingresos (solo sysowner y owner)
  const puedeVerIngresos = ['sysowner', 'owner'].includes(user.rol);

  const getEmpresaNombre = () => {
    const emp = empresas.find(e => e.id === selectedEmpresa);
    return emp ? emp.nombre : '';
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
                <p className="text-xs text-gray-500">Historial de Ventas</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user.email}
                  {user.entorno_nombre && (
                    <span className="text-blue-600 ml-1">({user.entorno_nombre})</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {user.rol === 'sysowner' && 'Prop. Sistema'}
                  {user.rol === 'owner' && 'Propietario'}
                  {user.rol === 'admin' && 'Administrador'}
                  {user.rol === 'user' && 'Usuario'}
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Selector de empresa para sysowner */}
        {user.rol === 'sysowner' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Seleccionar Empresa</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {empresas.map((empresa) => (
                <button
                  key={empresa.id}
                  onClick={() => setSelectedEmpresa(empresa.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedEmpresa === empresa.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900 text-sm">{empresa.nombre}</p>
                </button>
              ))}
              {empresas.length === 0 && (
                <p className="col-span-4 text-center text-gray-500 py-4">
                  No hay empresas creadas
                </p>
              )}
            </div>
          </div>
        )}

        {/* Mostrar solo si hay empresa seleccionada (o no es sysowner) */}
        {(user.rol !== 'sysowner' || selectedEmpresa) && (
          <>
            {/* Resumen de ventas - Solo para propietarios */}
            {puedeVerIngresos && resumen && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Total Vendidas</p>
                      <p className="text-3xl font-bold text-gray-900">{resumen.total_vendidas}</p>
                      <p className="text-sm text-green-600 mt-1">
                        {formatCurrency(resumen.ingresos_totales)} total
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Últimos 7 días</p>
                      <p className="text-3xl font-bold text-blue-600">{resumen.ventas_7_dias}</p>
                      <p className="text-sm text-blue-600 mt-1">
                        {formatCurrency(resumen.ingresos_7_dias)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-blue-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Últimos 30 días</p>
                      <p className="text-3xl font-bold text-purple-600">{resumen.ventas_30_dias}</p>
                      <p className="text-sm text-purple-600 mt-1">
                        {formatCurrency(resumen.ingresos_30_dias)}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-purple-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Estadísticas básicas para usuarios normales (sin ingresos) */}
            {!puedeVerIngresos && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-600">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      Historial de piezas vendidas
                    </p>
                    <p className="text-xs text-blue-600">
                      Aquí puedes consultar las piezas que han sido vendidas. Usa los filtros para buscar piezas específicas.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tabla de ventas */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-gray-900">
                        Historial de Piezas Vendidas
                      </h2>
                      {user.rol === 'sysowner' && selectedEmpresa && (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                          {getEmpresaNombre()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-medium">
                        {total} pieza{total !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={exportarCSV}
                        disabled={exportando || ventas.length === 0}
                        className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        title="Exportar a CSV"
                      >
                        {exportando ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                        )}
                        Exportar
                      </button>
                    </div>
                  </div>
                  
                  {/* Filtros rápidos de fecha */}
                  <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-gray-100">
                    <span className="text-xs font-medium text-gray-500">Filtros rápidos:</span>
                    <button
                      onClick={() => aplicarFiltroRapido(7, '7d')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filtroRapido === '7d' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Últimos 7 días
                    </button>
                    <button
                      onClick={() => aplicarFiltroRapido(14, '14d')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filtroRapido === '14d' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Últimos 14 días
                    </button>
                    <button
                      onClick={() => aplicarFiltroRapido(30, '30d')}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        filtroRapido === '30d' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Último mes
                    </button>
                    <button
                      onClick={() => {
                        setFechaDesde('');
                        setFechaHasta('');
                        setFechaDesdeActiva('');
                        setFechaHastaActiva('');
                        setFiltroRapido(null);
                        setOffset(0);
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        !filtroRapido && !fechaDesdeActiva && !fechaHastaActiva
                          ? 'bg-gray-600 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Todo
                    </button>
                  </div>
                  
                  {/* Filtros */}
                  <div className="flex flex-wrap items-end gap-3">
                    {/* Búsqueda por texto */}
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Referencia, OEM, artículo..."
                          value={busqueda}
                          onChange={(e) => setBusqueda(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setOffset(0);
                              setBusquedaActiva(busqueda);
                              setFechaDesdeActiva(fechaDesde);
                              setFechaHastaActiva(fechaHasta);
                            }
                          }}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400 absolute left-3 top-2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Fecha desde */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                      <input
                        type="date"
                        value={fechaDesde}
                        onChange={(e) => setFechaDesde(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    </div>
                    
                    {/* Fecha hasta */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                      <input
                        type="date"
                        value={fechaHasta}
                        onChange={(e) => setFechaHasta(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    </div>
                    
                    {/* Botones */}
                    <button
                      onClick={() => {
                        setOffset(0);
                        setBusquedaActiva(busqueda);
                        setFechaDesdeActiva(fechaDesde);
                        setFechaHastaActiva(fechaHasta);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Filtrar
                    </button>
                    {(busquedaActiva || fechaDesdeActiva || fechaHastaActiva) && (
                      <button
                        onClick={() => {
                          setBusqueda('');
                          setBusquedaActiva('');
                          setFechaDesde('');
                          setFechaHasta('');
                          setFechaDesdeActiva('');
                          setFechaHastaActiva('');
                          setFiltroRapido(null);
                          setOffset(0);
                        }}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                  
                  {/* Indicadores de filtros activos */}
                  {(busquedaActiva || fechaDesdeActiva || fechaHastaActiva) && (
                    <div className="flex flex-wrap gap-2">
                      {busquedaActiva && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Texto: "{busquedaActiva}"
                        </span>
                      )}
                      {fechaDesdeActiva && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Desde: {new Date(fechaDesdeActiva).toLocaleDateString('es-ES')}
                        </span>
                      )}
                      {fechaHastaActiva && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          Hasta: {new Date(fechaHastaActiva).toLocaleDateString('es-ES')}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Resumen de resultados de búsqueda */}
                  {(busquedaActiva || fechaDesdeActiva || fechaHastaActiva) && ventas.length > 0 && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-600">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-green-800">
                              {total} pieza{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
                            </p>
                            <p className="text-xs text-green-600">
                              {busquedaActiva ? `Coinciden con "${busquedaActiva}"` : 'En el período seleccionado'}
                            </p>
                          </div>
                        </div>
                        {puedeVerIngresos && (
                          <div className="text-right">
                            <p className="text-xs text-green-600">Valor total</p>
                            <p className="text-xl font-bold text-green-700">{formatCurrency(sumaPreciosVentas)}</p>
                            <p className="text-xs text-green-500">(página actual: {ventas.length} piezas)</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-500 text-sm">Cargando...</p>
                </div>
              ) : ventas.length === 0 ? (
                <div className="text-center py-12">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-gray-300 mx-auto mb-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                  </svg>
                  <p className="text-gray-500 font-medium">No hay ventas registradas</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Las ventas se detectan automáticamente al actualizar la base de datos
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Imagen</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha Venta</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ref ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Artículo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">OEM</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Marca/Modelo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Precio</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ubicación</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {ventas.map((venta) => {
                        const imagenes = getImagenes(venta.imagen);
                        return (
                        <tr key={venta.id} className="hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => setVentaDetalle(venta)}>
                          <td className="px-4 py-3">
                            {imagenes.length > 0 ? (
                              <div className="relative">
                                <img 
                                  src={imagenes[0]} 
                                  alt="Pieza" 
                                  className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                                {imagenes.length > 1 && (
                                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                                    +{imagenes.length - 1}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                                </svg>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900 font-medium">
                              {venta.fecha_venta ? new Date(venta.fecha_venta).toLocaleDateString('es-ES') : '-'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {venta.fecha_venta ? new Date(venta.fecha_venta).toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'}) : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              {venta.refid || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                            <div className="truncate" title={venta.articulo || ''}>
                              {venta.articulo || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                            {venta.oem || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            <div>{venta.marca || '-'}</div>
                            <div className="text-xs text-gray-400">{venta.modelo || ''}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-green-600">
                              {formatCurrency(venta.precio)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {venta.ubicacion || '-'}
                          </td>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => setVentaDetalle(venta)}
                                className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-100 rounded"
                                title="Ver detalle"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteVenta(venta.id)}
                                className="text-red-600 hover:text-red-800 p-1 hover:bg-red-100 rounded"
                                title="Eliminar registro"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Paginación */}
              {total > limit && (
                <div className="p-4 border-t flex justify-between items-center">
                  <p className="text-sm text-gray-500">
                    Mostrando {offset + 1} - {Math.min(offset + limit, total)} de {total}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setOffset(Math.max(0, offset - limit)); fetchData(); }}
                      disabled={offset === 0}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 rounded-lg text-sm"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => { setOffset(offset + limit); fetchData(); }}
                      disabled={offset + limit >= total}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 rounded-lg text-sm"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Modal de detalle */}
      {ventaDetalle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setVentaDetalle(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header del modal */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Detalle de Pieza Vendida</h3>
                    <p className="text-blue-100 text-sm">
                      {ventaDetalle.fecha_venta ? `Vendida el ${new Date(ventaDetalle.fecha_venta).toLocaleDateString('es-ES')}` : 'Fecha desconocida'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setVentaDetalle(null)}
                  className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Contenido del modal */}
            <div className="p-6">
              {/* Galería de imágenes */}
              {(() => {
                const imagenes = getImagenes(ventaDetalle.imagen);
                if (imagenes.length === 0) return null;
                
                return (
                  <div className="mb-6">
                    <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                      </svg>
                      Imágenes ({imagenes.length})
                    </h4>
                    <div className={`grid gap-3 ${imagenes.length === 1 ? 'grid-cols-1' : imagenes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {imagenes.map((url, idx) => (
                        <a 
                          key={idx} 
                          href={url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="group relative block"
                        >
                          <img 
                            src={url} 
                            alt={`Pieza ${idx + 1}`} 
                            className={`w-full object-cover rounded-xl border border-gray-200 bg-gray-50 transition-transform group-hover:scale-[1.02] ${imagenes.length === 1 ? 'max-h-64' : 'h-32'}`}
                            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="12">Error</text></svg>'; }}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Información principal */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="col-span-2 bg-blue-50 rounded-xl p-4">
                  <p className="text-xs text-blue-600 font-medium mb-1">Referencia ID</p>
                  <p className="text-xl font-bold font-mono text-blue-800">{ventaDetalle.refid || '-'}</p>
                </div>
                
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">Artículo</p>
                  <p className="text-sm font-semibold text-gray-800">{ventaDetalle.articulo || '-'}</p>
                </div>
                
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-xs text-green-600 font-medium mb-1">Precio de Venta</p>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(ventaDetalle.precio)}</p>
                </div>
              </div>

              {/* Referencias */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" />
                  </svg>
                  Referencias
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">OEM</p>
                    <p className="text-sm font-mono font-medium text-gray-800">{ventaDetalle.oem || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">OE</p>
                    <p className="text-sm font-mono font-medium text-gray-800">{ventaDetalle.oe || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">IAM</p>
                    <p className="text-sm font-mono font-medium text-gray-800">{ventaDetalle.iam || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Vehículo */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                  Vehículo
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Marca</p>
                    <p className="text-sm font-medium text-gray-800">{ventaDetalle.marca || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Modelo</p>
                    <p className="text-sm font-medium text-gray-800">{ventaDetalle.modelo || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Versión</p>
                    <p className="text-sm font-medium text-gray-800">{ventaDetalle.version || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Ubicación y Observaciones */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-amber-50 rounded-xl p-4">
                  <p className="text-xs text-amber-600 font-medium mb-1 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    Ubicación
                  </p>
                  <p className="text-sm font-semibold text-amber-800">{ventaDetalle.ubicacion || 'No especificada'}</p>
                </div>
                
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-xs text-purple-600 font-medium mb-1 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                    Observaciones
                  </p>
                  <p className="text-sm text-purple-800">{ventaDetalle.observaciones || 'Sin observaciones'}</p>
                </div>
              </div>

              {/* Información adicional */}
              {ventaDetalle.archivo_origen && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-400">
                    Archivo origen: {ventaDetalle.archivo_origen}
                  </p>
                </div>
              )}
            </div>

            {/* Footer del modal */}
            <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
              <button
                onClick={() => {
                  handleDeleteVenta(ventaDetalle.id);
                  setVentaDetalle(null);
                }}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                Eliminar
              </button>
              <button
                onClick={() => setVentaDetalle(null)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
