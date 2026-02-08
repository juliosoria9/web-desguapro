'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface PrecioResumen {
  media: number;
  mediana: number;
  minimo: number;
  maximo: number;
  desviacion_estandar: number;
  cantidad_precios: number;
  outliers_removidos: number;
}

interface PrecioSugerido {
  familia: string;
  precio_sugerido: number;
  precios_familia: number[];
  precio_mercado: number;
}

interface PiezaInventario {
  id: number;
  refid: string | null;
  oem: string | null;
  articulo: string | null;
  marca: string | null;
  modelo: string | null;
  precio: number | null;
  ubicacion?: string | null;
  imagen?: string | null;
  fecha_venta?: string | null;
  fecha_fichaje?: string | null;
  dias_rotacion?: number | null;
}

interface InfoInventario {
  en_stock: number;
  vendidas: number;
  piezas_stock: PiezaInventario[];
  piezas_vendidas: PiezaInventario[];
}

interface PlataformaResultado {
  plataforma_id: string;
  plataforma_nombre: string;
  precios: number[];
  cantidad_precios: number;
  precio_minimo: number | null;
  precio_maximo: number | null;
  precio_medio: number | null;
  imagenes: string[];
  error: string | null;
}

interface SearchResult {
  referencia: string;
  plataforma: string;
  precios: number[];
  resumen: PrecioResumen;
  total_en_mercado?: number;
  imagenes: string[];
  sugerencia?: PrecioSugerido;
  inventario?: InfoInventario;
  tipo_pieza?: string;
  referencias_iam?: string[];
  referencias_iam_texto?: string;
  // Nuevos campos multi-plataforma
  resultados_por_plataforma?: PlataformaResultado[];
  plataformas_consultadas?: number;
  plataformas_con_resultados?: number;
  // Indica si la empresa tiene configuración de precios
  configuracion_precios_activa?: boolean;
}

const PLATAFORMAS_DISPONIBLES = [
  { id: 'todas', nombre: '⊕ Todas (progresivo)' },
  { id: 'ecooparts', nombre: 'Ecooparts' },
  { id: 'recambioverde', nombre: 'Recambio Verde' },
  { id: 'opisto', nombre: 'Opisto' },
  { id: 'ebay', nombre: 'eBay' },
  { id: 'ovoko', nombre: 'Ovoko (~10s)' },
  { id: 'partsss', nombre: 'Partsss (motos piezas nuevas)' },
  { id: 'motomine', nombre: 'Motomine (motos UK)' },
];

// Función para formatear tiempo relativo
const formatTiempoRelativo = (fecha: string): string => {
  const ahora = new Date();
  const fechaVenta = new Date(fecha);
  const diffMs = ahora.getTime() - fechaVenta.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDias === 0) return 'hoy';
  if (diffDias === 1) return 'ayer';
  if (diffDias < 7) return `${diffDias}d`;
  if (diffDias < 30) return `${Math.floor(diffDias / 7)}sem`;
  if (diffDias < 365) return `${Math.floor(diffDias / 30)}mes`;
  if (diffDias < 730) return '1año';
  return '+1año';
};

// Función para formatear rotación con color
const getRotacionColor = (dias: number): string => {
  if (dias <= 7) return 'text-green-600';
  if (dias <= 30) return 'text-yellow-600';
  if (dias <= 90) return 'text-orange-600';
  return 'text-red-600';
};

