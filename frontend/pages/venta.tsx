'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import ModuloProtegido from '@/components/ModuloProtegido';
import SearchableSelect from '@/components/SearchableSelect';
import axios from 'axios';
import toast from 'react-hot-toast';

// ─── Tipos ───────────────────────────────────────────────
interface ClienteInteresado {
  id: number;
  nombre: string;
  telefono: string | null;
  email: string | null;
  pieza_buscada: string | null;
  marca_coche: string | null;
  modelo_coche: string | null;
  anio_coche: string | null;
  version_coche: string | null;
  observaciones: string | null;
  fecha_registro: string;
  estado: 'pendiente' | 'contactado' | 'vendido' | 'descartado';
  usuario_email: string | null;
}

type TabActiva = 'clientes' | 'buscar';

// ─── Componente principal ────────────────────────────────
function VentaContent() {
  const router = useRouter();
  const { user, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [tabActiva, setTabActiva] = useState<TabActiva>('clientes');

  // ── Estado Clientes Interesados ──
  const [clientes, setClientes] = useState<ClienteInteresado[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [mostrarFormCliente, setMostrarFormCliente] = useState(false);
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [editandoClienteId, setEditandoClienteId] = useState<number | null>(null);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: '',
    telefono: '',
    email: '',
    pieza_buscada: '',
    marca_coche: '',
    modelo_coche: '',
    anio_coche: '',
    version_coche: '',
    observaciones: '',
  });
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [duplicados, setDuplicados] = useState<any[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Estado Dropdowns Vehículo ──
  const [marcasDisponibles, setMarcasDisponibles] = useState<string[]>([]);
  const [modelosDisponibles, setModelosDisponibles] = useState<string[]>([]);
  const [aniosDisponibles, setAniosDisponibles] = useState<{rango_anios: string; anios_produccion: string; observaciones_facelift: string | null}[]>([]);

  // ── Estado Buscar Piezas ──
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<any>(null);
  const [buscando, setBuscando] = useState(false);
  const [faseActual, setFaseActual] = useState('');
  const [seccionAbierta, setSeccionAbierta] = useState<Record<string, boolean>>({
    stock: true,
    otros: true,
    desguaces: true,
    iam: true,
    oem: true,
    vendidas: true,
  });
  const [imagenGrande, setImagenGrande] = useState<string | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL;

  const resetForm = () => {
    setNuevoCliente({ nombre: '', telefono: '', email: '', pieza_buscada: '', marca_coche: '', modelo_coche: '', anio_coche: '', version_coche: '', observaciones: '' });
    setEditandoClienteId(null);
    setDuplicados([]);
    setModelosDisponibles([]);
    setAniosDisponibles([]);
  };

  // Cargar marcas al montar
  useEffect(() => {
    axios.get(`${API}/api/v1/vehiculos/marcas`).then(r => setMarcasDisponibles(r.data)).catch(() => {});
  }, [API]);

  // Cargar modelos al cambiar marca
  useEffect(() => {
    if (!nuevoCliente.marca_coche) { setModelosDisponibles([]); setAniosDisponibles([]); return; }
    axios.get(`${API}/api/v1/vehiculos/modelos`, { params: { marca: nuevoCliente.marca_coche } })
      .then(r => setModelosDisponibles(r.data))
      .catch(() => setModelosDisponibles([]));
    // Solo limpiar modelo/año si el usuario cambió la marca (no al cargar edit)
  }, [nuevoCliente.marca_coche, API]);

  // Cargar años al cambiar modelo
  useEffect(() => {
    if (!nuevoCliente.marca_coche || !nuevoCliente.modelo_coche) { setAniosDisponibles([]); return; }
    axios.get(`${API}/api/v1/vehiculos/anios`, { params: { marca: nuevoCliente.marca_coche, modelo: nuevoCliente.modelo_coche } })
      .then(r => setAniosDisponibles(r.data))
      .catch(() => setAniosDisponibles([]));
  }, [nuevoCliente.marca_coche, nuevoCliente.modelo_coche, API]);

  const cargarClientes = async () => {
    setLoadingClientes(true);
    try {
      const token = localStorage.getItem('token');
      const params: Record<string, string> = {};
      if (busquedaCliente.trim()) params.buscar = busquedaCliente.trim();
      const res = await axios.get(`${API}/api/v1/clientes`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setClientes(res.data);
    } catch {
      toast.error('Error al cargar clientes');
    } finally {
      setLoadingClientes(false);
    }
  };

  const verificarDuplicadosLive = async (nombre: string, telefono: string, email: string) => {
    try {
      const token = localStorage.getItem('token');
      const params: Record<string, string> = {};
      if (nombre.trim()) params.nombre = nombre.trim();
      if (telefono.trim()) params.telefono = telefono.trim();
      if (email.trim()) params.email = email.trim();
      if (editandoClienteId) params.excluir_id = String(editandoClienteId);
      if (!params.nombre && !params.telefono && !params.email) { setDuplicados([]); return; }
      const res = await axios.get(`${API}/api/v1/clientes/verificar-duplicados`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setDuplicados(res.data || []);
    } catch {
      setDuplicados([]);
    }
  };

  // Verificar duplicados en tiempo real con debounce de 500ms
  useEffect(() => {
    if (!mostrarFormCliente || editandoClienteId) { setDuplicados([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      verificarDuplicadosLive(nuevoCliente.nombre, nuevoCliente.telefono, nuevoCliente.email);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [nuevoCliente.nombre, nuevoCliente.telefono, nuevoCliente.email, mostrarFormCliente, editandoClienteId]);

  const guardarCliente = async () => {
    if (!nuevoCliente.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!nuevoCliente.telefono.trim()) { toast.error('El teléfono es obligatorio'); return; }
    if (!nuevoCliente.marca_coche) { toast.error('La marca es obligatoria'); return; }
    if (!nuevoCliente.modelo_coche) { toast.error('El modelo es obligatorio'); return; }
    if (!nuevoCliente.anio_coche) { toast.error('El año es obligatorio'); return; }
    setGuardandoCliente(true);
    try {
      const token = localStorage.getItem('token');
      const body = { ...nuevoCliente };
      if (editandoClienteId) {
        await axios.put(`${API}/api/v1/clientes/${editandoClienteId}`, body, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Cliente actualizado');
      } else {
        await axios.post(`${API}/api/v1/clientes`, body, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Cliente registrado');
      }
      resetForm();
      setMostrarFormCliente(false);
      cargarClientes();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al guardar cliente');
    } finally {
      setGuardandoCliente(false);
    }
  };

  const borrarCliente = async (id: number) => {
    if (!confirm('¿Eliminar este cliente?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API}/api/v1/clientes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Cliente eliminado');
      cargarClientes();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al eliminar');
    }
  };

  const editarCliente = (c: ClienteInteresado) => {
    setEditandoClienteId(c.id);
    setNuevoCliente({
      nombre: c.nombre,
      telefono: c.telefono || '',
      email: c.email || '',
      pieza_buscada: c.pieza_buscada || '',
      marca_coche: c.marca_coche || '',
      modelo_coche: c.modelo_coche || '',
      anio_coche: c.anio_coche || '',
      version_coche: c.version_coche || '',
      observaciones: c.observaciones || '',
    });
    setMostrarFormCliente(true);
  };

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && user) cargarClientes();
  }, [mounted, user]);

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
      </div>
    );
  }

  // ── Tabs ──
  const tabs: { id: TabActiva; label: string; icon: JSX.Element }[] = [
    {
      id: 'clientes',
      label: 'Clientes Interesados',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      ),
    },
    {
      id: 'buscar',
      label: 'Buscar Piezas',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      ),
    },
  ];

  // ── Handlers ──
  const handleBuscarPiezas = async () => {
    if (!busqueda.trim()) {
      toast.error('Escribe una referencia OEM para buscar');
      return;
    }
    setBuscando(true);
    setResultados(null);
    setFaseActual('Buscando OEM equivalentes, stock propio, referencias IAM y desguaces...');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API}/api/v1/precios/busqueda-completa`,
        { referencia: busqueda.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResultados(res.data);
      setFaseActual('');
      const total = (res.data.total_stock || 0) + (res.data.total_otros_entornos || 0) + (res.data.total_desguaces || 0);
      if (total > 0) {
        toast.success(`${total} resultado(s) encontrados`);
      } else if ((res.data.total_iam || 0) > 0) {
        toast.success(`Sin piezas directas, pero ${res.data.total_iam} ref. IAM encontradas`);
      } else {
        toast('No se encontraron resultados', { icon: '🔍' });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Error al buscar');
      setFaseActual('');
    } finally {
      setBuscando(false);
    }
  };

  const toggleSeccion = (key: string) => {
    setSeccionAbierta(prev => ({ ...prev, [key]: !prev[key] }));
  };



  // ─── Render ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Venta</h1>
              <p className="text-sm text-gray-500">Gestiona clientes y busca piezas para vender</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTabActiva(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tabActiva === tab.id
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* ═══════════ TAB 1: CLIENTES INTERESADOS ═══════════ */}
        {tabActiva === 'clientes' && (
          <div className="space-y-4">
            {/* Barra superior */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-gray-800">
                Lista de Clientes Interesados
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={busquedaCliente}
                  onChange={(e) => setBusquedaCliente(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && cargarClientes()}
                  className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-48"
                />
                <button
                  onClick={() => { resetForm(); setMostrarFormCliente(!mostrarFormCliente); }}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Nuevo Cliente
                </button>
              </div>
            </div>

            {/* Formulario nuevo/editar cliente */}
            {mostrarFormCliente && (
              <div className="bg-white rounded-xl border p-5 space-y-4">
                <h3 className="font-semibold text-gray-900">
                  {editandoClienteId ? 'Editar cliente' : 'Registrar cliente interesado'}
                </h3>

                {/* Datos del cliente */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                    <input
                      type="text"
                      placeholder="Nombre del cliente"
                      value={nuevoCliente.nombre}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono *</label>
                    <input
                      type="text"
                      placeholder="Teléfono"
                      value={nuevoCliente.telefono}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Correo electrónico</label>
                    <input
                      type="email"
                      placeholder="email@ejemplo.com"
                      value={nuevoCliente.email}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, email: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Aviso de duplicados en tiempo real */}
                {duplicados.length > 0 && !editandoClienteId && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-semibold text-amber-800 text-sm">Ya existen clientes con datos similares</p>
                        <p className="text-amber-700 text-xs mt-0.5">Puedes continuar igualmente, un cliente puede tener varios coches</p>
                      </div>
                    </div>
                    <div className="space-y-2 ml-7">
                      {duplicados.map((d: any) => (
                        <div key={d.id} className="bg-white rounded-md border border-amber-200 px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">{d.nombre}</span>
                            {d.telefono && <span className="text-gray-500">Tel: {d.telefono}</span>}
                            {d.email && <span className="text-gray-500">{d.email}</span>}
                          </div>
                          {d.vehiculo && <div className="text-xs text-gray-500 mt-0.5">Veh\u00edculo: {d.vehiculo}</div>}
                          {d.pieza_buscada && <div className="text-xs text-gray-500">OEM: {d.pieza_buscada}</div>}
                          <div className="text-xs text-amber-700 mt-1">
                            Coincide por: {d.coincide_por.join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Datos del vehículo */}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Datos del vehículo</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Marca *</label>
                      <SearchableSelect
                        value={nuevoCliente.marca_coche}
                        onChange={(v) => setNuevoCliente({ ...nuevoCliente, marca_coche: v, modelo_coche: '', anio_coche: '' })}
                        options={marcasDisponibles}
                        placeholder="Buscar marca..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Modelo *</label>
                      <SearchableSelect
                        value={nuevoCliente.modelo_coche}
                        onChange={(v) => setNuevoCliente({ ...nuevoCliente, modelo_coche: v, anio_coche: '' })}
                        options={modelosDisponibles}
                        placeholder={nuevoCliente.marca_coche ? 'Buscar modelo...' : 'Elige marca primero'}
                        disabled={!nuevoCliente.marca_coche}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Años *</label>
                      <select
                        value={nuevoCliente.anio_coche}
                        onChange={(e) => setNuevoCliente({ ...nuevoCliente, anio_coche: e.target.value })}
                        disabled={!nuevoCliente.modelo_coche}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="">{nuevoCliente.modelo_coche ? 'Seleccionar años' : 'Elige modelo primero'}</option>
                        {aniosDisponibles.map(a => <option key={a.rango_anios} value={a.rango_anios}>{a.rango_anios} ({a.anios_produccion})</option>)}
                      </select>
                      {aniosDisponibles.find(a => a.rango_anios === nuevoCliente.anio_coche)?.observaciones_facelift && (
                        <p className="text-xs text-blue-600 mt-1">
                          {aniosDisponibles.find(a => a.rango_anios === nuevoCliente.anio_coche)!.observaciones_facelift}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Versión</label>
                      <input
                        type="text"
                        placeholder="Ej: 1.6 TDI"
                        value={nuevoCliente.version_coche}
                        onChange={(e) => setNuevoCliente({ ...nuevoCliente, version_coche: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Pieza y observaciones */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">OEM de la pieza</label>
                    <input
                      type="text"
                      placeholder="Ej: 1K0941005S"
                      value={nuevoCliente.pieza_buscada}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, pieza_buscada: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
                    <input
                      type="text"
                      placeholder="Notas adicionales"
                      value={nuevoCliente.observaciones}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, observaciones: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    disabled={guardandoCliente}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    onClick={guardarCliente}
                  >
                    {guardandoCliente && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
                    {editandoClienteId ? 'Actualizar' : 'Guardar'}
                  </button>
                  <button
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    onClick={() => { setMostrarFormCliente(false); resetForm(); }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Tabla de clientes */}
            <div className="bg-white rounded-xl border overflow-hidden">
              {loadingClientes ? (
                <div className="p-12 text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
                  <p className="text-gray-400 text-sm mt-3">Cargando clientes...</p>
                </div>
              ) : clientes.length === 0 ? (
                <div className="p-12 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-300 mb-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                  <p className="text-gray-500 text-lg font-medium">No hay clientes registrados</p>
                  <p className="text-gray-400 text-sm mt-1">Pulsa "Nuevo Cliente" para añadir el primero</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Cliente</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Teléfono</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Vehículo</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">OEM</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clientes.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{c.nombre}</div>
                          {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.telefono || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {[c.marca_coche, c.modelo_coche, c.anio_coche, c.version_coche].filter(Boolean).join(' ') || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.pieza_buscada || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(c.fecha_registro).toLocaleDateString('es-ES')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => editarCliente(c)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => borrarCliente(c.id)}
                              className="text-red-500 hover:text-red-700 text-xs font-medium"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ TAB 2: BUSCAR PIEZAS ═══════════ */}
        {tabActiva === 'buscar' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Búsqueda Completa de Piezas</h2>
            <p className="text-sm text-gray-500">
              Busca por OEM: primero equivalentes, luego stock propio, referencias IAM y desguaces competidores.
            </p>

            {/* Barra de búsqueda */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Introduce referencia OEM (ej: 1K0941005S)"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && !buscando && handleBuscarPiezas()}
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono tracking-wide"
              />
              <button
                onClick={handleBuscarPiezas}
                disabled={buscando}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 min-w-[120px] justify-center"
              >
                {buscando ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                )}
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>

            {/* Indicador de fase */}
            {buscando && faseActual && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent flex-shrink-0" />
                <p className="text-sm text-blue-700">{faseActual}</p>
              </div>
            )}

            {/* Resultados */}
            {resultados && !buscando && (
              <div className="space-y-4">
                {/* Resumen rápido */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  <div className="bg-white rounded-lg border p-2 text-center">
                    <div className="text-xl font-bold text-green-600">{resultados.total_stock || 0}</div>
                    <div className="text-xs text-gray-500">Tu stock</div>
                  </div>
                  <div className="bg-white rounded-lg border p-2 text-center">
                    <div className="text-xl font-bold text-teal-600">{resultados.total_otros_entornos || 0}</div>
                    <div className="text-xs text-gray-500">Otros desguaces</div>
                  </div>
                  <div className="bg-white rounded-lg border p-2 text-center">
                    <div className="text-xl font-bold text-orange-600">{resultados.total_desguaces || 0}</div>
                    <div className="text-xs text-gray-500">Ext. desguaces</div>
                  </div>
                  <div className="bg-white rounded-lg border p-2 text-center">
                    <div className="text-xl font-bold text-blue-600">{resultados.total_oem || 0}</div>
                    <div className="text-xs text-gray-500">OEM equiv.</div>
                  </div>
                  <div className="bg-white rounded-lg border p-2 text-center">
                    <div className="text-xl font-bold text-purple-600">{resultados.total_iam || 0}</div>
                    <div className="text-xs text-gray-500">Refs IAM</div>
                  </div>
                  <div className="bg-white rounded-lg border p-2 text-center">
                    <div className="text-xl font-bold text-gray-600">{(resultados.piezas_vendidas || []).length}</div>
                    <div className="text-xs text-gray-500">Vendidas</div>
                  </div>
                </div>

                {/* ── Sección: Stock Propio ── */}
                
                {/* ── OEM Equivalentes (arriba de todo) ── */}
                {(resultados.oem_equivalentes || []).length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden mb-4">
                    <button
                      onClick={() => toggleSeccion('oem')}
                      className="w-full px-3 py-2 flex items-center justify-between bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="font-semibold text-blue-800">OEM Equivalentes encontrados</span>
                        <span className="text-sm text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">{resultados.oem_equivalentes.length}</span>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 text-blue-600 transition-transform ${seccionAbierta.oem ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {seccionAbierta.oem && (
                      <div className="p-4">
                        <p className="text-xs text-gray-500 mb-3">
                          Estas referencias OEM son equivalentes. El sistema ya las ha buscado en tu stock y en desguaces.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {resultados.oem_equivalentes.map((ref: string, i: number) => (
                            <span key={i} className="font-mono text-sm bg-blue-50 text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5">
                              {ref}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Grid de 3 columnas: Stock | Desguaces | IAM ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  
                  {/* ── Columna 1: Tu Stock ── */}
                  <div className="space-y-4">
                {(resultados.stock_propio || []).length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <button
                      onClick={() => toggleSeccion('stock')}
                      className="w-full px-3 py-2 flex items-center justify-between bg-green-50 hover:bg-green-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="font-semibold text-green-800">Tu Stock</span>
                        <span className="text-sm text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{resultados.stock_propio.length}</span>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 text-green-600 transition-transform ${seccionAbierta.stock ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {seccionAbierta.stock && (
                      <div className="divide-y divide-gray-100">
                        {resultados.stock_propio.map((p: any) => (
                          <div key={`stock-${p.id}`} className="px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
                            {p.imagen && (
                              <img src={p.imagen} alt="" className="w-16 h-16 object-cover rounded-lg border flex-shrink-0 cursor-pointer hover:opacity-80" onClick={() => setImagenGrande(p.imagen)} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{p.articulo || p.refid || 'Pieza'}</div>
                              <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                                {p.oem && <span>OEM: <span className="font-mono">{p.oem}</span></span>}
                                {p.marca && <span>{p.marca} {p.modelo}</span>}
                                {p.ubicacion && <span>Ubic: {p.ubicacion}</span>}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {p.precio != null ? (
                                <span className="text-base font-bold text-green-700">{Number(p.precio).toFixed(2)} €</span>
                              ) : (
                                <span className="text-gray-400 text-xs">Sin precio</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Sección: Otros Desguaces (misma plataforma) ── */}
                {(resultados.stock_otros_entornos || []).length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <button
                      onClick={() => toggleSeccion('otros')}
                      className="w-full px-3 py-2 flex items-center justify-between bg-teal-50 hover:bg-teal-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-teal-500" />
                        <span className="font-semibold text-teal-800">Otros Desguaces</span>
                        <span className="text-sm text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">{resultados.stock_otros_entornos.length}</span>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 text-teal-600 transition-transform ${seccionAbierta.otros ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {seccionAbierta.otros && (
                      <div className="divide-y divide-gray-100">
                        {resultados.stock_otros_entornos.map((p: any, idx: number) => (
                          <div key={`otros-${p.id || idx}`} className="px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
                            {p.imagen && (
                              <img src={p.imagen} alt="" className="w-16 h-16 object-cover rounded-lg border flex-shrink-0 cursor-pointer hover:opacity-80" onClick={() => setImagenGrande(p.imagen)} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{p.articulo || p.refid || 'Pieza'}</div>
                              <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                                {p.oem && <span>OEM: <span className="font-mono">{p.oem}</span></span>}
                                {p.marca && <span>{p.marca} {p.modelo}</span>}
                                {p.ubicacion && <span>Ubic: {p.ubicacion}</span>}
                              </div>
                              <span className="text-xs font-medium text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{p.fuente_nombre || 'Otro desguace'}</span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {p.precio != null ? (
                                <span className="text-base font-bold text-teal-700">{Number(p.precio).toFixed(2)} €</span>
                              ) : p.precio_texto ? (
                                <span className="text-base font-bold text-teal-700">{p.precio_texto}</span>
                              ) : (
                                <span className="text-gray-400 text-xs">Sin precio</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                  </div>

                  {/* ── Columna 2: Desguaces Competidores ── */}
                  <div className="space-y-4">
                {/* ── Sección: Desguaces Competidores ── */}
                {(resultados.resultados_desguaces || []).length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <button
                      onClick={() => toggleSeccion('desguaces')}
                      className="w-full px-3 py-2 flex items-center justify-between bg-orange-50 hover:bg-orange-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="font-semibold text-orange-800">Desguaces Competidores</span>
                        <span className="text-sm text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{resultados.resultados_desguaces.length}</span>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 text-orange-600 transition-transform ${seccionAbierta.desguaces ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {seccionAbierta.desguaces && (
                      <div className="divide-y divide-gray-100">
                        {resultados.resultados_desguaces.map((p: any, idx: number) => (
                          <div key={`desg-${p.desguace_id}-${p.id}-${idx}`} className="px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
                            {p.imagen && (
                              <img src={p.imagen} alt="" className="w-16 h-16 object-cover rounded-lg border flex-shrink-0 cursor-pointer hover:opacity-80" onClick={() => setImagenGrande(p.imagen)} onError={(e) => (e.currentTarget.style.display = 'none')} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{p.titulo || 'Pieza'}</div>
                              <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                                {p.oem && <span>OEM: <span className="font-mono">{p.oem}</span></span>}
                                {p.vehiculo && <span>{p.vehiculo}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">{p.desguace}</span>
                                {p.url && (
                                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 underline">
                                    Ver pieza
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {p.precio != null ? (
                                <span className="text-base font-bold text-orange-700">{Number(p.precio).toFixed(2)} €</span>
                              ) : p.precio_texto ? (
                                <span className="text-base font-bold text-orange-700">{p.precio_texto}</span>
                              ) : (
                                <span className="text-gray-400 text-xs">Sin precio</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                  </div>

                  {/* ── Columna 3: Referencias IAM ── */}
                  <div className="space-y-4">
                {/* ── Sección: Referencias IAM ── */}
                {(resultados.piezas_nuevas_iam || []).length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSeccion('iam')}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-100 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
                          </svg>
                        </div>
                        <div className="text-left">
                          <span className="font-semibold text-purple-900 block">Referencias IAM</span>
                          <span className="text-xs text-purple-600">Piezas nuevas equivalentes</span>
                        </div>
                        <span className="text-sm font-bold text-white bg-purple-500 px-2.5 py-1 rounded-full">{resultados.piezas_nuevas_iam.length}</span>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 text-purple-600 transition-transform duration-200 ${seccionAbierta.iam ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {seccionAbierta.iam && (
                      <div className="p-3 space-y-3">
                        {resultados.piezas_nuevas_iam.map((item: any, i: number) => (
                          <div key={i} className="group bg-gray-50 hover:bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all duration-200 overflow-hidden">
                            <div className="flex gap-3 p-3">
                              {item.image_url ? (
                                <div className="relative flex-shrink-0">
                                  <img 
                                    src={item.image_url} 
                                    alt="" 
                                    className="w-20 h-20 object-cover rounded-lg cursor-pointer group-hover:scale-105 transition-transform duration-200" 
                                    onClick={() => setImagenGrande(item.image_url)} 
                                    onError={(e) => (e.currentTarget.parentElement!.innerHTML = '<div class="w-20 h-20 rounded-lg bg-purple-100 flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8 text-purple-300"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg></div>')} 
                                  />
                                  <div className="absolute inset-0 bg-black/0 hover:bg-black/10 rounded-lg transition-colors cursor-pointer" onClick={() => setImagenGrande(item.image_url)} />
                                </div>
                              ) : (
                                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center flex-shrink-0">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-purple-300">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                                  </svg>
                                </div>
                              )}
                              <div className="flex-1 min-w-0 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <span className="font-mono text-sm font-bold text-gray-900 bg-white px-2 py-0.5 rounded border">{item.iam_ref || '—'}</span>
                                    <span className="text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-purple-600 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm">{item.source || 'IAM'}</span>
                                  </div>
                                  {(item.brand && item.brand !== 'N/A') && (
                                    <div className="text-xs font-medium text-purple-700 mb-0.5">{item.brand}</div>
                                  )}
                                  {(item.description && item.description !== 'N/A') && (
                                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{item.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center justify-end mt-2">
                                  <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-2.5 py-1 rounded-full">Consultar precio</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                  </div>
                </div>

                {/* ── Vendidas (debajo del grid) ── */}
                {(resultados.piezas_vendidas || []).length > 0 && (
                  <div className="bg-white rounded-xl border overflow-hidden mt-4">
                    <button
                      onClick={() => toggleSeccion('vendidas')}
                      className="w-full px-3 py-2 flex items-center justify-between bg-amber-50 hover:bg-amber-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="font-semibold text-amber-800">Vendidas anteriormente</span>
                        <span className="text-sm text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{resultados.piezas_vendidas.length}</span>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-4 h-4 text-amber-600 transition-transform ${seccionAbierta.vendidas ? 'rotate-180' : ''}`}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {seccionAbierta.vendidas && (
                      <div className="divide-y divide-gray-100">
                        {resultados.piezas_vendidas.map((p: any, idx: number) => (
                          <div key={`vend-${p.id || idx}`} className="px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{p.articulo || p.refid || 'Pieza vendida'}</div>
                              <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                                {p.oem && <span>OEM: <span className="font-mono">{p.oem}</span></span>}
                                {p.fecha_venta && <span>Vendida: {new Date(p.fecha_venta).toLocaleDateString('es-ES')}</span>}
                                {p.dias_rotacion != null && <span>Rotación: {p.dias_rotacion}d</span>}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {p.precio != null ? (
                                <span className="text-base font-bold text-amber-700">{Number(p.precio).toFixed(2)} €</span>
                              ) : (
                                <span className="text-gray-400 text-xs">Sin precio</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Errores ── */}
                {resultados.errores && Object.keys(resultados.errores).length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm font-medium text-red-800 mb-2">Errores durante la búsqueda:</p>
                    {Object.entries(resultados.errores).map(([key, val]) => (
                      <p key={key} className="text-xs text-red-600">{key}: {String(val)}</p>
                    ))}
                  </div>
                )}

                {/* ── Sin resultados ── */}
                {resultados.total_stock === 0 && (resultados.total_otros_entornos || 0) === 0 && resultados.total_desguaces === 0 && (resultados.piezas_nuevas_iam || []).length === 0 && (
                  <div className="bg-white rounded-xl border p-12 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-300 mb-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
                    </svg>
                    <p className="text-gray-500 text-lg font-medium">No se encontraron piezas</p>
                    <p className="text-gray-400 text-sm mt-1">Ni en tu stock, ni en otros desguaces, ni referencias IAM</p>
                  </div>
                )}

                {/* Desguaces consultados */}
                {resultados.desguaces_disponibles && Object.keys(resultados.desguaces_disponibles).length > 0 && (
                  <div className="text-xs text-gray-400 text-right">
                    Desguaces consultados: {Object.values(resultados.desguaces_disponibles).join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Estado vacío inicial */}
            {!resultados && !buscando && (
              <div className="bg-white rounded-xl border p-12 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-300 mb-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <p className="text-gray-500 text-lg font-medium">Búsqueda completa de piezas</p>
                <p className="text-gray-400 text-sm mt-1">Introduce una referencia OEM para buscar en tu stock, desguaces y proveedores IAM</p>
                <div className="flex flex-wrap gap-3 justify-center mt-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Tu stock</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block" /> Otros desguaces</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Ext. desguaces</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> Piezas nuevas (IAM)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> OEM equivalentes</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Lightbox de imagen ── */}
      {imagenGrande && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setImagenGrande(null)}
        >
          <button
            onClick={() => setImagenGrande(null)}
            className="absolute top-4 right-4 bg-white/90 rounded-full p-2 shadow-lg hover:bg-white transition-colors z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={imagenGrande}
            alt="Pieza ampliada"
            className="max-w-[95vw] max-h-[95vh] object-contain cursor-default"
            onClick={(e) => e.stopPropagation()}
            onError={() => { setImagenGrande(null); toast.error('No se pudo cargar la imagen'); }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Export con protección de módulo ─────────────────────
export default function VentaPage() {
  return (
    <ModuloProtegido modulo="ventas">
      <VentaContent />
    </ModuloProtegido>
  );
}
