'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface PiezaCSV {
  idx?: number;
  oem: string;
  cantidad: number;
  oe: string;
  iam: string;
  precio: string;
  observaciones: string;
  imagen: string;
}

export default function EditarCSVPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, token, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [piezas, setPiezas] = useState<PiezaCSV[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<number | null>(null);
  const [piezaEditando, setPiezaEditando] = useState<PiezaCSV | null>(null);
  const [mostrarAgregar, setMostrarAgregar] = useState(false);
  const [nuevaPieza, setNuevaPieza] = useState<PiezaCSV>({
    oem: '', cantidad: 1, oe: '', iam: '', precio: '', observaciones: '', imagen: ''
  });

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (token && id) {
      cargarCSV();
    }
  }, [token, id]);

  const cargarCSV = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/piezas/csv-guardados/${id}/contenido`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNombreArchivo(response.data.nombre);
      setPiezas(response.data.piezas || []);
    } catch (error: any) {
      toast.error('Error al cargar el CSV');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const guardarCambios = async () => {
    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/piezas/csv-guardados/${id}`,
        { piezas },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('CSV guardado correctamente');
    } catch (error: any) {
      toast.error('Error al guardar');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const eliminarPieza = (idx: number) => {
    if (!confirm('¿Eliminar esta pieza?')) return;
    const nuevasPiezas = piezas.filter((_, i) => i !== idx);
    setPiezas(nuevasPiezas);
    toast.success('Pieza eliminada (guarda para confirmar)');
  };

  const iniciarEdicion = (idx: number) => {
    setEditando(idx);
    setPiezaEditando({ ...piezas[idx] });
  };

  const guardarEdicion = () => {
    if (editando !== null && piezaEditando) {
      const nuevasPiezas = [...piezas];
      nuevasPiezas[editando] = piezaEditando;
      setPiezas(nuevasPiezas);
      setEditando(null);
      setPiezaEditando(null);
      toast.success('Pieza modificada (guarda para confirmar)');
    }
  };

  const cancelarEdicion = () => {
    setEditando(null);
    setPiezaEditando(null);
  };

  const agregarPieza = () => {
    if (!nuevaPieza.oem.trim()) {
      toast.error('El OEM es obligatorio');
      return;
    }
    setPiezas([...piezas, { ...nuevaPieza }]);
    setNuevaPieza({ oem: '', cantidad: 1, oe: '', iam: '', precio: '', observaciones: '', imagen: '' });
    setMostrarAgregar(false);
    toast.success('Pieza añadida (guarda para confirmar)');
  };

  const descargarCSV = async () => {
    try {
      const response = await axios.get(`${API_URL}/piezas/csv-guardados/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = nombreArchivo;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Error al descargar');
    }
  };

  // Filtrar piezas
  const piezasFiltradas = piezas.filter(p => {
    if (!busqueda.trim()) return true;
    const term = busqueda.toLowerCase();
    return (
      p.oem.toLowerCase().includes(term) ||
      p.oe.toLowerCase().includes(term) ||
      p.iam.toLowerCase().includes(term) ||
      p.observaciones.toLowerCase().includes(term)
    );
  });

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
              <button onClick={() => router.push('/piezas-nuevas')} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Editar CSV</h1>
                <p className="text-xs text-gray-500">{nombreArchivo} ({piezas.length} piezas)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={descargarCSV} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2">
                ⬇ Descargar
              </button>
              <button onClick={guardarCambios} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                {saving ? '💾 Guardando...' : '💾 Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Barra de herramientas */}
            <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-64">
                <input
                  type="text"
                  placeholder="Buscar por OEM, OE, IAM..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => setMostrarAgregar(!mostrarAgregar)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                ➕ Añadir pieza
              </button>
            </div>

            {/* Formulario añadir pieza */}
            {mostrarAgregar && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-blue-800 mb-3">Nueva pieza</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <input
                    type="text"
                    placeholder="OEM *"
                    value={nuevaPieza.oem}
                    onChange={(e) => setNuevaPieza({...nuevaPieza, oem: e.target.value})}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    placeholder="Cantidad"
                    value={nuevaPieza.cantidad}
                    onChange={(e) => setNuevaPieza({...nuevaPieza, cantidad: parseInt(e.target.value) || 1})}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="OE"
                    value={nuevaPieza.oe}
                    onChange={(e) => setNuevaPieza({...nuevaPieza, oe: e.target.value})}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="IAM"
                    value={nuevaPieza.iam}
                    onChange={(e) => setNuevaPieza({...nuevaPieza, iam: e.target.value})}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Precio"
                    value={nuevaPieza.precio}
                    onChange={(e) => setNuevaPieza({...nuevaPieza, precio: e.target.value})}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Observaciones"
                    value={nuevaPieza.observaciones}
                    onChange={(e) => setNuevaPieza({...nuevaPieza, observaciones: e.target.value})}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="URL Imagen"
                    value={nuevaPieza.imagen}
                    onChange={(e) => setNuevaPieza({...nuevaPieza, imagen: e.target.value})}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={agregarPieza} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    ✓ Añadir
                  </button>
                  <button onClick={() => setMostrarAgregar(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Tabla de piezas */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">OEM</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">OE</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">IAM</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Observaciones</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imagen</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {piezasFiltradas.map((pieza, idx) => {
                      const realIdx = piezas.indexOf(pieza);
                      const isEditing = editando === realIdx;
                      
                      return (
                        <tr key={realIdx} className={`hover:bg-gray-50 ${isEditing ? 'bg-yellow-50' : ''}`}>
                          <td className="px-3 py-2 text-sm text-gray-500">{realIdx + 1}</td>
                          
                          {isEditing && piezaEditando ? (
                            <>
                              <td className="px-2 py-1">
                                <input type="text" value={piezaEditando.oem} onChange={(e) => setPiezaEditando({...piezaEditando, oem: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="number" value={piezaEditando.cantidad} onChange={(e) => setPiezaEditando({...piezaEditando, cantidad: parseInt(e.target.value) || 1})} className="w-20 px-2 py-1 border rounded text-sm text-center" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="text" value={piezaEditando.oe} onChange={(e) => setPiezaEditando({...piezaEditando, oe: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="text" value={piezaEditando.iam} onChange={(e) => setPiezaEditando({...piezaEditando, iam: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="text" value={piezaEditando.precio} onChange={(e) => setPiezaEditando({...piezaEditando, precio: e.target.value})} className="w-24 px-2 py-1 border rounded text-sm" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="text" value={piezaEditando.observaciones} onChange={(e) => setPiezaEditando({...piezaEditando, observaciones: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" />
                              </td>
                              <td className="px-2 py-1">
                                <input type="text" value={piezaEditando.imagen} onChange={(e) => setPiezaEditando({...piezaEditando, imagen: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" />
                              </td>
                              <td className="px-2 py-1 text-center">
                                <button onClick={guardarEdicion} className="text-green-600 hover:text-green-800 mr-2">✓</button>
                                <button onClick={cancelarEdicion} className="text-gray-600 hover:text-gray-800">✕</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-sm font-medium text-gray-900">{pieza.oem}</td>
                              <td className="px-3 py-2 text-sm text-gray-600 text-center">{pieza.cantidad}</td>
                              <td className="px-3 py-2 text-sm text-gray-600">{pieza.oe || '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-600">{pieza.iam || '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-600">{pieza.precio || '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={pieza.observaciones}>{pieza.observaciones || '-'}</td>
                              <td className="px-3 py-2">
                                {pieza.imagen ? (
                                  <img src={pieza.imagen} alt="" className="w-10 h-10 object-cover rounded" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                                ) : (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button onClick={() => iniciarEdicion(realIdx)} className="text-blue-600 hover:text-blue-800 mr-2" title="Editar">✏️</button>
                                <button onClick={() => eliminarPieza(realIdx)} className="text-red-600 hover:text-red-800" title="Eliminar">🗑️</button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {piezasFiltradas.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {busqueda ? 'No se encontraron resultados' : 'No hay piezas en el CSV'}
                </div>
              )}
            </div>

            {/* Paginación / Info */}
            <div className="mt-4 text-center text-sm text-gray-500">
              Mostrando {piezasFiltradas.length} de {piezas.length} piezas
            </div>
          </>
        )}
      </main>
    </div>
  );
}