export default function SearchPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [plataforma, setPlataforma] = useState('todas');
  const [cantidadPiezas, setCantidadPiezas] = useState(20);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLentas, setLoadingLentas] = useState(false);
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null);
  
  // Estado para fichar pieza
  const [idFichada, setIdFichada] = useState('');
  const [guardandoFichada, setGuardandoFichada] = useState(false);
  
  // Estado para modal de fichar con comentario
  const [showModalFichada, setShowModalFichada] = useState(false);
  const [idFichadaModal, setIdFichadaModal] = useState('');
  const [comentarioFichada, setComentarioFichada] = useState('');

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) {
      toast.error('Ingresa una referencia a buscar');
      return;
    }

    setLoading(true);
    setLoadingLentas(false);
    setResult(null);
    
    try {
      const ref = searchTerm.trim();
      
      if (plataforma === 'todas') {
        // Búsqueda progresiva: primero rápidas, luego lentas en paralelo
        
        // 1. Buscar en plataformas rápidas
        const responseRapidas = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/precios/buscar`,
          { 
            referencia: ref,
            plataforma: 'todas',
            cantidad: cantidadPiezas,
            incluir_bparts: false,
            incluir_ovoko: false
          },
          { withCredentials: true }
        );
        
        setResult(responseRapidas.data);
        setLoading(false);
        toast.success(`Rápidas: ${responseRapidas.data.precios?.length || 0} precios`);
        
        // 2. Buscar en plataformas lentas en paralelo (background)
        setLoadingLentas(true);
        
        const buscarLentas = async () => {
          const resultadosLentos: any[] = [];
          
          // Buscar Ovoko en paralelo
          const promesas = [
            axios.post(
              `${process.env.NEXT_PUBLIC_API_URL}/api/v1/precios/buscar`,
              { referencia: ref, plataforma: 'ovoko', cantidad: cantidadPiezas, incluir_bparts: false, incluir_ovoko: false },
              { withCredentials: true }
            ).catch(e => ({ data: null, error: 'ovoko' }))
          ];
          
          const resultados = await Promise.all(promesas);
          
          // Combinar resultados
          setResult(prev => {
            if (!prev) return prev;
            
            let nuevosPrecios = [...(prev.precios || [])];
            let nuevasImagenes = [...(prev.imagenes || [])];
            let nuevosResultados = [...(prev.resultados_por_plataforma || [])];
            
            resultados.forEach((res: any) => {
              if (res.data && res.data.precios) {
                nuevosPrecios = [...nuevosPrecios, ...res.data.precios];
                nuevasImagenes = [...nuevasImagenes, ...(res.data.imagenes || [])];
                if (res.data.resultados_por_plataforma) {
                  nuevosResultados = [...nuevosResultados, ...res.data.resultados_por_plataforma];
                }
              }
            });
            
            // Recalcular estadísticas
            const preciosLimpios = nuevosPrecios.filter(p => p > 0);
            const media = preciosLimpios.length > 0 
              ? preciosLimpios.reduce((a, b) => a + b, 0) / preciosLimpios.length 
              : 0;
            const sorted = [...preciosLimpios].sort((a, b) => a - b);
            const mediana = sorted.length > 0 
              ? sorted[Math.floor(sorted.length / 2)] 
              : 0;
            
            return {
              ...prev,
              precios: nuevosPrecios,
              imagenes: [...new Set(nuevasImagenes)],
              resultados_por_plataforma: nuevosResultados,
              resumen: {
                ...prev.resumen,
                media: Math.round(media * 100) / 100,
                mediana: Math.round(mediana * 100) / 100,
                minimo: Math.min(...preciosLimpios) || 0,
                maximo: Math.max(...preciosLimpios) || 0,
                cantidad_precios: preciosLimpios.length
              },
              plataformas_consultadas: (prev.plataformas_consultadas || 3) + 1,
              plataformas_con_resultados: nuevosResultados.filter(r => r.cantidad_precios > 0).length
            };
          });
          
          const lentosConPrecios = resultados.filter((r: any) => r.data?.precios?.length > 0).length;
          if (lentosConPrecios > 0) {
            toast.success(`+${resultados.reduce((acc: number, r: any) => acc + (r.data?.precios?.length || 0), 0)} precios de Ovoko`);
          }
          
          setLoadingLentas(false);
        };
        
        buscarLentas();
        
      } else {
        // Búsqueda en una sola plataforma
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/precios/buscar`,
          { 
            referencia: ref,
            plataforma: plataforma,
            cantidad: cantidadPiezas,
            incluir_bparts: false,
            incluir_ovoko: false
          },
          { withCredentials: true }
        );
        setResult(response.data);
        toast.success(`Se encontraron ${response.data.precios?.length || 0} precios`);
        setLoading(false);
      }
    } catch (error: any) {
      console.error('Error en búsqueda:', error);
      const errorMsg = error.response?.data?.detail || 'Error en la búsqueda';
      if (error.response?.status === 404) {
        toast.error(`No se encontraron precios para "${searchTerm}" en ${plataforma}`);
      } else if (error.response?.status === 400) {
        toast.error(errorMsg);
      } else {
        toast.error(errorMsg);
      }
      setLoading(false);
      setLoadingLentas(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const guardarFichada = async () => {
    if (!idFichada.trim()) {
      toast.error('Introduce un ID de pieza');
      return;
    }
    setGuardandoFichada(true);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/registrar`,
        { id_pieza: idFichada.trim() },
        { withCredentials: true }
      );
      toast.success(`Fichada: ${idFichada.trim().toUpperCase()}`);
      setIdFichada('');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al guardar');
    } finally {
      setGuardandoFichada(false);
    }
  };

  const guardarFichadaConComentario = async () => {
    if (!idFichadaModal.trim()) {
      toast.error('Introduce un ID de pieza');
      return;
    }
    setGuardandoFichada(true);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/registrar`,
        { 
          id_pieza: idFichadaModal.trim(),
          descripcion: comentarioFichada.trim() || null
        },
        { withCredentials: true }
      );
      toast.success(`Fichada: ${idFichadaModal.trim().toUpperCase()}`);
      setIdFichadaModal('');
      setComentarioFichada('');
      setShowModalFichada(false);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Error al guardar');
    } finally {
      setGuardandoFichada(false);
    }
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
                <h1 className="text-xl font-bold text-gray-900">
                  DesguaPro
                </h1>
                <p className="text-xs text-gray-500">Buscar Precios</p>
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
        <div className="bg-white rounded-lg shadow p-4">
          <form onSubmit={handleSearch} className="mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium text-gray-700 mb-1">Referencia</label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Ej: 1K0959653C"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                />
              </div>

              <div className="w-36">
                <label className="block text-xs font-medium text-gray-700 mb-1">Plataforma</label>
                <select
                  value={plataforma}
                  onChange={(e) => setPlataforma(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                >
                  {PLATAFORMAS_DISPONIBLES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-32">
                <label className="block text-xs font-medium text-gray-700 mb-1">Piezas</label>
                <select
                  value={cantidadPiezas}
                  onChange={(e) => setCantidadPiezas(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                >
                  <option value={10}>10</option>
                  <option value={20}>20 ✓</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors font-semibold text-sm"
              >
                {loading ? 'Buscando...' : 'Buscar'}
              </button>

              {/* Indicador de carga de plataformas lentas */}
              {loadingLentas && (
                <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-lg">
                  <div className="animate-spin w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full"></div>
                  <span>Cargando Ovoko...</span>
                </div>
              )}

              {/* Separador */}
              <div className="hidden sm:block w-px h-8 bg-gray-300"></div>

              {/* Fichar pieza */}
              <div className="flex items-end gap-2">
                <div className="w-28">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fichar ID</label>
                  <input
                    type="text"
                    value={idFichada}
                    onChange={(e) => setIdFichada(e.target.value)}
                    placeholder="ID pieza"
                    className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        guardarFichada();
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={guardarFichada}
                  disabled={guardandoFichada}
                  className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white px-3 py-2 rounded-lg transition-colors text-sm"
                >
                  {guardandoFichada ? '...' : 'Fichar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModalFichada(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-1"
                  title="Fichar con comentario"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  <span className="hidden sm:inline">+</span>
                </button>
              </div>
            </div>
          </form>

          {result && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Resultados: <span className="text-blue-600">{result.referencia}</span>
                {result.inventario && result.inventario.piezas_stock.length > 0 ? (
                  <span className="text-sm font-normal text-gray-600 ml-3">
                    {result.inventario.piezas_stock[0].articulo && (
                      <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-md mr-2">
                        {result.inventario.piezas_stock[0].articulo}
                      </span>
                    )}
                    {(result.inventario.piezas_stock[0].marca || result.inventario.piezas_stock[0].modelo) && (
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md">
                        {[result.inventario.piezas_stock[0].marca, result.inventario.piezas_stock[0].modelo].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </span>
                ) : result.tipo_pieza && (
                  <span className="text-sm font-normal text-gray-600 ml-3">
                    <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-md">
                      {result.tipo_pieza}
                    </span>
                  </span>
                )}
              </h3>

              {/* Resumen estadístico */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600">Promedio</p>
                  <p className="text-xl font-bold text-blue-600">€{result.resumen.media.toFixed(2)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600">Mínimo</p>
                  <p className="text-xl font-bold text-green-600">€{result.resumen.minimo.toFixed(2)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600">Máximo</p>
                  <p className="text-xl font-bold text-red-600">€{result.resumen.maximo.toFixed(2)}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600">Piezas</p>
                  <p className="text-xl font-bold text-purple-600">
                    {(result.total_en_mercado || result.resumen.cantidad_precios) >= 180 
                      ? '+180' 
                      : (result.total_en_mercado || result.resumen.cantidad_precios)}
                  </p>
                </div>
              </div>

              {/* Resultados por plataforma */}
              {result.resultados_por_plataforma && result.resultados_por_plataforma.length > 1 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">
                      Precios por plataforma
                    </h4>
                    <span className="text-xs text-gray-500">
                      ({result.plataformas_con_resultados}/{result.plataformas_consultadas} con resultados)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {result.resultados_por_plataforma.map((plat) => (
                      <div 
                        key={plat.plataforma_id}
                        className={`rounded-lg p-3 border ${
                          plat.cantidad_precios > 0 
                            ? 'bg-white border-gray-200' 
                            : 'bg-gray-50 border-gray-100'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700">{plat.plataforma_nombre}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            plat.cantidad_precios > 0 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {plat.cantidad_precios}
                          </span>
                        </div>
                        {plat.cantidad_precios > 0 ? (
                          <div>
                            <div className="text-lg font-bold text-gray-900">
                              €{plat.precio_medio?.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500">
                              min €{plat.precio_minimo?.toFixed(2)} · max €{plat.precio_maximo?.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {plat.error || 'Sin resultados'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Badges de inventario compacto - solo si hay datos */}
              {result.inventario && (result.inventario.en_stock > 0 || result.inventario.vendidas > 0) && (
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-gray-500">Tu inventario:</span>
                  {result.inventario.en_stock > 0 && (
                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-medium">
                      {result.inventario.en_stock} en stock
                    </span>
                  )}
                  {result.inventario.vendidas > 0 && (
                    <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-medium">
                      {result.inventario.vendidas} vendida{result.inventario.vendidas !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}

              {/* Referencias IAM equivalentes */}
              {result.referencias_iam_texto && (
                <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-indigo-700">🔄 Ref. IAM equivalentes:</span>
                    <span className="text-sm font-mono text-indigo-900">{result.referencias_iam_texto}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(result.referencias_iam_texto || '');
                        toast.success('Referencias copiadas');
                      }}
                      className="ml-auto text-indigo-600 hover:text-indigo-800 text-xs"
                      title="Copiar referencias"
                    >
                      📋 Copiar
                    </button>
                  </div>
                </div>
              )}

              {/* Precio Sugerido e Imágenes en layout horizontal */}
              {(result.sugerencia || !result.configuracion_precios_activa || (result.imagenes && result.imagenes.length > 0)) && (
                <div className="mb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Precio Sugerido o Mensaje de no configurado */}
                  {result.sugerencia ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-yellow-800">Precio Sugerido</h4>
                        <p className="text-2xl font-bold text-yellow-600">€{result.sugerencia.precio_sugerido.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                        <span>Familia: <span className="font-medium">{result.sugerencia.familia}</span></span>
                        <span>Mercado: €{result.sugerencia.precio_mercado.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {result.sugerencia.precios_familia.map((p, idx) => (
                          <span 
                            key={idx} 
                            className={`px-2 py-0.5 rounded text-xs ${
                              p === result.sugerencia!.precio_sugerido 
                                ? 'bg-yellow-500 text-white font-bold' 
                                : 'bg-white text-gray-600 border'
                            }`}
                          >
                            €{p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : !result.configuracion_precios_activa ? (
                    <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-500">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                        </svg>
                        <h4 className="text-sm font-semibold text-gray-700">Precio Sugerido no disponible</h4>
                      </div>
                      <p className="text-xs text-gray-600">
                        Tu empresa no tiene los archivos de precios configurados.
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Ve a <span className="font-medium">Configuración de Precios</span> para subir los archivos CSV.
                      </p>
                    </div>
                  ) : null}

                  {/* Imágenes */}
                  {result.imagenes && result.imagenes.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Imágenes</h4>
                      <div className="grid grid-cols-3 gap-2">
                        {result.imagenes.slice(0, 3).map((img, idx) => (
                          <img 
                            key={idx} 
                            src={img} 
                            alt={`Imagen ${idx + 1}`} 
                            className="rounded object-cover h-20 w-full shadow hover:shadow-lg transition-shadow cursor-pointer hover:opacity-90"
                            onClick={() => setImagenAmpliada(img)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tabla de precios */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Todos los Precios ({result.precios.length})</h4>
                <div className="grid grid-cols-5 md:grid-cols-8 lg:grid-cols-12 gap-1">
                  {result.precios.map((precio, idx) => (
                    <div key={idx} className="bg-gray-50 rounded p-1.5 text-center">
                      <p className="text-xs font-medium text-gray-700">€{precio.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detalle de inventario propio - al final */}
              {result.inventario && (result.inventario.en_stock > 0 || result.inventario.vendidas > 0) && (
                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    Tu Inventario
                  </h4>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* En Stock */}
                    {result.inventario.en_stock > 0 && (
                      <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-emerald-800">En Stock</span>
                          <span className="text-lg font-bold text-emerald-600">{result.inventario.en_stock}</span>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {result.inventario.piezas_stock.map((p) => (
                            <div key={p.id} className="bg-white rounded p-2 text-xs flex items-center justify-between">
                              <div>
                                <span className="font-mono font-medium text-emerald-700">{p.refid || p.oem}</span>
                                {p.articulo && <span className="text-gray-500 ml-1">{p.articulo}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {p.ubicacion && <span className="text-gray-400">{p.ubicacion}</span>}
                                {p.precio && <span className="font-bold text-emerald-600">€{p.precio.toFixed(2)}</span>}
                              </div>
                            </div>
                          ))}
                          {result.inventario.en_stock > 5 && (
                            <p className="text-xs text-gray-400 text-center pt-1">+{result.inventario.en_stock - 5} más</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Vendidas */}
                    {result.inventario.vendidas > 0 && (
                      <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-orange-800">Vendidas</span>
                          <span className="text-lg font-bold text-orange-600">{result.inventario.vendidas}</span>
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {result.inventario.piezas_vendidas.map((p) => (
                            <div key={p.id} className="bg-white rounded p-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-medium text-orange-700">{p.refid || p.oem}</span>
                                {p.precio && <span className="font-bold text-orange-600">€{p.precio.toFixed(2)}</span>}
                              </div>
                              <div className="flex items-center justify-between mt-1 text-[10px]">
                                <div className="flex items-center gap-2">
                                  {p.fecha_venta && (
                                    <span className="text-gray-500" title={new Date(p.fecha_venta).toLocaleDateString('es-ES')}>
                                      hace {formatTiempoRelativo(p.fecha_venta)}
                                    </span>
                                  )}
                                  {p.dias_rotacion !== null && p.dias_rotacion !== undefined && (
                                    <span className={`font-medium ${getRotacionColor(p.dias_rotacion)}`} title="Tiempo hasta venta">
                                      ⟳{p.dias_rotacion}d
                                    </span>
                                  )}
                                </div>
                                {p.fecha_venta && (
                                  <span className="text-gray-400">{new Date(p.fecha_venta).toLocaleDateString('es-ES')}</span>
                                )}
                              </div>
                            </div>
                          ))}
                          {result.inventario.vendidas > 5 && (
                            <p className="text-xs text-gray-400 text-center pt-1">+{result.inventario.vendidas - 5} más</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!result && !loading && (
            <div className="text-center py-4 text-gray-500 text-sm">
              <p>Realiza una búsqueda para ver los resultados</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal para imagen ampliada */}
      {imagenAmpliada && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4"
          onClick={() => setImagenAmpliada(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <button
              onClick={() => setImagenAmpliada(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-xl font-bold bg-black bg-opacity-50 rounded-full w-8 h-8 flex items-center justify-center"
            >
              ✕
            </button>
            <img 
              src={imagenAmpliada} 
              alt="Imagen ampliada" 
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Modal Fichar con Comentario */}
      {showModalFichada && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModalFichada(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Fichar con Comentario</h3>
              <button
                onClick={() => setShowModalFichada(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID de Pieza *</label>
                <input
                  type="text"
                  value={idFichadaModal}
                  onChange={(e) => setIdFichadaModal(e.target.value)}
                  placeholder="Introduce el ID de la pieza"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comentario (opcional)</label>
                <textarea
                  value={comentarioFichada}
                  onChange={(e) => setComentarioFichada(e.target.value)}
                  placeholder="Añade un comentario o descripción..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModalFichada(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={guardarFichadaConComentario}
                disabled={guardandoFichada || !idFichadaModal.trim()}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
              >
                {guardandoFichada ? 'Guardando...' : 'Fichar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

