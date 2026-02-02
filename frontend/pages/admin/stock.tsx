'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface PiezaStock {
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
  fecha_creacion: string | null;
  fecha_fichaje: string | null;
  usuario_fichaje: string | null;
}

interface Resumen {
  tiene_base: boolean;
  nombre_archivo?: string;
  fecha_subida?: string;
  total_piezas: number;
  piezas_con_precio: number;
  valor_total: number | null;
  precio_medio: number | null;
  puede_ver_valores: boolean;
}

interface Entorno {
  id: number;
  nombre: string;
}

export default function StockPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [piezas, setPiezas] = useState<PiezaStock[]>([]);
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
  
  // Modal de detalle
  const [piezaDetalle, setPiezaDetalle] = useState<PiezaStock | null>(null);
  
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
  }, [busquedaActiva, offset]);

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

  const fetchData = async () => {
    setLoading(true);
    try {
      // Construir parámetros correctamente
      const queryParams = new URLSearchParams();
      if (selectedEmpresa) queryParams.append('entorno_id', selectedEmpresa.toString());
      if (busquedaActiva) queryParams.append('busqueda', busquedaActiva);
      queryParams.append('limit', limit.toString());
      queryParams.append('offset', offset.toString());
      const queryString = queryParams.toString();
      
      // Fetch piezas en stock
      const stockRes = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/desguace/stock?${queryString}`,
        { withCredentials: true }
      );
      setPiezas(stockRes.data.piezas || []);
      setTotal(stockRes.data.total || 0);
      
      // Fetch resumen
      const resumenParams = selectedEmpresa ? `?entorno_id=${selectedEmpresa}` : '';
      const resumenRes = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/desguace/stock/resumen${resumenParams}`,
        { withCredentials: true }
      );
      setResumen(resumenRes.data);
      
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Función para obtener array de imágenes desde string separado por comas
  const getImagenes = (imagenStr: string | null): string[] => {
    if (!imagenStr) return [];
    return imagenStr.split(',').map(url => url.trim()).filter(url => url.length > 0);
  };

  // Contar piezas por OEM para mostrar en burbuja
  const contadorPorOem = React.useMemo(() => {
    const contador: Record<string, number> = {};
    piezas.forEach(p => {
      if (p.oem && p.oem.trim()) {
        const oem = p.oem.trim().toLowerCase();
        contador[oem] = (contador[oem] || 0) + 1;
      }
    });
    return contador;
  }, [piezas]);

  // Función para obtener cantidad de piezas con mismo OEM
  const getCantidadMismoOem = (pieza: PiezaStock): number => {
    if (!pieza.oem || !pieza.oem.trim()) return 0;
    return contadorPorOem[pieza.oem.trim().toLowerCase()] || 0;
  };

  // Calcular suma de precios de las piezas mostradas
  const sumaPreciosPiezas = piezas.reduce((acc, p) => acc + (p.precio || 0), 0);

  // Verificar si puede ver valores económicos
  const puedeVerValores = resumen?.puede_ver_valores ?? false;

  const exportarCSV = async () => {
    setExportando(true);
    try {
      // Obtener todos los datos con los filtros actuales
      const queryParams = new URLSearchParams();
      if (selectedEmpresa) queryParams.append('entorno_id', selectedEmpresa.toString());
      if (busquedaActiva) queryParams.append('busqueda', busquedaActiva);
      queryParams.append('limit', '10000'); // Obtener todos
      queryParams.append('offset', '0');
      
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/desguace/stock?${queryParams.toString()}`,
        { withCredentials: true }
      );
      
      const datos = response.data.piezas || [];
      if (datos.length === 0) {
        toast.error('No hay datos para exportar');
        return;
      }
      
      // Crear CSV
      const headers = ['Ref ID', 'Fecha Entrada', 'Fichado por', 'Artículo', 'OEM', 'OE', 'IAM', 'Marca', 'Modelo', 'Versión', 'Precio', 'Ubicación', 'Observaciones'];
      const rows = datos.map((p: PiezaStock) => [
        p.refid || '',
        p.fecha_fichaje ? new Date(p.fecha_fichaje).toLocaleDateString('es-ES') : (p.fecha_creacion ? new Date(p.fecha_creacion).toLocaleDateString('es-ES') : ''),
        p.usuario_fichaje || '',
        p.articulo || '',
        p.oem || '',
        p.oe || '',
        p.iam || '',
        p.marca || '',
        p.modelo || '',
        p.version || '',
        p.precio?.toString() || '',
        p.ubicacion || '',
        p.observaciones || '',
      ]);
      
      const csvContent = [headers, ...rows]
        .map((row: string[]) => row.map((cell: string) => `"${cell}"`).join(';'))
        .join('\n');
      
      // Descargar
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success(`${datos.length} piezas exportadas`);
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
                <p className="text-xs text-gray-500">Inventario de Piezas</p>
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
            {/* Resumen del stock */}
            {resumen && resumen.tiene_base && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Total en Stock</p>
                      <p className="text-3xl font-bold text-gray-900">{resumen.total_piezas.toLocaleString()}</p>
                      <p className="text-xs text-gray-400 mt-1">piezas</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-blue-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Con Precio</p>
                      <p className="text-3xl font-bold text-green-600">{resumen.piezas_con_precio.toLocaleString()}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {resumen.total_piezas > 0 
                          ? `${Math.round((resumen.piezas_con_precio / resumen.total_piezas) * 100)}%` 
                          : '0%'}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Valor total - solo para owner/sysowner */}
                {puedeVerValores && (
                  <>
                    <div className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Valor del Stock</p>
                          <p className="text-2xl font-bold text-purple-600">{formatCurrency(resumen.valor_total)}</p>
                          <p className="text-xs text-gray-400 mt-1">total inventario</p>
                        </div>
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-purple-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">Precio Medio</p>
                          <p className="text-2xl font-bold text-amber-600">{formatCurrency(resumen.precio_medio)}</p>
                          <p className="text-xs text-gray-400 mt-1">por pieza</p>
                        </div>
                        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-amber-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            
            {/* Info para usuarios que no ven valores */}
            {resumen && resumen.tiene_base && !puedeVerValores && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-600">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      Inventario de piezas en stock
                    </p>
                    <p className="text-xs text-blue-600">
                      Usa el buscador para encontrar piezas específicas por referencia, OEM, artículo, marca o modelo.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* No hay base de datos */}
            {resumen && !resumen.tiene_base && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-yellow-500 mx-auto mb-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <h3 className="text-lg font-bold text-yellow-800 mb-2">No hay base de datos cargada</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  Sube un archivo CSV con las piezas del inventario desde la sección "Base de Datos Desguace".
                </p>
                <button
                  onClick={() => router.push('/admin/base-desguace')}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Ir a Base de Datos
                </button>
              </div>
            )}

            {/* Tabla de stock */}
            {resumen?.tiene_base && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-gray-900">
                          Piezas en Stock
                        </h2>
                        {user.rol === 'sysowner' && selectedEmpresa && (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                            {getEmpresaNombre()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-medium">
                          {total.toLocaleString()} pieza{total !== 1 ? 's' : ''}
                        </span>
                        <button
                          onClick={exportarCSV}
                          disabled={exportando || piezas.length === 0}
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
                    
                    {/* Filtros */}
                    <div className="flex flex-wrap items-end gap-3">
                      {/* Búsqueda por texto */}
                      <div className="flex-1 min-w-[300px]">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Referencia, OEM, artículo, marca, modelo..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setOffset(0);
                                setBusquedaActiva(busqueda);
                              }
                            }}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400 absolute left-3 top-2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                          </svg>
                        </div>
                      </div>
                      
                      {/* Botones */}
                      <button
                        onClick={() => {
                          setOffset(0);
                          setBusquedaActiva(busqueda);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Buscar
                      </button>
                      {busquedaActiva && (
                        <button
                          onClick={() => {
                            setBusqueda('');
                            setBusquedaActiva('');
                            setOffset(0);
                          }}
                          className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          Limpiar
                        </button>
                      )}
                    </div>
                    
                    {/* Indicadores de filtros activos */}
                    {busquedaActiva && (
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Buscando: "{busquedaActiva}"
                        </span>
                      </div>
                    )}
                    
                    {/* Resumen de resultados de búsqueda */}
                    {busquedaActiva && piezas.length > 0 && (
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-blue-800">
                                {total.toLocaleString()} pieza{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
                              </p>
                              <p className="text-xs text-blue-600">
                                Coinciden con "{busquedaActiva}"
                              </p>
                            </div>
                          </div>
                          {puedeVerValores && (
                            <div className="text-right">
                              <p className="text-xs text-blue-600">Valor total</p>
                              <p className="text-xl font-bold text-blue-700">{formatCurrency(sumaPreciosPiezas)}</p>
                              <p className="text-xs text-blue-500">(página actual: {piezas.length} piezas)</p>
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
                ) : piezas.length === 0 ? (
                  <div className="text-center py-12">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-gray-300 mx-auto mb-3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <p className="text-gray-500 font-medium">No se encontraron piezas</p>
                    <p className="text-gray-400 text-sm mt-1">
                      {busquedaActiva ? 'Intenta con otros términos de búsqueda' : 'No hay piezas en el inventario'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Imagen</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Entrada</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ref ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Artículo</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">OEM</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Marca/Modelo</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Precio</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ubicación</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {piezas.map((pieza) => {
                          const imagenes = getImagenes(pieza.imagen);
                          return (
                          <tr key={pieza.id} className="hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => setPiezaDetalle(pieza)}>
                            <td className="px-4 py-3">
                              {imagenes.length > 0 ? (
                                <div className="relative">
                                  <img 
                                    src={imagenes[0]} 
                                    alt="Pieza" 
                                    className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                  {getCantidadMismoOem(pieza) > 1 && (
                                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold" title={`${getCantidadMismoOem(pieza)} piezas con OEM: ${pieza.oem}`}>
                                      {getCantidadMismoOem(pieza)}
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
                            <td className="px-4 py-3 text-xs text-gray-600">
                              <div>{pieza.fecha_fichaje ? new Date(pieza.fecha_fichaje).toLocaleDateString('es-ES') : (pieza.fecha_creacion ? new Date(pieza.fecha_creacion).toLocaleDateString('es-ES') : '-')}</div>
                              {pieza.usuario_fichaje && (
                                <div className="text-gray-400 truncate max-w-[80px]" title={pieza.usuario_fichaje}>{pieza.usuario_fichaje}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-mono font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                {pieza.refid || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                              <div className="truncate" title={pieza.articulo || ''}>
                                {pieza.articulo || '-'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                              {pieza.oem || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              <div>{pieza.marca || '-'}</div>
                              <div className="text-xs text-gray-400">{pieza.modelo || ''}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-bold text-green-600">
                                {formatCurrency(pieza.precio)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {pieza.ubicacion || '-'}
                            </td>
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setPiezaDetalle(pieza)}
                                className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-100 rounded"
                                title="Ver detalle"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                </svg>
                              </button>
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
                  <div className="p-4 border-t flex flex-wrap justify-between items-center gap-4">
                    <p className="text-sm text-gray-500">
                      Mostrando {offset + 1} - {Math.min(offset + limit, total)} de {total.toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setOffset(Math.max(0, offset - limit))}
                        disabled={offset === 0}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 rounded-lg text-sm"
                      >
                        Anterior
                      </button>
                      
                      {/* Selector de página */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Página</span>
                        <input
                          type="number"
                          min={1}
                          max={Math.ceil(total / limit)}
                          value={Math.floor(offset / limit) + 1}
                          onChange={(e) => {
                            const page = parseInt(e.target.value) || 1;
                            const maxPage = Math.ceil(total / limit);
                            const validPage = Math.min(Math.max(1, page), maxPage);
                            setOffset((validPage - 1) * limit);
                          }}
                          className="w-16 px-2 py-2 border rounded-lg text-sm text-center"
                        />
                        <span className="text-sm text-gray-500">de {Math.ceil(total / limit).toLocaleString()}</span>
                      </div>
                      
                      <button
                        onClick={() => setOffset(offset + limit)}
                        disabled={offset + limit >= total}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 rounded-lg text-sm"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal de detalle */}
      {piezaDetalle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setPiezaDetalle(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header del modal */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Detalle de Pieza</h3>
                    <p className="text-blue-100 text-sm">En stock</p>
                  </div>
                </div>
                <button
                  onClick={() => setPiezaDetalle(null)}
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
                const imagenes = getImagenes(piezaDetalle.imagen);
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
                  <p className="text-xl font-bold font-mono text-blue-800">{piezaDetalle.refid || '-'}</p>
                </div>
                
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 font-medium mb-1">Artículo</p>
                  <p className="text-sm font-semibold text-gray-800">{piezaDetalle.articulo || '-'}</p>
                </div>
                
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-xs text-green-600 font-medium mb-1">Precio</p>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(piezaDetalle.precio)}</p>
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
                    <p className="text-sm font-mono font-medium text-gray-800">{piezaDetalle.oem || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">OE</p>
                    <p className="text-sm font-mono font-medium text-gray-800">{piezaDetalle.oe || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">IAM</p>
                    <p className="text-sm font-mono font-medium text-gray-800">{piezaDetalle.iam || '-'}</p>
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
                    <p className="text-sm font-medium text-gray-800">{piezaDetalle.marca || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Modelo</p>
                    <p className="text-sm font-medium text-gray-800">{piezaDetalle.modelo || '-'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Versión</p>
                    <p className="text-sm font-medium text-gray-800">{piezaDetalle.version || '-'}</p>
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
                  <p className="text-sm font-semibold text-amber-800">{piezaDetalle.ubicacion || 'No especificada'}</p>
                </div>
                
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-xs text-purple-600 font-medium mb-1 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                    Observaciones
                  </p>
                  <p className="text-sm text-purple-800">{piezaDetalle.observaciones || 'Sin observaciones'}</p>
                </div>
              </div>
            </div>

            {/* Footer del modal */}
            <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setPiezaDetalle(null)}
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

