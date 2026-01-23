import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';

interface ConfigEstado {
  tiene_configuracion: boolean;
  pieza_familia: {
    archivo: string | null;
    registros: number;
    tiene_datos: boolean;
  } | null;
  familia_precios: {
    archivo: string | null;
    registros: number;
    tiene_datos: boolean;
  } | null;
  fecha_actualizacion: string | null;
}

interface PiezaFamilia {
  pieza: string;
  familia: string;
}

interface FamiliaPrecios {
  familia: string;
  precios: number[];
}

export default function ConfiguracionPrecios() {
  const router = useRouter();
  const { user, loadFromStorage } = useAuthStore();
  
  const [estado, setEstado] = useState<ConfigEstado | null>(null);
  const [piezasFamilia, setPiezasFamilia] = useState<PiezaFamilia[]>([]);
  const [familiasPrecios, setFamiliasPrecios] = useState<FamiliaPrecios[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'estado' | 'piezas' | 'familias'>('estado');
  const [searchPiezas, setSearchPiezas] = useState('');
  const [searchFamilias, setSearchFamilias] = useState('');
  const [mounted, setMounted] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';

  const fetchEstado = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/precios-config/estado`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setEstado(data);
      }
    } catch (error) {
      console.error('Error cargando estado:', error);
    }
  }, [API_BASE]);

  const fetchPiezasFamilia = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/precios-config/piezas-familia`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setPiezasFamilia(data);
      }
    } catch (error) {
      console.error('Error cargando piezas-familia:', error);
    }
  }, [API_BASE]);

  const fetchFamiliasPrecios = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/precios-config/familias-precios`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setFamiliasPrecios(data);
      }
    } catch (error) {
      console.error('Error cargando familias-precios:', error);
    }
  }, [API_BASE]);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (!mounted) return;

    if (!user) {
      router.push('/login');
      return;
    }

    // Todos los usuarios autenticados pueden ver la configuración

    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchEstado(),
        fetchPiezasFamilia(),
        fetchFamiliasPrecios()
      ]);
      setLoading(false);
    };
    loadData();
  }, [mounted, user, router, fetchEstado, fetchPiezasFamilia, fetchFamiliasPrecios]);

  const handleUpload = async (tipo: 'pieza-familia' | 'familia-precios', file: File) => {
    setUploading(tipo);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/precios-config/${tipo}`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: `${data.mensaje} - ${data.registros} registros cargados` });
        // Recargar datos
        await Promise.all([
          fetchEstado(),
          fetchPiezasFamilia(),
          fetchFamiliasPrecios()
        ]);
      } else {
        setMessage({ type: 'error', text: data.detail || 'Error subiendo archivo' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de eliminar toda la configuración de precios? Se usarán los archivos globales por defecto.')) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/precios-config/eliminar`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Configuración eliminada correctamente' });
        await Promise.all([
          fetchEstado(),
          fetchPiezasFamilia(),
          fetchFamiliasPrecios()
        ]);
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Error eliminando configuración' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error de conexión' });
    }
  };

  // Filtrar datos
  const piezasFiltradas = piezasFamilia.filter(p => 
    p.pieza.toLowerCase().includes(searchPiezas.toLowerCase()) ||
    p.familia.toLowerCase().includes(searchPiezas.toLowerCase())
  );

  const familiasFiltradas = familiasPrecios.filter(f =>
    f.familia.toLowerCase().includes(searchFamilias.toLowerCase())
  );

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Configuración de Precios - DesguaPro</title>
      </Head>

      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
                ← Volver
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">
                Configuración de Precios
              </h1>
            </div>
            <div className="text-sm text-gray-600">
              {user?.email}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {/* Mensaje */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          {/* Explicación */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-800 mb-2">Configuración por empresa</h3>
            <p className="text-blue-700 text-sm">
              {user && ['sysowner', 'owner', 'admin'].includes(user.rol) ? (
                <>
                  Aquí puedes subir los archivos de configuración de precios específicos para tu desguace. 
                  Todos los usuarios de tu empresa usarán estos archivos para calcular los precios sugeridos.
                  Si no subes archivos, se usarán los archivos globales por defecto.
                </>
              ) : (
                <>
                  Aquí puedes ver la configuración de precios de tu empresa.
                  Estos archivos se usan para calcular los precios sugeridos en las búsquedas.
                </>
              )}
            </p>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('estado')}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === 'estado'
                      ? 'border-yellow-500 text-yellow-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Estado General
                </button>
                <button
                  onClick={() => setActiveTab('piezas')}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === 'piezas'
                      ? 'border-yellow-500 text-yellow-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Piezas → Familias ({piezasFamilia.length})
                </button>
                <button
                  onClick={() => setActiveTab('familias')}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === 'familias'
                      ? 'border-yellow-500 text-yellow-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Familias → Precios ({familiasPrecios.length})
                </button>
              </nav>
            </div>

            <div className="p-6">
              {/* Tab Estado */}
              {activeTab === 'estado' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Pieza Familia */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-2">Archivo Pieza → Familia</h3>
                      <p className="text-gray-600 text-sm mb-4">
                        Mapea cada tipo de pieza a su familia de precios
                      </p>
                      
                      {estado?.pieza_familia?.tiene_datos ? (
                        <div className="bg-green-50 p-3 rounded mb-4">
                          <p className="text-green-800">
                            <strong>{estado.pieza_familia.archivo}</strong>
                          </p>
                          <p className="text-green-700 text-sm">
                            {estado.pieza_familia.registros} registros cargados
                          </p>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 p-3 rounded mb-4">
                          <p className="text-yellow-800">No hay archivo subido</p>
                          <p className="text-yellow-700 text-sm">Se usa el archivo global</p>
                        </div>
                      )}

                      {/* Solo admin/owner/sysowner pueden subir */}
                      {user && ['sysowner', 'owner', 'admin'].includes(user.rol) && (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">Formato: CSV con columnas PIEZA;FAMILIA</p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                handleUpload('pieza-familia', e.target.files[0]);
                              }
                            }}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"
                            disabled={uploading !== null}
                          />
                          {uploading === 'pieza-familia' && (
                            <p className="text-sm text-gray-600">Subiendo...</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Familia Precios */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-2">Archivo Familia → Precios</h3>
                      <p className="text-gray-600 text-sm mb-4">
                        Define los precios escalonados para cada familia
                      </p>
                      
                      {estado?.familia_precios?.tiene_datos ? (
                        <div className="bg-green-50 p-3 rounded mb-4">
                          <p className="text-green-800">
                            <strong>{estado.familia_precios.archivo}</strong>
                          </p>
                          <p className="text-green-700 text-sm">
                            {estado.familia_precios.registros} familias cargadas
                          </p>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 p-3 rounded mb-4">
                          <p className="text-yellow-800">No hay archivo subido</p>
                          <p className="text-yellow-700 text-sm">Se usa el archivo global</p>
                        </div>
                      )}

                      {/* Solo admin/owner/sysowner pueden subir */}
                      {user && ['sysowner', 'owner', 'admin'].includes(user.rol) && (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">Formato: CSV con columnas FAMILIA;PRECIO1;PRECIO2;...;PRECIO20</p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                handleUpload('familia-precios', e.target.files[0]);
                              }
                            }}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"
                            disabled={uploading !== null}
                          />
                          {uploading === 'familia-precios' && (
                            <p className="text-sm text-gray-600">Subiendo...</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botón eliminar */}
                  {estado?.tiene_configuracion && (user?.rol === 'owner' || user?.rol === 'sysowner') && (
                    <div className="border-t pt-4">
                      <button
                        onClick={handleDelete}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                      >
                        Eliminar toda la configuración
                      </button>
                      <p className="text-gray-500 text-sm mt-2">
                        Esto eliminará los archivos subidos y se usarán los archivos globales.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab Piezas */}
              {activeTab === 'piezas' && (
                <div>
                  {piezasFamilia.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No hay datos de piezas cargados. Sube el archivo pieza_familia.csv
                    </p>
                  ) : (
                    <>
                      <div className="mb-4">
                        <input
                          type="text"
                          placeholder="Buscar pieza o familia..."
                          value={searchPiezas}
                          onChange={(e) => setSearchPiezas(e.target.value)}
                          className="w-full md:w-64 px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div className="overflow-x-auto max-h-96">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pieza</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Familia</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {piezasFiltradas.slice(0, 100).map((p, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm">{p.pieza}</td>
                                <td className="px-4 py-2 text-sm text-gray-600">{p.familia}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {piezasFiltradas.length > 100 && (
                          <p className="text-center text-gray-500 py-2">
                            Mostrando 100 de {piezasFiltradas.length} resultados
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Tab Familias */}
              {activeTab === 'familias' && (
                <div>
                  {familiasPrecios.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No hay datos de familias cargados. Sube el archivo familia_precios.csv
                    </p>
                  ) : (
                    <>
                      <div className="mb-4">
                        <input
                          type="text"
                          placeholder="Buscar familia..."
                          value={searchFamilias}
                          onChange={(e) => setSearchFamilias(e.target.value)}
                          className="w-full md:w-64 px-3 py-2 border rounded-lg"
                        />
                      </div>
                      <div className="overflow-x-auto max-h-96">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Familia</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precios</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {familiasFiltradas.map((f, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-sm font-medium">{f.familia}</td>
                                <td className="px-4 py-2 text-sm">
                                  <div className="flex flex-wrap gap-1">
                                    {f.precios.map((precio, j) => (
                                      <span 
                                        key={j}
                                        className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs"
                                      >
                                        €{precio}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
