'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import SearchableSelect from '@/components/SearchableSelect';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Vehiculo {
  id: number;
  marca: string;
  modelo: string;
  anios_produccion: string | null;
  rango_anios: string | null;
  tiene_serie: boolean;
  tiene_deportiva: boolean;
  observaciones_facelift: string | null;
  serie_1g: string | null;
  serie_2g: string | null;
  serie_3g: string | null;
  precio_fatal_10: number | null;
  precio_mal_13: number | null;
  precio_regular_17: number | null;
  precio_bien_23: number | null;
  precio_vida_deportiva: number | null;
  valor_minimo_usado: number | null;
  porcentaje_15: number | null;
  porcentaje_20: number | null;
  porcentaje_23: number | null;
  compatibilidad: string | null;
}

const EMPTY_FORM: Omit<Vehiculo, 'id'> = {
  marca: '', modelo: '', anios_produccion: '', rango_anios: '',
  tiene_serie: false, tiene_deportiva: false, observaciones_facelift: '',
  serie_1g: '', serie_2g: '', serie_3g: '',
  precio_fatal_10: null, precio_mal_13: null, precio_regular_17: null, precio_bien_23: null,
  precio_vida_deportiva: null, valor_minimo_usado: null,
  porcentaje_15: null, porcentaje_20: null, porcentaje_23: null, compatibilidad: '',
};

