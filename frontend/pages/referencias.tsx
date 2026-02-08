'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import ModuloProtegido from '@/components/ModuloProtegido';
import axios from 'axios';
import toast from 'react-hot-toast';

interface ReferenciaItem {
  source: string;
  iam_ref: string;
  brand: string;
  description?: string;
  price?: string;
  image_url?: string;
}

interface ResultadosReferencias {
  [proveedor: string]: ReferenciaItem[];
}

interface BusquedaResponse {
  referencia_oem: string;
  resultados: ResultadosReferencias;
  errores: { [key: string]: string };
  total_encontrados: number;
  proveedores_con_resultados: number;
}

const PROVEEDORES_COLORES: { [key: string]: string } = {
  'Vauner': 'bg-blue-100 border-blue-300 text-blue-800',
  'Triclo': 'bg-green-100 border-green-300 text-green-800',
  'Carser': 'bg-purple-100 border-purple-300 text-purple-800',
  'Flamar': 'bg-orange-100 border-orange-300 text-orange-800',
  'Iparlux': 'bg-yellow-100 border-yellow-300 text-yellow-800',
  'NRF': 'bg-red-100 border-red-300 text-red-800',
  'NTY': 'bg-cyan-100 border-cyan-300 text-cyan-800',
  'Prasco': 'bg-pink-100 border-pink-300 text-pink-800',
};

