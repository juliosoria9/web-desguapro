'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Pieza {
  id: number;
  refid: string;
  oem: string;
  articulo: string;
  precio: number | null;
  precio_mercado: number | null;
  imagen: string | null;
  ubicacion: string | null;
  fichada: boolean;
}

interface ArticuloZona {
  nombre: string;
  cantidad: number;
}

interface ZonasResumen {
  frontal: number;
  trasera: number;
  carroceria: number;
  mecanica: number;
  valor_frontal: number;
  valor_trasera: number;
  valor_carroceria: number;
  valor_mecanica: number;
  articulos_frontal?: ArticuloZona[];
  articulos_trasera?: ArticuloZona[];
  articulos_carroceria?: ArticuloZona[];
  articulos_mecanica?: ArticuloZona[];
}

interface ResumenCoche {
  total_piezas: number;
  piezas_con_precio: number;
  piezas_fichadas: number;
  piezas_vendidas: number;
  tiempo_medio_venta: number | null;
  valor_stock: number;
  valor_mercado: number | null;
  zonas?: ZonasResumen;
}

export default function EstudioCochesPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [buscandoPrecios, setBuscandoPrecios] = useState(false);
  
  // Estado para empresas (sysowner)
  const [empresas, setEmpresas] = useState<{id: number, nombre: string}[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
  
  // Selectores cascada
  const [marcas, setMarcas] = useState<string[]>([]);
  const [modelos, setModelos] = useState<string[]>([]);
  const [versiones, setVersiones] = useState<string[]>([]);
  
  const [marcaSeleccionada, setMarcaSeleccionada] = useState('');
  const [modeloSeleccionado, setModeloSeleccionado] = useState('');
  const [versionSeleccionada, setVersionSeleccionada] = useState('');
  
  // Datos del coche seleccionado
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [resumen, setResumen] = useState<ResumenCoche | null>(null);
  
  // Filtro de piezas
  const [filtroPieza, setFiltroPieza] = useState('');

  const esAdmin = user?.rol && ['admin', 'owner', 'sysowner'].includes(user.rol);
  const esSysowner = user?.rol === 'sysowner';

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && user) {
      if (!esAdmin) {
        toast.error('No tienes permisos para acceder a esta sección');
        router.push('/dashboard');
        return;
      }
      if (esSysowner) {
        fetchEmpresas();
      } else {
        cargarMarcas();
      }
    }
  }, [mounted, user]);

  useEffect(() => {
    if (esSysowner && selectedEmpresa) {
      cargarMarcas();
    }
  }, [selectedEmpresa]);

  // Cuando cambia la marca, cargar modelos
  useEffect(() => {
    if (marcaSeleccionada) {
      cargarModelos(marcaSeleccionada);
      setModeloSeleccionado('');
      setVersionSeleccionada('');
      setPiezas([]);
      setResumen(null);
    }
  }, [marcaSeleccionada]);

  // Cuando cambia el modelo, cargar versiones y piezas (todas las versiones)
  useEffect(() => {
    if (marcaSeleccionada && modeloSeleccionado) {
      cargarVersiones(marcaSeleccionada, modeloSeleccionado);
      setVersionSeleccionada('');
      cargarPiezas(); // Cargar piezas de todas las versiones
    }
  }, [modeloSeleccionado]);

  // Cuando cambia la versión, cargar piezas
  useEffect(() => {
    if (marcaSeleccionada && modeloSeleccionado) {
      cargarPiezas();
    }
  }, [versionSeleccionada]);

  const fetchEmpresas = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/entornos`,
        { withCredentials: true }
      );
      setEmpresas(response.data);
      if (response.data.length > 0) {
        setSelectedEmpresa(response.data[0].id);
      }
    } catch (error) {
      console.error('Error cargando empresas:', error);
    }
  };

  const getEntornoParam = () => {
    return esSysowner && selectedEmpresa ? `&entorno_id=${selectedEmpresa}` : '';
  };

  const cargarMarcas = async () => {
    setCargando(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/desguace/estudio-coches/marcas?_=1${getEntornoParam()}`,
        { withCredentials: true }
      );
      setMarcas(response.data.marcas || []);
    } catch (error) {
      console.error('Error cargando marcas:', error);
    } finally {
      setCargando(false);
    }
  };

  const cargarModelos = async (marca: string) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/desguace/estudio-coches/modelos?marca=${encodeURIComponent(marca)}${getEntornoParam()}`,
        { withCredentials: true }
      );
      setModelos(response.data.modelos || []);
    } catch (error) {
      console.error('Error cargando modelos:', error);
    }
  };

  const cargarVersiones = async (marca: string, modelo: string) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/desguace/estudio-coches/versiones?marca=${encodeURIComponent(marca)}&modelo=${encodeURIComponent(modelo)}${getEntornoParam()}`,
        { withCredentials: true }
      );
      setVersiones(response.data.versiones || []);
    } catch (error) {
      console.error('Error cargando versiones:', error);
    }
  };

  const cargarPiezas = async () => {
    if (!marcaSeleccionada || !modeloSeleccionado) return;
    
    setCargando(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/desguace/estudio-coches/piezas?marca=${encodeURIComponent(marcaSeleccionada)}&modelo=${encodeURIComponent(modeloSeleccionado)}`;
      if (versionSeleccionada) {
        url += `&version=${encodeURIComponent(versionSeleccionada)}`;
      }
      url += getEntornoParam();
      
      const response = await axios.get(url, { withCredentials: true });
      setPiezas(response.data.piezas || []);
      setResumen(response.data.resumen || null);
    } catch (error) {
      console.error('Error cargando piezas:', error);
      toast.error('Error al cargar piezas');
    } finally {
      setCargando(false);
    }
  };

  const buscarPreciosMercado = async () => {
    if (piezas.length === 0) return;
    
    setBuscandoPrecios(true);
    toast.loading('Buscando precios en el mercado...', { id: 'buscando-precios' });
    
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/desguace/estudio-coches/buscar-precios?marca=${encodeURIComponent(marcaSeleccionada)}&modelo=${encodeURIComponent(modeloSeleccionado)}`;
      if (versionSeleccionada) {
        url += `&version=${encodeURIComponent(versionSeleccionada)}`;
      }
      url += getEntornoParam();
      
      const response = await axios.post(url, {}, { withCredentials: true });
      
      // Actualizar piezas con precios de mercado
      if (response.data.piezas) {
        setPiezas(response.data.piezas);
      }
      if (response.data.resumen) {
        setResumen(response.data.resumen);
      }
      
      toast.success(`Precios actualizados para ${response.data.piezas_actualizadas || 0} piezas`, { id: 'buscando-precios' });
    } catch (error: any) {
      console.error('Error buscando precios:', error);
      toast.error('Error al buscar precios en el mercado', { id: 'buscando-precios' });
    } finally {
      setBuscandoPrecios(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
  };

  // Filtrar piezas
  const piezasFiltradas = piezas.filter(p => 
    p.articulo?.toLowerCase().includes(filtroPieza.toLowerCase()) ||
    p.oem?.toLowerCase().includes(filtroPieza.toLowerCase()) ||
    p.refid?.toLowerCase().includes(filtroPieza.toLowerCase())
  );

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
                onClick={() => router.push('/dashboard')}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Estudio Coches</h1>
                <p className="text-xs text-gray-500">Análisis de piezas por vehículo</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Selector de empresa para sysowner */}
              {esSysowner && empresas.length > 0 && (
                <select
                  value={selectedEmpresa || ''}
                  onChange={(e) => {
                    setSelectedEmpresa(Number(e.target.value));
                    setMarcaSeleccionada('');
                    setModeloSeleccionado('');
                    setVersionSeleccionada('');
                    setPiezas([]);
                    setResumen(null);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {empresas.map((empresa) => (
                    <option key={empresa.id} value={empresa.id}>
                      {empresa.nombre}
                    </option>
                  ))}
                </select>
              )}
              
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{user.email}</p>
                <p className="text-xs text-gray-500">{user.rol}</p>
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
        {/* Selectores de vehículo */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Selecciona un vehículo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Selector Marca */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
              <select
                value={marcaSeleccionada}
                onChange={(e) => setMarcaSeleccionada(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={cargando}
              >
                <option value="">-- Selecciona marca --</option>
                {marcas.map((marca) => (
                  <option key={marca} value={marca}>{marca}</option>
                ))}
              </select>
            </div>

            {/* Selector Modelo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
              <select
                value={modeloSeleccionado}
                onChange={(e) => setModeloSeleccionado(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!marcaSeleccionada || cargando}
              >
                <option value="">-- Selecciona modelo --</option>
                {modelos.map((modelo) => (
                  <option key={modelo} value={modelo}>{modelo}</option>
                ))}
              </select>
            </div>

            {/* Selector Versión/Año */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Versión / Año</label>
              <select
                value={versionSeleccionada}
                onChange={(e) => setVersionSeleccionada(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!modeloSeleccionado || cargando}
              >
                <option value="">-- Todas las versiones --</option>
                {versiones.map((version) => (
                  <option key={version} value={version}>{version}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Resumen del coche */}
        {resumen && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {marcaSeleccionada} {modeloSeleccionado} {versionSeleccionada}
              </h2>
              <button
                onClick={buscarPreciosMercado}
                disabled={buscandoPrecios || piezas.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {buscandoPrecios ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Buscando...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Buscar Precios en Internet
                  </>
                )}
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{resumen.total_piezas}</div>
                <div className="text-sm text-gray-600">Total Piezas</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {resumen.tiempo_medio_venta !== null && resumen.tiempo_medio_venta !== undefined
                    ? `${resumen.tiempo_medio_venta} días` 
                    : 'N/A'}
                </div>
                <div className="text-sm text-gray-600">Rotación</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{resumen.piezas_vendidas}</div>
                <div className="text-sm text-gray-600">Vendidas</div>
              </div>
              <div className="text-center p-4 bg-teal-50 rounded-lg">
                <div className="text-2xl font-bold text-teal-600">{formatCurrency(resumen.valor_stock)}</div>
                <div className="text-sm text-gray-600">Valor Stock</div>
              </div>
              <div className="text-center p-4 bg-indigo-50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-600">
                  {resumen.valor_mercado !== null ? formatCurrency(resumen.valor_mercado) : '?'}
                </div>
                <div className="text-sm text-gray-600">Valor Mercado</div>
              </div>
            </div>
          </div>
        )}

        {/* Análisis por zonas del coche */}
        {resumen?.zonas && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Análisis por Zonas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Frontal */}
              <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3 className="font-medium text-gray-800">Frontal</h3>
                  </div>
                  <span className="text-2xl font-bold text-red-600">{resumen.zonas.frontal}</span>
                </div>
                <div className="text-sm font-medium text-red-700 mb-3">
                  {formatCurrency(resumen.zonas.valor_frontal)}
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {resumen.zonas.articulos_frontal?.map((art, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-600 truncate mr-2">{art.nombre}</span>
                      <span className="text-red-600 font-medium whitespace-nowrap">×{art.cantidad}</span>
                    </div>
                  ))}
                  {(!resumen.zonas.articulos_frontal || resumen.zonas.articulos_frontal.length === 0) && (
                    <span className="text-xs text-gray-400">Sin piezas</span>
                  )}
                </div>
                {resumen.zonas.frontal < 5 && resumen.zonas.frontal > 0 && (
                  <div className="mt-3 px-2 py-1 bg-red-100 text-red-700 text-xs rounded-lg flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Buscar coche con trasera dañada
                  </div>
                )}
              </div>

              {/* Trasera */}
              <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                      </svg>
                    </div>
                    <h3 className="font-medium text-gray-800">Trasera</h3>
                  </div>
                  <span className="text-2xl font-bold text-amber-600">{resumen.zonas.trasera}</span>
                </div>
                <div className="text-sm font-medium text-amber-700 mb-3">
                  {formatCurrency(resumen.zonas.valor_trasera)}
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {resumen.zonas.articulos_trasera?.map((art, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-600 truncate mr-2">{art.nombre}</span>
                      <span className="text-amber-600 font-medium whitespace-nowrap">×{art.cantidad}</span>
                    </div>
                  ))}
                  {(!resumen.zonas.articulos_trasera || resumen.zonas.articulos_trasera.length === 0) && (
                    <span className="text-xs text-gray-400">Sin piezas</span>
                  )}
                </div>
                {resumen.zonas.trasera < 5 && resumen.zonas.trasera > 0 && (
                  <div className="mt-3 px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-lg flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Buscar coche con frontal dañado
                  </div>
                )}
              </div>

              {/* Carrocería */}
              <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                      </svg>
                    </div>
                    <h3 className="font-medium text-gray-800">Carrocería</h3>
                  </div>
                  <span className="text-2xl font-bold text-blue-600">{resumen.zonas.carroceria}</span>
                </div>
                <div className="text-sm font-medium text-blue-700 mb-3">
                  {formatCurrency(resumen.zonas.valor_carroceria)}
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {resumen.zonas.articulos_carroceria?.map((art, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-600 truncate mr-2">{art.nombre}</span>
                      <span className="text-blue-600 font-medium whitespace-nowrap">×{art.cantidad}</span>
                    </div>
                  ))}
                  {(!resumen.zonas.articulos_carroceria || resumen.zonas.articulos_carroceria.length === 0) && (
                    <span className="text-xs text-gray-400">Sin piezas</span>
                  )}
                </div>
              </div>

              {/* Mecánica */}
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h3 className="font-medium text-gray-800">Mecánica</h3>
                  </div>
                  <span className="text-2xl font-bold text-gray-600">{resumen.zonas.mecanica}</span>
                </div>
                <div className="text-sm font-medium text-gray-700 mb-3">
                  {formatCurrency(resumen.zonas.valor_mecanica)}
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {resumen.zonas.articulos_mecanica?.slice(0, 10).map((art, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-600 truncate mr-2">{art.nombre}</span>
                      <span className="text-gray-600 font-medium whitespace-nowrap">×{art.cantidad}</span>
                    </div>
                  ))}
                  {resumen.zonas.articulos_mecanica && resumen.zonas.articulos_mecanica.length > 10 && (
                    <span className="text-xs text-gray-400">+{resumen.zonas.articulos_mecanica.length - 10} más</span>
                  )}
                  {(!resumen.zonas.articulos_mecanica || resumen.zonas.articulos_mecanica.length === 0) && (
                    <span className="text-xs text-gray-400">Sin piezas</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lista de piezas */}
        {piezas.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">
                Piezas ({piezasFiltradas.length})
              </h2>
              <input
                type="text"
                placeholder="Filtrar piezas..."
                value={filtroPieza}
                onChange={(e) => setFiltroPieza(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imagen</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Artículo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OEM</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ubicación</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Precio Stock</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Precio Mercado</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Fichada</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {piezasFiltradas.map((pieza) => (
                    <tr key={pieza.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {pieza.imagen ? (
                          <img 
                            src={pieza.imagen.split(',')[0].trim()} 
                            alt={pieza.articulo}
                            className="w-12 h-12 object-cover rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder.png';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm font-mono text-gray-900">{pieza.refid}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{pieza.articulo}</td>
                      <td className="px-4 py-2 text-sm font-mono text-gray-600">{pieza.oem || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-600">{pieza.ubicacion || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-gray-900">
                        {formatCurrency(pieza.precio)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-indigo-600">
                        {pieza.precio_mercado ? formatCurrency(pieza.precio_mercado) : '-'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {pieza.fichada ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Estado vacío */}
        {!cargando && marcaSeleccionada && modeloSeleccionado && piezas.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500">No hay piezas para este vehículo</p>
          </div>
        )}

        {/* Cargando */}
        {cargando && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando...</p>
          </div>
        )}
      </main>
    </div>
  );
}