export default function VehiculosAdminPage() {
  const router = useRouter();
  const { user, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [filtroMarca, setFiltroMarca] = useState('');
  const [marcas, setMarcas] = useState<string[]>([]);
  const [pagina, setPagina] = useState(0);
  const LIMIT = 50;

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<Vehiculo, 'id'>>(EMPTY_FORM);
  const [guardando, setGuardando] = useState(false);

  // Expanded row to see full details
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL;
  const isAdmin = user && ['admin', 'owner', 'sysowner'].includes(user.rol);

  useEffect(() => { loadFromStorage(); setMounted(true); }, [loadFromStorage]);

  const cargarMarcas = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/v1/vehiculos/marcas`);
      setMarcas(res.data);
    } catch { /* ignore */ }
  }, [API]);

  const cargarVehiculos = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params: Record<string, string | number> = { limit: LIMIT, offset: pagina * LIMIT };
      if (buscar.trim()) params.buscar = buscar.trim();
      if (filtroMarca) params.marca = filtroMarca;
      const res = await axios.get(`${API}/api/v1/vehiculos/todos`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setVehiculos(res.data.items);
      setTotal(res.data.total);
    } catch {
      toast.error('Error al cargar vehículos');
    } finally {
      setLoading(false);
    }
  }, [API, pagina, buscar, filtroMarca]);

  useEffect(() => {
    if (mounted && user) { cargarMarcas(); cargarVehiculos(); }
  }, [mounted, user, cargarMarcas, cargarVehiculos]);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditandoId(null);
  };

  const editarVehiculo = (v: Vehiculo) => {
    setEditandoId(v.id);
    setForm({
      marca: v.marca, modelo: v.modelo,
      anios_produccion: v.anios_produccion || '',
      rango_anios: v.rango_anios || '',
      tiene_serie: v.tiene_serie,
      tiene_deportiva: v.tiene_deportiva,
      observaciones_facelift: v.observaciones_facelift || '',
      serie_1g: v.serie_1g || '', serie_2g: v.serie_2g || '', serie_3g: v.serie_3g || '',
      precio_fatal_10: v.precio_fatal_10, precio_mal_13: v.precio_mal_13,
      precio_regular_17: v.precio_regular_17, precio_bien_23: v.precio_bien_23,
      precio_vida_deportiva: v.precio_vida_deportiva,
      valor_minimo_usado: v.valor_minimo_usado,
      porcentaje_15: v.porcentaje_15, porcentaje_20: v.porcentaje_20, porcentaje_23: v.porcentaje_23,
      compatibilidad: v.compatibilidad || '',
    });
    setMostrarForm(true);
  };

  const guardar = async () => {
    if (!form.marca.trim() || !form.modelo.trim()) {
      toast.error('Marca y modelo son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      const token = localStorage.getItem('token');
      const body = { ...form };
      if (editandoId) {
        await axios.put(`${API}/api/v1/vehiculos/${editandoId}`, body, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Vehículo actualizado');
      } else {
        await axios.post(`${API}/api/v1/vehiculos`, body, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Vehículo creado');
      }
      resetForm();
      setMostrarForm(false);
      cargarVehiculos();
      cargarMarcas();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id: number) => {
    if (!confirm('¿Eliminar este registro de vehículo?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/v1/vehiculos/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Eliminado');
      cargarVehiculos();
      cargarMarcas();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al eliminar');
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/dashboard')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Catálogo de Vehículos</h1>
              <p className="text-sm text-gray-500">
                {total} registros · {marcas.length} marcas
                {!isAdmin && <span className="ml-2 text-amber-600">(solo lectura)</span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Barra superior: filtros + botón nuevo */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Buscar marca o modelo..."
              value={buscar}
              onChange={(e) => { setBuscar(e.target.value); setPagina(0); }}
              onKeyDown={(e) => e.key === 'Enter' && cargarVehiculos()}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-56"
            />
            <select
              value={filtroMarca}
              onChange={(e) => { setFiltroMarca(e.target.value); setPagina(0); }}
              className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Todas las marcas</option>
              {marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button onClick={() => cargarVehiculos()} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium transition-colors">
              Buscar
            </button>
          </div>
          {isAdmin && (
            <button
              onClick={() => { resetForm(); setMostrarForm(!mostrarForm); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nuevo Vehículo
            </button>
          )}
        </div>

        {/* Formulario crear/editar */}
        {mostrarForm && isAdmin && (
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">
              {editandoId ? 'Editar vehículo' : 'Nuevo vehículo'}
            </h3>

            {/* Datos básicos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Marca *</label>
                <input type="text" value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value.toUpperCase() })}
                  placeholder="Ej: VOLKSWAGEN"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Modelo *</label>
                <input type="text" value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value.toUpperCase() })}
                  placeholder="Ej: GOLF VII"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Años producción</label>
                <input type="text" value={form.anios_produccion || ''} onChange={(e) => setForm({ ...form, anios_produccion: e.target.value })}
                  placeholder="2013-2020"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rango años</label>
                <input type="text" value={form.rango_anios || ''} onChange={(e) => setForm({ ...form, rango_anios: e.target.value })}
                  placeholder="13-17"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            </div>

            {/* Flags + observaciones */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.tiene_serie} onChange={(e) => setForm({ ...form, tiene_serie: e.target.checked })} className="rounded" />
                  Tiene serie
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.tiene_deportiva} onChange={(e) => setForm({ ...form, tiene_deportiva: e.target.checked })} className="rounded" />
                  Tiene deportiva
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones facelift</label>
                <input type="text" value={form.observaciones_facelift || ''} onChange={(e) => setForm({ ...form, observaciones_facelift: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Compatibilidad</label>
                <input type="text" value={form.compatibilidad || ''} onChange={(e) => setForm({ ...form, compatibilidad: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            </div>

            {/* Series */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Serie 1G</label>
                <input type="text" value={form.serie_1g || ''} onChange={(e) => setForm({ ...form, serie_1g: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Serie 2G</label>
                <input type="text" value={form.serie_2g || ''} onChange={(e) => setForm({ ...form, serie_2g: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Serie 3G</label>
                <input type="text" value={form.serie_3g || ''} onChange={(e) => setForm({ ...form, serie_3g: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button disabled={guardando} onClick={guardar}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                {guardando && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
                {editandoId ? 'Actualizar' : 'Guardar'}
              </button>
              <button onClick={() => { setMostrarForm(false); resetForm(); }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Tabla */}
        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
              <p className="text-gray-400 text-sm mt-3">Cargando vehículos...</p>
            </div>
          ) : vehiculos.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 text-lg font-medium">No se encontraron vehículos</p>
              <p className="text-gray-400 text-sm mt-1">Prueba con otro filtro o añade uno nuevo</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Marca</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Modelo</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Años</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Rango</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Observaciones</th>
                  {isAdmin && <th className="px-4 py-3 text-left font-semibold text-gray-700">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vehiculos.map((v) => (
                  <React.Fragment key={v.id}>
                    <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}>
                      <td className="px-4 py-3 font-medium text-gray-900">{v.marca}</td>
                      <td className="px-4 py-3 text-gray-700">{v.modelo}</td>
                      <td className="px-4 py-3 text-gray-600">{v.anios_produccion || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{v.rango_anios || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{v.observaciones_facelift || '-'}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => editarVehiculo(v)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                              Editar
                            </button>
                            <button onClick={() => eliminar(v.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">
                              Eliminar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {/* Fila expandida con detalles */}
                    {expandedId === v.id && (
                      <tr>
                        <td colSpan={isAdmin ? 6 : 5} className="px-4 py-3 bg-blue-50 border-t border-blue-100">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                            {v.observaciones_facelift && (
                              <div className="col-span-full">
                                <span className="font-semibold text-blue-700">Facelift:</span>{' '}
                                <span className="text-blue-600">{v.observaciones_facelift}</span>
                              </div>
                            )}
                            {v.compatibilidad && (
                              <div className="col-span-full">
                                <span className="font-semibold text-purple-700">Compatibilidad:</span>{' '}
                                <span className="text-purple-600">{v.compatibilidad}</span>
                              </div>
                            )}
                            {v.serie_1g && <div><span className="font-medium text-gray-500">1G:</span> {v.serie_1g}</div>}
                            {v.serie_2g && <div><span className="font-medium text-gray-500">2G:</span> {v.serie_2g}</div>}
                            {v.serie_3g && <div><span className="font-medium text-gray-500">3G:</span> {v.serie_3g}</div>}
                            <div><span className="font-medium text-gray-500">Serie:</span> {v.tiene_serie ? 'Sí' : 'No'}</div>
                            <div><span className="font-medium text-gray-500">Deportiva:</span> {v.tiene_deportiva ? 'Sí' : 'No'}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Página {pagina + 1} de {totalPages} ({total} registros)</span>
            <div className="flex gap-2">
              <button
                disabled={pagina === 0}
                onClick={() => setPagina(pagina - 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors"
              >
                Anterior
              </button>
              <button
                disabled={pagina + 1 >= totalPages}
                onClick={() => setPagina(pagina + 1)}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