function ReferenciasContent() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [result, setResult] = useState<BusquedaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null);
  const [showProveedores, setShowProveedores] = useState(false);

  const PROVEEDORES_LISTA = [
    { nombre: 'Vauner', url: 'vauner.es', tipo: 'CSV' },
    { nombre: 'Triclo', url: 'triclo.com', tipo: 'CSV' },
    { nombre: 'Carser', url: 'carser.es', tipo: 'Web' },
    { nombre: 'Flamar', url: 'flamar.es', tipo: 'Web' },
    { nombre: 'Iparlux', url: 'iparlux.es', tipo: 'Web' },
    { nombre: 'NRF', url: 'nfrworldwide.com', tipo: 'Web' },
    { nombre: 'NTY', url: 'distri-auto.es', tipo: 'Web' },
    { nombre: 'Prasco', url: 'prasco.com', tipo: 'Web' },
  ];

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
      toast.error('Ingresa una referencia OEM a buscar');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post<BusquedaResponse>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/referencias/buscar`,
        { referencia: searchTerm.trim() },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          withCredentials: true,
        }
      );
      setResult(response.data);
      
      if (response.data.total_encontrados > 0) {
        toast.success(`Se encontraron ${response.data.total_encontrados} referencias en ${response.data.proveedores_con_resultados} proveedores`);
      } else {
        toast('No se encontraron referencias equivalentes');
      }
    } catch (error: any) {
      console.error('Error en búsqueda:', error);
      const errorMsg = error.response?.data?.detail || 'Error en la búsqueda';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const getProveedorColor = (proveedor: string): string => {
    for (const [key, value] of Object.entries(PROVEEDORES_COLORES)) {
      if (proveedor.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    return 'bg-gray-100 border-gray-300 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modal de imagen ampliada */}
      {imagenAmpliada && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setImagenAmpliada(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setImagenAmpliada(null)}
              className="absolute -top-10 right-0 text-white text-2xl hover:text-gray-300"
            >
              ✕
            </button>
            <img 
              src={imagenAmpliada} 
              alt="Imagen ampliada" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}

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
                <p className="text-xs text-gray-500">Cruce de Referencias</p>
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
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Cruce de Referencias OEM → IAM
              </h2>
              <button
                type="button"
                onClick={() => setShowProveedores(!showProveedores)}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                Ver proveedores
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Busca referencias equivalentes a partir de un código OEM original
            </p>
            
            {/* Lista de proveedores */}
            {showProveedores && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs font-medium text-gray-700 mb-2">Proveedores consultados:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PROVEEDORES_LISTA.map((prov) => (
                    <div key={prov.nombre} className="text-xs text-gray-600 flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${prov.tipo === 'CSV' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                      <span className="font-medium">{prov.nombre}</span>
                      <span className="text-gray-400">({prov.tipo})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[250px]">
              <label className="block text-xs font-medium text-gray-700 mb-1">Referencia OEM</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ej: 7701068178, 038103601A"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${
                loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Buscando...
                </span>
              ) : (
                'Buscar Referencias'
              )}
            </button>
          </form>
        </div>

        {/* Resultados */}
        {result && (
          <div className="space-y-4">
            {/* Banner de referencias únicas para copiar */}
            {result.total_encontrados > 0 && (() => {
              const todasLasRefs = Object.values(result.resultados)
                .flat()
                .map((item) => item.iam_ref)
                .filter((ref) => ref && ref !== 'N/A');
              const refsUnicas = [...new Set(todasLasRefs)];
              const refsTexto = refsUnicas.join(', ');
              
              return refsUnicas.length > 0 ? (
                <div className="bg-indigo-50 rounded-lg shadow p-4 border border-indigo-200">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-indigo-800 mb-2">
                        Referencias IAM encontradas ({refsUnicas.length})
                      </h4>
                      <p className="font-mono text-sm text-indigo-700 break-all">
                        {refsTexto}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(refsTexto);
                        toast.success('Todas las referencias copiadas');
                      }}
                      className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    >
                      Copiar todas
                    </button>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Resumen */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Referencia OEM: <span className="text-blue-600 font-mono">{result.referencia_oem}</span>
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {result.total_encontrados > 0 ? (
                      <>
                        Se encontraron <span className="font-semibold text-green-600">{result.total_encontrados}</span> referencias 
                        en <span className="font-semibold">{result.proveedores_con_resultados}</span> proveedores
                      </>
                    ) : (
                      'No se encontraron referencias equivalentes'
                    )}
                  </p>
                </div>
                {result.total_encontrados > 0 && (
                  <div className="text-right">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                      {result.total_encontrados} resultados
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de proveedores y resultados */}
            {Object.entries(result.resultados).map(([proveedor, items]) => (
              <div key={proveedor} className={`bg-white rounded-lg shadow overflow-hidden border-l-4 ${getProveedorColor(proveedor).split(' ')[1]}`}>
                <div className={`px-4 py-3 ${getProveedorColor(proveedor)} border-b`}>
                  <h4 className="font-semibold">
                    {proveedor}
                    <span className="text-xs font-normal opacity-75 ml-2">
                      ({items.length} {items.length === 1 ? 'resultado' : 'resultados'})
                    </span>
                  </h4>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.map((item, idx) => (
                    <div key={idx} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start gap-4">
                        {/* Imagen */}
                        {item.image_url && (
                          <div 
                            className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setImagenAmpliada(item.image_url || null)}
                          >
                            <img 
                              src={item.image_url} 
                              alt={item.iam_ref}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono font-bold text-lg text-blue-700">
                              {item.iam_ref}
                            </span>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(item.iam_ref);
                                toast.success('Referencia copiada');
                              }}
                              className="text-gray-400 hover:text-blue-600 text-xs px-2 py-1 border border-gray-300 rounded hover:border-blue-400 transition-colors"
                              title="Copiar referencia"
                            >
                              Copiar
                            </button>
                          </div>
                          
                          {item.brand && item.brand !== 'Desconocida' && (
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Marca:</span> {item.brand}
                            </p>
                          )}
                          
                          {item.description && (
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                          
                          {item.price && item.price !== 'Consultar' && item.price !== '' && (
                            <p className="text-sm font-medium text-green-600 mt-1">
                              PVP: {item.price}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Errores */}
            {Object.keys(result.errores).length > 0 && (
              <div className="bg-yellow-50 rounded-lg shadow p-4 border border-yellow-200">
                <h4 className="font-semibold text-yellow-800 mb-2">Algunos proveedores no respondieron:</h4>
                <ul className="text-sm text-yellow-700 space-y-1">
                  {Object.entries(result.errores).map(([proveedor, error]) => (
                    <li key={proveedor}>• {proveedor}: {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sin resultados */}
            {result.total_encontrados === 0 && (
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <div className="text-5xl mb-4 text-gray-400"><svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No se encontraron referencias equivalentes
                </h3>
                <p className="text-gray-600">
                  La referencia OEM <span className="font-mono font-medium">{result.referencia_oem}</span> no tiene
                  equivalencias registradas en nuestros proveedores.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Exportar componente envuelto con protección de módulo
export default function ReferenciasPage() {
  return (
    <ModuloProtegido modulo="referencias">
      <ReferenciasContent />
    </ModuloProtegido>
  );
}