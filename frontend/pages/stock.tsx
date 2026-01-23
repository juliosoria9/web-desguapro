'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface CheckResult {
  ref_id: string;
  ref_oem: string;
  precio_azeler: number;
  precio_mercado: number;
  diferencia_porcentaje: number;
  precios_encontrados: number;
  es_outlier: boolean;
}

interface CheckResponse {
  total_items: number;
  items_procesados: number;
  items_con_outliers: number;
  resultados: CheckResult[];
  tiempo_procesamiento: number;
}

export default function StockPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [umbral, setUmbral] = useState(20);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Verificar permisos
  if (user.rol !== 'owner' && user.rol !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Acceso Denegado</h1>
          <p className="text-gray-600 mt-2">No tienes permiso para acceder a esta sección</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Selecciona un archivo CSV');
      return;
    }

    setLoading(true);
    try {
      // Leer archivo CSV
      const text = await file.text();
      const lines = text.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const items = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row: {[key: string]: any} = {};
        headers.forEach((h, i) => {
          row[h] = values[i];
        });
        return {
          ref_id: row.ref_id || '',
          ref_oem: row.ref_oem || row.referencia || '',
          ref_oe: row.ref_oe || '',
          ref_iam: row.ref_iam || '',
          anostock: row.anostock || '',
          precio_azeler: parseFloat(row.precio_azeler || row.precio || 0),
          peso: row.peso || '',
          estado: row.estado || '',
          articulo: row.articulo || ''
        };
      });

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/stock/verificar`,
        { 
          items,
          umbral_diferencia: umbral,
          workers: 5
        },
        {
          withCredentials: true,
        }
      );
      setResult(response.data);
      toast.success('Verificación completada');
    } catch (error: any) {
      console.error('Error en verificación:', error);
      toast.error(error.response?.data?.detail || 'Error al verificar stock');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4 cursor-pointer" onClick={() => router.push('/dashboard')}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-white shadow-sm p-1">
                <img src="/logo.png" alt="DesguaPro" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  DesguaPro
                </h1>
                <p className="text-xs text-gray-500">Verificar Stock</p>
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
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Verificar Stock</h2>

          <form onSubmit={handleCheck} className="mb-8">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Archivo CSV</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition-colors">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="csvInput"
                  />
                  <label htmlFor="csvInput" className="cursor-pointer">
                    <p className="text-gray-600">
                      {file ? `✓ ${file.name}` : 'Selecciona un archivo CSV o arrastra aquí'}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Columnas requeridas: ref_id, ref_oem, precio_azeler
                    </p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Umbral de Diferencia: {umbral}%
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={umbral}
                  onChange={(e) => setUmbral(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !file}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition-colors font-semibold"
              >
                {loading ? 'Verificando...' : 'Verificar Stock'}
              </button>
            </div>
          </form>

          {result && (
            <div className="border-t pt-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Resultados</h3>

              {/* Resumen */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Total Items</p>
                  <p className="text-2xl font-bold text-blue-600">{result.total_items}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Procesados</p>
                  <p className="text-2xl font-bold text-green-600">{result.items_procesados}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Con Outliers</p>
                  <p className="text-2xl font-bold text-red-600">{result.items_con_outliers}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Tiempo (s)</p>
                  <p className="text-2xl font-bold text-purple-600">{result.tiempo_procesamiento.toFixed(2)}</p>
                </div>
              </div>

              {/* Tabla de resultados */}
              {result.resultados.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Ref OEM</th>
                        <th className="px-4 py-2 text-left font-semibold">Precio Azeler</th>
                        <th className="px-4 py-2 text-left font-semibold">Precio Mercado</th>
                        <th className="px-4 py-2 text-left font-semibold">Diferencia %</th>
                        <th className="px-4 py-2 text-left font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {result.resultados.map((res, idx) => (
                        <tr key={idx} className={res.es_outlier ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-2 font-mono text-xs">{res.ref_oem}</td>
                          <td className="px-4 py-2">${res.precio_azeler.toFixed(2)}</td>
                          <td className="px-4 py-2">${res.precio_mercado.toFixed(2)}</td>
                          <td className="px-4 py-2 font-semibold">
                            <span className={res.diferencia_porcentaje > 0 ? 'text-green-600' : 'text-red-600'}>
                              {res.diferencia_porcentaje > 0 ? '+' : ''}{res.diferencia_porcentaje.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              res.es_outlier 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {res.es_outlier ? '⚠️ Outlier' : '✓ OK'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
