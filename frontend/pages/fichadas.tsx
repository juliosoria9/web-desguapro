'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import ModuloProtegido from '@/components/ModuloProtegido';
import axios from 'axios';
import toast from 'react-hot-toast';

interface FichadaDetalle {
  id: number;
  id_pieza: string;
  descripcion: string | null;
  comentario: string | null;
  hora: string;
  minutos_desde_anterior: number | null;
  color: string;
  en_stock: boolean | null;  // null=no verificado, true=entró, false=no entró
  imagen: string | null;  // URL de imagen de la pieza
  articulo: string | null;  // Tipo de pieza
  marca: string | null;  // Marca del vehículo
  modelo: string | null;  // Modelo del vehículo
}

// Interface para pieza de stock (para el modal de detalle)
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
  fecha_venta?: string | null;  // Si está vendida
}

// Estado de la pieza: en_stock, vendida, no_encontrada
type EstadoPieza = 'en_stock' | 'vendida' | 'no_encontrada';

interface MiFichada {
  id: number;
  id_pieza: string;
  descripcion: string | null;
  comentario: string | null;
  fecha_fichada: string;
  usuario_email: string;
  en_stock: boolean | null;  // null=no verificado, true=entró, false=no entró
}

interface ResumenUsuario {
  usuario_id: number;
  usuario_email: string;
  usuario_nombre: string | null;
  total_fichadas: number;
  primera_fichada: string | null;
  ultima_fichada: string | null;
}

interface ResumenDia {
  fecha: string;
  usuarios: ResumenUsuario[];
  total_general: number;
}

interface DetalleFichadas {
  usuario_email: string;
  fecha: string;
  fichadas: FichadaDetalle[];
  total: number;
}

interface ResumenEquipoItem {
  usuario_nombre: string | null;
  usuario_email: string;
  total_fichadas: number;
}

interface ResumenEquipo {
  fecha: string;
  usuarios: ResumenEquipoItem[];
  total_general: number;
}

const COLORES_TIEMPO: { [key: string]: string } = {
  gray: 'bg-gray-100 border-gray-300 text-gray-700',
  green: 'bg-green-100 border-green-300 text-green-700',
  yellow: 'bg-yellow-100 border-yellow-300 text-yellow-700',
  orange: 'bg-orange-100 border-orange-300 text-orange-700',
  red: 'bg-red-100 border-red-300 text-red-700',
};

function FichadasContent() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  
  // Estado para empresas (sysowner)
  const [empresas, setEmpresas] = useState<{id: number, nombre: string}[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
  
  // Estado para resumen
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  
  // Estado para detalle
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<DetalleFichadas | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Estado para mis fichadas (usuarios normales)
  const [misFichadas, setMisFichadas] = useState<MiFichada[]>([]);
  const [cargandoMisFichadas, setCargandoMisFichadas] = useState(false);

  // Estado para resumen del equipo (usuarios normales)
  const [resumenEquipo, setResumenEquipo] = useState<ResumenEquipo | null>(null);

  // Estado para borrar
  const [borrando, setBorrando] = useState<number | null>(null);

  // Estado para comentarios
  const [editandoComentario, setEditandoComentario] = useState<number | null>(null);
  const [comentarioTemp, setComentarioTemp] = useState<string>('');
  const [guardandoComentario, setGuardandoComentario] = useState(false);

  // Estado para descripción
  const [editandoDescripcion, setEditandoDescripcion] = useState<number | null>(null);
  const [descripcionTemp, setDescripcionTemp] = useState<string>('');
  const [guardandoDescripcion, setGuardandoDescripcion] = useState(false);

  // Estado para modal de detalle de pieza
  const [piezaDetalle, setPiezaDetalle] = useState<PiezaStock | null>(null);
  const [estadoPieza, setEstadoPieza] = useState<EstadoPieza | null>(null);
  const [mensajePieza, setMensajePieza] = useState<string | null>(null);
  const [cargandoPieza, setCargandoPieza] = useState(false);

  const esAdmin = user?.rol && ['admin', 'owner', 'sysowner'].includes(user.rol);
  const esSysowner = user?.rol === 'sysowner';

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  // Cargar empresas para sysowner
  useEffect(() => {
    if (mounted && user && esSysowner) {
      fetchEmpresas();
    }
  }, [mounted, user]);

  // Cargar datos cuando cambie la empresa seleccionada o la fecha
  useEffect(() => {
    if (mounted && user) {
      const esAdminActual = user?.rol && ['admin', 'owner', 'sysowner'].includes(user.rol);
      if (esAdminActual) {
        // sysowner necesita empresa seleccionada
        if (esSysowner && !selectedEmpresa) return;
        cargarResumen();
      } else {
        cargarMisFichadas();
        cargarResumenEquipo();
      }
    }
  }, [mounted, fechaFiltro, user, selectedEmpresa]);

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

  const cargarResumen = async () => {
    setCargandoResumen(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/resumen-dia?fecha=${fechaFiltro}`;
      if (esSysowner && selectedEmpresa) {
        url += `&entorno_id=${selectedEmpresa}`;
      }
      const response = await axios.get<ResumenDia>(
        url,
        { withCredentials: true }
      );
      setResumen(response.data);
    } catch (error) {
      console.error('Error cargando resumen:', error);
    } finally {
      setCargandoResumen(false);
    }
  };

  const cargarMisFichadas = async () => {
    setCargandoMisFichadas(true);
    try {
      const response = await axios.get<MiFichada[]>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/mis-fichadas?fecha=${fechaFiltro}&limite=5000`,
        { withCredentials: true }
      );
      setMisFichadas(response.data);
    } catch (error) {
      console.error('Error cargando mis fichadas:', error);
    } finally {
      setCargandoMisFichadas(false);
    }
  };

  const cargarResumenEquipo = async () => {
    try {
      const response = await axios.get<ResumenEquipo>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/resumen-equipo?fecha=${fechaFiltro}`,
        { withCredentials: true }
      );
      setResumenEquipo(response.data);
    } catch (error) {
      console.error('Error cargando resumen equipo:', error);
    }
  };

  const verDetalle = async (usuarioId: number) => {
    if (usuarioSeleccionado === usuarioId) {
      setUsuarioSeleccionado(null);
      setDetalle(null);
      return;
    }
    
    setUsuarioSeleccionado(usuarioId);
    setCargandoDetalle(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/detalle-usuario/${usuarioId}?fecha=${fechaFiltro}`;
      if (esSysowner && selectedEmpresa) {
        url += `&entorno_id=${selectedEmpresa}`;
      }
      const response = await axios.get<DetalleFichadas>(
        url,
        { withCredentials: true }
      );
      setDetalle(response.data);
    } catch (error) {
      console.error('Error cargando detalle:', error);
      toast.error('Error al cargar detalle');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const borrarFichada = async (fichadaId: number, esDeHoy: boolean) => {
    // Si no es admin y no es de hoy, no puede borrar
    if (!esAdmin && !esDeHoy) {
      toast.error('Solo puedes borrar fichadas del día actual');
      return;
    }

    if (!confirm('¿Estás seguro de que deseas borrar esta fichada?')) {
      return;
    }

    setBorrando(fichadaId);
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/borrar/${fichadaId}`,
        { withCredentials: true }
      );
      toast.success('Fichada eliminada correctamente');
      
      // Recargar datos
      if (esAdmin) {
        cargarResumen();
        if (usuarioSeleccionado) {
          // Recargar detalle del usuario actual
          const response = await axios.get<DetalleFichadas>(
            `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/detalle-usuario/${usuarioSeleccionado}?fecha=${fechaFiltro}`,
            { withCredentials: true }
          );
          setDetalle(response.data);
        }
      } else {
        cargarMisFichadas();
      }
    } catch (error: any) {
      console.error('Error borrando fichada:', error);
      toast.error(error.response?.data?.detail || 'Error al borrar fichada');
    } finally {
      setBorrando(null);
    }
  };

  const guardarComentario = async (fichadaId: number) => {
    setGuardandoComentario(true);
    try {
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/comentario/${fichadaId}`,
        { comentario: comentarioTemp || null },
        { withCredentials: true }
      );
      toast.success('Comentario guardado');
      
      // Actualizar el detalle local
      if (detalle) {
        setDetalle({
          ...detalle,
          fichadas: detalle.fichadas.map(f => 
            f.id === fichadaId ? { ...f, comentario: comentarioTemp || null } : f
          )
        });
      }
      
      setEditandoComentario(null);
      setComentarioTemp('');
    } catch (error: any) {
      console.error('Error guardando comentario:', error);
      toast.error(error.response?.data?.detail || 'Error al guardar comentario');
    } finally {
      setGuardandoComentario(false);
    }
  };

  const iniciarEdicionComentario = (fichada: FichadaDetalle) => {
    setEditandoComentario(fichada.id);
    setComentarioTemp(fichada.comentario || '');
  };

  const cancelarEdicionComentario = () => {
    setEditandoComentario(null);
    setComentarioTemp('');
  };

  // Funciones para editar comentarios en misFichadas
  const iniciarEdicionComentarioMiFichada = (fichada: MiFichada) => {
    setEditandoComentario(fichada.id);
    setComentarioTemp(fichada.comentario || '');
  };

  const guardarComentarioMiFichada = async (fichadaId: number) => {
    setGuardandoComentario(true);
    try {
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/comentario/${fichadaId}`,
        { comentario: comentarioTemp || null },
        { withCredentials: true }
      );
      toast.success('Comentario guardado');
      
      // Actualizar misFichadas local
      setMisFichadas(prev => 
        prev.map(f => 
          f.id === fichadaId ? { ...f, comentario: comentarioTemp || null } : f
        )
      );
      
      setEditandoComentario(null);
      setComentarioTemp('');
    } catch (error: any) {
      console.error('Error guardando comentario:', error);
      toast.error(error.response?.data?.detail || 'Error al guardar comentario');
    } finally {
      setGuardandoComentario(false);
    }
  };

  // Funciones para editar descripción en misFichadas
  const iniciarEdicionDescripcionMiFichada = (fichada: MiFichada) => {
    setEditandoDescripcion(fichada.id);
    setDescripcionTemp(fichada.descripcion || '');
  };

  const cancelarEdicionDescripcion = () => {
    setEditandoDescripcion(null);
    setDescripcionTemp('');
  };

  const guardarDescripcionMiFichada = async (fichadaId: number) => {
    setGuardandoDescripcion(true);
    try {
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/fichadas/descripcion/${fichadaId}`,
        { descripcion: descripcionTemp || null },
        { withCredentials: true }
      );
      toast.success('Descripción guardada');
      
      // Actualizar misFichadas local
      setMisFichadas(prev => 
        prev.map(f => 
          f.id === fichadaId ? { ...f, descripcion: descripcionTemp || null } : f
        )
      );
      
      setEditandoDescripcion(null);
      setDescripcionTemp('');
    } catch (error: any) {
      console.error('Error guardando descripción:', error);
      toast.error(error.response?.data?.detail || 'Error al guardar descripción');
    } finally {
      setGuardandoDescripcion(false);
    }
  };

  const esFechaHoy = (fechaStr: string) => {
    const hoy = new Date().toISOString().split('T')[0];
    return fechaStr.startsWith(hoy);
  };

  // Función para buscar pieza en stock por refid
  const buscarPiezaEnStock = async (idPieza: string) => {
    setCargandoPieza(true);
    setEstadoPieza(null);
    setMensajePieza(null);
    try {
      // Usar el nuevo endpoint que busca también en vendidas
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/desguace/stock/buscar-pieza/${encodeURIComponent(idPieza)}`;
      if (esSysowner && selectedEmpresa) {
        url += `?entorno_id=${selectedEmpresa}`;
      }
      
      const response = await axios.get(url, { withCredentials: true });
      
      if (response.data.encontrada) {
        setPiezaDetalle(response.data.pieza);
        setEstadoPieza(response.data.estado);
        if (response.data.mensaje) {
          setMensajePieza(response.data.mensaje);
        }
        if (response.data.estado === 'vendida') {
          toast.success(`Pieza vendida: ${response.data.mensaje}`, { duration: 4000 });
        }
      } else {
        setPiezaDetalle(null);
        setEstadoPieza('no_encontrada');
        setMensajePieza(response.data.mensaje || 'Pieza no encontrada');
        toast.error('Pieza no encontrada en stock ni en historial');
      }
    } catch (error: any) {
      console.error('Error buscando pieza:', error);
      toast.error('Error al buscar pieza en stock');
    } finally {
      setCargandoPieza(false);
    }
  };

  // Función para obtener array de imágenes desde string separado por comas
  const getImagenes = (imagenStr: string | null): string[] => {
    if (!imagenStr) return [];
    return imagenStr.split(',').map(url => url.trim()).filter(url => url.length > 0);
  };

  // Formatear moneda
  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
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
                <p className="text-xs text-gray-500">Fichadas de Piezas</p>
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
        {/* Selector de empresa para sysowner */}
        {esSysowner && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Empresa:</label>
              <select
                value={selectedEmpresa || ''}
                onChange={(e) => {
                  setSelectedEmpresa(e.target.value ? Number(e.target.value) : null);
                  setUsuarioSeleccionado(null);
                  setDetalle(null);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">-- Selecciona una empresa --</option>
                {empresas.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Piezas fichadas */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {esAdmin ? 'Piezas Fichadas - Todos los usuarios' : 'Mis Piezas Fichadas'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Fecha:</label>
              <input
                type="date"
                value={fechaFiltro}
                onChange={(e) => setFechaFiltro(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                onClick={() => setFechaFiltro(new Date().toISOString().split('T')[0])}
                className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Hoy
              </button>
            </div>
          </div>

          {/* Leyenda de colores (solo para admins) */}
          {esAdmin && (
            <div className="flex flex-wrap gap-4 mb-4 text-xs">
              <span className="text-gray-500">Tiempo entre piezas:</span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-500"></span> 0-5 min
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-yellow-500"></span> 5-15 min
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-orange-500"></span> 15-30 min
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-500"></span> +30 min
              </span>
            </div>
          )}

          {/* Vista para usuarios normales - Mis Fichadas */}
          {!esAdmin && (
            <>
              {cargandoMisFichadas ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : misFichadas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No tienes fichadas para esta fecha
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-3 py-1.5 bg-gray-50 rounded">
                    <div className="col-span-1">#</div>
                    <div className="col-span-2">Hora</div>
                    <div className="col-span-3">ID Pieza</div>
                    <div className="col-span-5">Descripción</div>
                    <div className="col-span-1 text-center">🗑</div>
                  </div>
                  
                  {misFichadas.map((fichada, idx) => {
                    const esDeHoy = esFechaHoy(fichada.fecha_fichada);
                    const editandoComentarioEste = editandoComentario === fichada.id;
                    const editandoDescripcionEste = editandoDescripcion === fichada.id;
                    const tieneComentario = fichada.comentario || editandoComentarioEste;
                    return (
                      <div 
                        key={fichada.id}
                        className={`px-3 rounded border bg-white border-gray-200 hover:bg-gray-50 ${tieneComentario ? 'py-2' : 'py-1.5'}`}
                      >
                        {/* Fila principal */}
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-1 text-xs text-gray-400">#{idx + 1}</div>
                          <div className="col-span-2 font-mono text-xs text-gray-600">
                            {new Date(fichada.fecha_fichada).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="col-span-3 flex items-center gap-1.5">
                            {/* Indicador de stock */}
                            <span className="w-4 text-center" title={
                              fichada.en_stock === null 
                                ? 'Pendiente de verificación' 
                                : fichada.en_stock 
                                  ? 'Pieza encontrada en stock ✓' 
                                  : 'Pieza NO encontrada en stock ✗'
                            }>
                              {fichada.en_stock === null ? (
                                <span className="text-gray-400 text-xs">-</span>
                              ) : fichada.en_stock ? (
                                <span className="text-green-600 font-bold text-sm">✓</span>
                              ) : (
                                <span className="text-red-600 font-bold text-sm">✗</span>
                              )}
                            </span>
                            <span 
                              className="font-mono font-medium text-blue-600 text-sm cursor-pointer hover:text-blue-800 hover:underline"
                              onClick={() => buscarPiezaEnStock(fichada.id_pieza)}
                              title="Ver detalle de pieza"
                            >
                              {cargandoPieza ? '...' : fichada.id_pieza}
                            </span>
                          </div>
                          <div className="col-span-5 flex items-center gap-2">
                            {editandoDescripcionEste ? (
                              <div className="flex gap-1 flex-1">
                                <input
                                  type="text"
                                  value={descripcionTemp}
                                  onChange={(e) => setDescripcionTemp(e.target.value)}
                                  className="flex-1 px-2 py-0.5 text-sm border border-green-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                                  placeholder="Descripción..."
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') guardarDescripcionMiFichada(fichada.id);
                                    if (e.key === 'Escape') cancelarEdicionDescripcion();
                                  }}
                                />
                                <button
                                  onClick={() => guardarDescripcionMiFichada(fichada.id)}
                                  disabled={guardandoDescripcion}
                                  className="px-1.5 py-0.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                >
                                  {guardandoDescripcion ? '...' : '✓'}
                                </button>
                                <button
                                  onClick={cancelarEdicionDescripcion}
                                  className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div 
                                className="text-sm text-gray-600 cursor-pointer hover:text-green-600 truncate"
                                onClick={() => iniciarEdicionDescripcionMiFichada(fichada)}
                                title={fichada.descripcion || 'Clic para añadir descripción'}
                              >
                                {fichada.descripcion || (
                                  <span className="text-gray-400 italic text-xs">+ descripción</span>
                                )}
                              </div>
                            )}
                            {/* Botón de comentario en línea si no hay comentario */}
                            {!fichada.comentario && !editandoComentarioEste && (
                              <button
                                className="ml-2 text-xs text-gray-400 hover:text-blue-500"
                                onClick={() => iniciarEdicionComentarioMiFichada(fichada)}
                                title="Añadir comentario"
                              >
                                💬
                              </button>
                            )}
                          </div>
                          <div className="col-span-1 flex justify-center">
                            {esDeHoy ? (
                              <button
                                onClick={() => borrarFichada(fichada.id, esDeHoy)}
                                disabled={borrando === fichada.id}
                                className="text-red-500 hover:text-red-700 disabled:opacity-50"
                                title="Borrar fichada"
                              >
                                {borrando === fichada.id ? (
                                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                  </svg>
                                )}
                              </button>
                            ) : (
                              <span title="Solo puedes borrar fichadas del día actual">
                                <svg className="h-4 w-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                                </svg>
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Fila de comentario (burbuja debajo) - solo si hay comentario o está editando */}
                        {(fichada.comentario || editandoComentarioEste) && (
                          <div className="mt-1.5 ml-6">
                            {editandoComentarioEste ? (
                              <div className="flex gap-1 items-center bg-blue-50 rounded-lg px-2 py-1.5 border border-blue-200">
                                <span className="text-xs text-blue-400">💬</span>
                                <input
                                  type="text"
                                  value={comentarioTemp}
                                  onChange={(e) => setComentarioTemp(e.target.value)}
                                  className="flex-1 px-2 py-0.5 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                  placeholder="Escribe un comentario..."
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') guardarComentarioMiFichada(fichada.id);
                                    if (e.key === 'Escape') cancelarEdicionComentario();
                                  }}
                                />
                                <button
                                  onClick={() => guardarComentarioMiFichada(fichada.id)}
                                  disabled={guardandoComentario}
                                  className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {guardandoComentario ? '...' : '✓'}
                                </button>
                                <button
                                  onClick={cancelarEdicionComentario}
                                  className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div 
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full cursor-pointer hover:bg-blue-100 hover:border-blue-300 transition-colors"
                                onClick={() => iniciarEdicionComentarioMiFichada(fichada)}
                                title="Clic para editar comentario"
                              >
                                <span className="text-xs">💬</span>
                                <span className="text-xs text-blue-700 italic">{fichada.comentario}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Total */}
                  <div className="pt-3 mt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center px-3">
                      <span className="font-medium text-gray-700">Total del día:</span>
                      <span className="text-lg font-bold text-blue-600">{misFichadas.length} fichadas</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen del equipo */}
              {resumenEquipo && resumenEquipo.usuarios.length > 0 && (
                <div className="mt-6 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg border border-teal-200 p-4">
                  <h3 className="text-sm font-semibold text-teal-800 mb-3 flex items-center gap-2">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                    </svg>
                    Fichadas del equipo - {fechaFiltro === new Date().toISOString().split('T')[0] ? 'Hoy' : fechaFiltro}
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {resumenEquipo.usuarios.map((u) => (
                      <div 
                        key={u.usuario_email}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                          u.usuario_email === user?.email 
                            ? 'bg-teal-100 border-teal-400' 
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <span className="text-sm text-gray-700">
                          {u.usuario_nombre || u.usuario_email.split('@')[0]}
                        </span>
                        <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-sm font-bold ${
                          u.usuario_email === user?.email 
                            ? 'bg-teal-600 text-white' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {u.total_fichadas}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-teal-200 flex justify-between items-center text-sm">
                    <span className="text-teal-700">Total del equipo:</span>
                    <span className="font-bold text-teal-800">{resumenEquipo.total_general} fichadas</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Vista para admins - Resumen de todos */}
          {esAdmin && (
            <>
              {cargandoResumen ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : resumen ? (
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-3 py-2 bg-gray-50 rounded">
                <div className="col-span-3">Usuario</div>
                <div className="col-span-2 text-center">Fichadas</div>
                <div className="col-span-2 text-center">Primera</div>
                <div className="col-span-2 text-center">Última</div>
                <div className="col-span-1 text-center">Informe</div>
                <div className="col-span-2 text-center">Acción</div>
              </div>
              
              {resumen.usuarios.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No hay fichadas para esta fecha
                </div>
              ) : (
                resumen.usuarios.map((usuario) => (
                  <div key={usuario.usuario_id}>
                    <div 
                      className={`grid grid-cols-12 gap-2 items-center px-3 py-3 rounded border cursor-pointer transition-colors ${
                        usuarioSeleccionado === usuario.usuario_id 
                          ? 'bg-blue-50 border-blue-300' 
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => verDetalle(usuario.usuario_id)}
                    >
                      <div className="col-span-3">
                        <p className="font-medium text-gray-900">{usuario.usuario_nombre || usuario.usuario_email}</p>
                        {usuario.usuario_nombre && (
                          <p className="text-xs text-gray-500">{usuario.usuario_email}</p>
                        )}
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold ${
                          usuario.total_fichadas > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {usuario.total_fichadas}
                        </span>
                      </div>
                      <div className="col-span-2 text-center text-sm text-gray-600">
                        {usuario.primera_fichada || '-'}
                      </div>
                      <div className="col-span-2 text-center text-sm text-gray-600">
                        {usuario.ultima_fichada || '-'}
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = esSysowner && selectedEmpresa 
                              ? `/informe-fichadas/${usuario.usuario_id}?entorno=${selectedEmpresa}`
                              : `/informe-fichadas/${usuario.usuario_id}`;
                            router.push(url);
                          }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600 hover:bg-purple-200 transition-colors"
                          title="Ver informe de rendimiento"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </button>
                      </div>
                      <div className="col-span-2 text-center">
                        {usuario.total_fichadas > 0 && (
                          <button className="text-sm text-blue-600 hover:underline">
                            {usuarioSeleccionado === usuario.usuario_id ? 'Ocultar' : 'Ver detalle'}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Detalle expandido */}
                    {usuarioSeleccionado === usuario.usuario_id && detalle && (
                      <div className="ml-4 mt-2 mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        {cargandoDetalle ? (
                          <div className="text-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-700 mb-3">
                              Desglose de {detalle.total} fichadas:
                            </div>
                            <div className="grid gap-2">
                              {detalle.fichadas.map((fichada, idx) => (
                                <div key={fichada.id} className="space-y-1">
                                  <div 
                                    className={`flex items-center gap-3 px-3 py-2 rounded border ${COLORES_TIEMPO[fichada.color]}`}
                                  >
                                    <span className="text-xs text-gray-500 w-6">#{idx + 1}</span>
                                    <span className="font-mono font-medium">{fichada.hora}</span>
                                    {/* Miniatura de imagen si existe */}
                                    {fichada.imagen && fichada.en_stock && (
                                      <div className="flex-shrink-0">
                                        <img 
                                          src={fichada.imagen.split(',')[0].trim()} 
                                          alt={fichada.id_pieza}
                                          className="w-10 h-10 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-80"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            buscarPiezaEnStock(fichada.id_pieza);
                                          }}
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                          }}
                                        />
                                      </div>
                                    )}
                                    <span 
                                      className="font-mono text-sm text-blue-600 cursor-pointer hover:text-blue-800 hover:underline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        buscarPiezaEnStock(fichada.id_pieza);
                                      }}
                                      title="Ver detalle de pieza"
                                    >
                                      {fichada.id_pieza}
                                    </span>
                                    {/* Artículo y coche si existe */}
                                    {fichada.en_stock && fichada.articulo && (
                                      <span className="text-sm text-gray-700 flex-1 truncate" title={`${fichada.articulo} - ${fichada.marca} ${fichada.modelo}`}>
                                        <span className="font-medium">{fichada.articulo}</span>
                                        {fichada.marca && (
                                          <span className="text-gray-500 ml-1">
                                            · {fichada.marca} {fichada.modelo}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                    {/* Espacio flexible si no hay datos */}
                                    {(!fichada.en_stock || !fichada.articulo) && <span className="flex-1" />}
                                    {/* Indicador de stock */}
                                    <span className="w-6 text-center" title={
                                      fichada.en_stock === null 
                                        ? 'Pendiente de verificación' 
                                        : fichada.en_stock 
                                          ? 'Pieza encontrada en stock' 
                                          : 'Pieza no encontrada en stock'
                                    }>
                                      {fichada.en_stock === null ? (
                                        <span className="text-gray-400">-</span>
                                      ) : fichada.en_stock ? (
                                        <span className="text-green-600 font-bold">✓</span>
                                      ) : (
                                        <span className="text-red-600 font-bold">✗</span>
                                      )}
                                    </span>
                                    {fichada.minutos_desde_anterior !== null && (
                                      <span className="text-xs">
                                        +{fichada.minutos_desde_anterior} min
                                      </span>
                                    )}
                                    {/* Botón comentario */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (editandoComentario === fichada.id) {
                                          cancelarEdicionComentario();
                                        } else {
                                          iniciarEdicionComentario(fichada);
                                        }
                                      }}
                                      className={`${fichada.comentario ? 'text-blue-600' : 'text-gray-400'} hover:text-blue-800`}
                                      title={fichada.comentario || 'Añadir comentario'}
                                    >
                                      <svg className="h-5 w-5" fill={fichada.comentario ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                      </svg>
                                    </button>
                                    {/* Botón borrar para admins */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        borrarFichada(fichada.id, true);
                                      }}
                                      disabled={borrando === fichada.id}
                                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                      title="Borrar fichada"
                                    >
                                      {borrando === fichada.id ? (
                                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                      ) : (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                  
                                  {/* Mostrar comentario existente */}
                                  {fichada.comentario && editandoComentario !== fichada.id && (
                                    <div className="ml-8 px-3 py-1 text-sm text-gray-600 bg-blue-50 rounded border border-blue-200 flex items-center gap-2">
                                      <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                      </svg>
                                      <span className="flex-1">{fichada.comentario}</span>
                                    </div>
                                  )}
                                  
                                  {/* Editor de comentario */}
                                  {editandoComentario === fichada.id && (
                                    <div className="ml-8 flex gap-2">
                                      <input
                                        type="text"
                                        value={comentarioTemp}
                                        onChange={(e) => setComentarioTemp(e.target.value)}
                                        placeholder="Escribe un comentario..."
                                        className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            guardarComentario(fichada.id);
                                          } else if (e.key === 'Escape') {
                                            cancelarEdicionComentario();
                                          }
                                        }}
                                      />
                                      <button
                                        onClick={() => guardarComentario(fichada.id)}
                                        disabled={guardandoComentario}
                                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                                      >
                                        {guardandoComentario ? '...' : 'Guardar'}
                                      </button>
                                      <button
                                        onClick={cancelarEdicionComentario}
                                        className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
              
              {/* Total */}
              {resumen.total_general > 0 && (
                <div className="pt-3 mt-3 border-t border-gray-200">
                  <div className="flex justify-between items-center px-3">
                    <span className="font-medium text-gray-700">Total del día:</span>
                    <span className="text-lg font-bold text-blue-600">{resumen.total_general} fichadas</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Error al cargar datos
            </div>
          )}
            </>
          )}
        </div>
      </main>

      {/* Modal de detalle de pieza */}
      {piezaDetalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setPiezaDetalle(null); setEstadoPieza(null); setMensajePieza(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header del modal */}
            <div className={`rounded-t-2xl ${estadoPieza === 'vendida' ? 'bg-gradient-to-r from-orange-500 to-orange-600' : 'bg-gradient-to-r from-blue-600 to-blue-700'}`}>
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    {estadoPieza === 'vendida' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Detalle de Pieza</h3>
                    <p className={`text-sm ${estadoPieza === 'vendida' ? 'text-orange-100' : 'text-blue-100'}`}>
                      {estadoPieza === 'vendida' ? '💰 VENDIDA' : 'En stock'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setPiezaDetalle(null); setEstadoPieza(null); setMensajePieza(null); }}
                  className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Banner de vendida */}
              {estadoPieza === 'vendida' && mensajePieza && (
                <div className="px-6 pb-4">
                  <div className="bg-orange-700/50 rounded-lg px-4 py-2 text-white text-sm flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <span>{mensajePieza}</span>
                  </div>
                </div>
              )}
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

// Exportar componente envuelto con protección de módulo
export default function FichadasPage() {
  return (
    <ModuloProtegido modulo="fichadas">
      <FichadasContent />
    </ModuloProtegido>
  );
}
