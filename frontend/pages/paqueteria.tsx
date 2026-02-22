'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import ModuloProtegido from '@/components/ModuloProtegido';
import axios from 'axios';
import toast from 'react-hot-toast';

// ============== SVG ICONS ==============
const PackageIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
  </svg>
);

const TrophyIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.98 6.98 0 0 1-2.77.952m2.77-.952a18.1 18.1 0 0 1-2.77.952m-6.5 0a6.98 6.98 0 0 1-2.77-.952" />
  </svg>
);

const TrashIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);

const PencilIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
  </svg>
);

const CheckIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);

const XIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

const PlusIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const TagIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
  </svg>
);

const InventoryIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
  </svg>
);

const ArrowUpIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
  </svg>
);

const ArrowDownIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
  </svg>
);

const ClockIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const ChartBarIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
  </svg>
);

const UsersIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
  </svg>
);

const CalendarIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
  </svg>
);

const FireIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
  </svg>
);

const ChevronDownIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);

const ChevronRightIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
);

// ============== TIPOS ==============
interface RegistroPaquete {
  id: number;
  id_caja: string;
  id_pieza: string;
  fecha_registro: string;
  usuario_email: string;
  usuario_nombre: string | null;
  sucursal_id?: number | null;
  sucursal_nombre?: string | null;
  grupo_paquete?: string | null;
}

interface RankingUsuario {
  usuario_id: number;
  usuario_email: string;
  usuario_nombre: string | null;
  total_registros: number;
  total_paquetes: number;
  primera: string | null;
  ultima: string | null;
}

interface RankingResponse {
  fecha: string;
  usuarios: RankingUsuario[];
  total_general: number;
  total_paquetes: number;
}

interface TipoCaja {
  id: number;
  entorno_trabajo_id: number;
  referencia_caja: string;
  tipo_nombre: string;
  descripcion: string | null;
  stock_actual: number;
  dias_aviso: number | null;
  aviso_enviado: boolean;
  fecha_creacion: string;
}

interface StockSucursalInfo {
  sucursal_id: number;
  sucursal_nombre: string;
  color_hex: string;
  stock_actual: number;
}

interface ResumenTipoCaja {
  id: number;
  referencia_caja: string;
  tipo_nombre: string;
  descripcion: string | null;
  stock_actual: number;
  total_entradas: number;
  total_consumidas: number;
  consumo_periodo: number;
  media_diaria: number;
  dias_restantes: number | null;
  dias_aviso: number | null;
  alerta_stock: boolean;
  stock_por_sucursal: StockSucursalInfo[];
}

interface MovimientoCaja {
  id: number;
  tipo_caja_id: number;
  cantidad: number;
  tipo_movimiento: string;
  notas: string | null;
  usuario_email: string | null;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  fecha: string;
}

interface EstadisticasDia {
  fecha: string;
  dia_semana: string;
  total: number;
}

interface EstadisticasUsuario {
  usuario_id: number;
  usuario_email: string;
  usuario_nombre: string | null;
  total: number;
  porcentaje: number;
}

interface EstadisticasCaja {
  id_caja: string;
  tipo_nombre: string | null;
  total_piezas: number;
  porcentaje: number;
}

interface EstadisticasResponse {
  total_hoy: number;
  total_semana: number;
  total_mes: number;
  total_historico: number;
  promedio_diario: number;
  dias_trabajados: number;
  mejor_dia_fecha: string | null;
  mejor_dia_total: number;
  ultimos_dias: EstadisticasDia[];
  usuarios: EstadisticasUsuario[];
  cajas_top: EstadisticasCaja[];
  por_sucursal?: EstadisticasSucursal[];
}

interface SucursalPaqueteria {
  id: number;
  entorno_trabajo_id: number;
  nombre: string;
  color_hex: string;
  es_legacy: boolean;
  activa: boolean;
  fecha_creacion: string;
}

interface EstadisticasSucursal {
  sucursal_id: number;
  sucursal_nombre: string;
  color_hex: string;
  total_hoy: number;
  total_mes: number;
}

// ============== COMPONENTE PRINCIPAL ==============
function PaqueteriaContent() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  // Refs para inputs
  const inputCajaRef = useRef<HTMLInputElement>(null);
  const inputPiezaRef = useRef<HTMLInputElement>(null);

  // Inputs
  const [idCaja, setIdCaja] = useState('');
  const [idPieza, setIdPieza] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [cajasAsociadas, setCajasAsociadas] = useState(0);
  const [piezaActiva, setPiezaActiva] = useState(false);
  const [grupoPaqueteActual, setGrupoPaqueteActual] = useState('');
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());

  const toggleGrupo = (key: string) => {
    setGruposExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Selector empresa (sysowner)
  const [empresas, setEmpresas] = useState<{ id: number; nombre: string }[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);

  // Datos
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [cargandoRanking, setCargandoRanking] = useState(false);
  const [misRegistros, setMisRegistros] = useState<RegistroPaquete[]>([]);
  const [cargandoMisRegistros, setCargandoMisRegistros] = useState(false);

  // Detalle usuario (admin)
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<number | null>(null);
  const [detalleRegistros, setDetalleRegistros] = useState<RegistroPaquete[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Todos los registros del día (admin)
  const [todosRegistros, setTodosRegistros] = useState<RegistroPaquete[]>([]);
  const [cargandoTodos, setCargandoTodos] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  // Borrar / Editar
  const [borrando, setBorrando] = useState<number | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editCaja, setEditCaja] = useState('');
  const [editPieza, setEditPieza] = useState('');
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  // Pestaña activa
  const [tabActiva, setTabActiva] = useState<'registros' | 'tipos' | 'inventario' | 'estadisticas'>('registros');

  // Sucursales
  const [sucursales, setSucursales] = useState<SucursalPaqueteria[]>([]);
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<number | null>(null); // null = General
  const [mostrarModalSucursal, setMostrarModalSucursal] = useState(false);
  const [sucursalCargada, setSucursalCargada] = useState(false);
  const [creandoSucursal, setCreandoSucursal] = useState(false);
  const [nuevaSucursalNombre, setNuevaSucursalNombre] = useState('');
  const [nuevaSucursalColor, setNuevaSucursalColor] = useState('#3B82F6');
  const [editandoSucursalId, setEditandoSucursalId] = useState<number | null>(null);
  const [editSucursalNombre, setEditSucursalNombre] = useState('');
  const [editSucursalColor, setEditSucursalColor] = useState('#3B82F6');
  const [borrandoSucursal, setBorrandoSucursal] = useState<number | null>(null);

  // Estadísticas
  const [estadisticas, setEstadisticas] = useState<EstadisticasResponse | null>(null);
  const [cargandoEstadisticas, setCargandoEstadisticas] = useState(false);

  // Tipos de caja
  const [tiposCaja, setTiposCaja] = useState<TipoCaja[]>([]);
  const [cargandoTipos, setCargandoTipos] = useState(false);
  const [nuevoTipoRef, setNuevoTipoRef] = useState('');
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState('');
  const [nuevoTipoDesc, setNuevoTipoDesc] = useState('');
  const [nuevoTipoDiasAviso, setNuevoTipoDiasAviso] = useState('');
  const [creandoTipo, setCreandoTipo] = useState(false);
  const [editandoTipoId, setEditandoTipoId] = useState<number | null>(null);
  const [editTipoRef, setEditTipoRef] = useState('');
  const [editTipoNombre, setEditTipoNombre] = useState('');
  const [editTipoDesc, setEditTipoDesc] = useState('');
  const [editTipoDiasAviso, setEditTipoDiasAviso] = useState('');
  const [borrandoTipo, setBorrandoTipo] = useState<number | null>(null);

  // Inventario de cajas
  const [resumenCajas, setResumenCajas] = useState<ResumenTipoCaja[]>([]);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [movimientosTipo, setMovimientosTipo] = useState<{ [tipoId: number]: MovimientoCaja[] }>({});
  const [expandedTipo, setExpandedTipo] = useState<number | null>(null);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);
  const [cantidadEntrada, setCantidadEntrada] = useState<{ [tipoId: number]: string }>({});
  const [cantidadConsumo, setCantidadConsumo] = useState<{ [tipoId: number]: string }>({});
  const [notasMovimiento, setNotasMovimiento] = useState<{ [tipoId: number]: string }>({});
  const [registrandoMov, setRegistrandoMov] = useState(false);

  const esAdmin = user?.rol && ['admin', 'owner', 'sysowner'].includes(user.rol);
  const esSysowner = user?.rol === 'sysowner';
  const esVistaGeneral = sucursalSeleccionada === null;
  const sucursalActual = sucursales.find(s => s.id === sucursalSeleccionada);

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

  // Cargar sucursales al montar
  useEffect(() => {
    if (mounted && user) {
      cargarSucursales();
    }
  }, [mounted, user, selectedEmpresa]);

  // Mostrar modal al cargar sucursales (solo si hay más de una y no se eligió aún)
  useEffect(() => {
    if (sucursalCargada && sucursales.length > 0 && sucursalSeleccionada === null) {
      // Recuperar de localStorage
      const saved = localStorage.getItem('paqueteria_sucursal');
      if (saved === 'general') {
        setSucursalSeleccionada(null);
      } else if (saved) {
        const savedId = parseInt(saved);
        if (sucursales.some(s => s.id === savedId)) {
          setSucursalSeleccionada(savedId);
        } else {
          setMostrarModalSucursal(true);
        }
      } else {
        // Primer acceso: si hay sucursales, mostrar modal
        if (sucursales.length > 1) {
          setMostrarModalSucursal(true);
        } else if (sucursales.length === 1) {
          // Solo una sucursal: seleccionar automáticamente
          setSucursalSeleccionada(sucursales[0].id);
          localStorage.setItem('paqueteria_sucursal', String(sucursales[0].id));
        }
      }
    } else if (sucursalCargada && sucursales.length === 0) {
      // No hay sucursales, vista general
      setSucursalSeleccionada(null);
    }
  }, [sucursalCargada]);

  // Cargar datos al cambiar fecha/empresa/sucursal
  useEffect(() => {
    if (mounted && user && sucursalCargada) {
      cargarRanking();
      if (!esAdmin) {
        cargarMisRegistros();
      }
      if (esAdmin && mostrarTodos) {
        cargarTodosRegistros();
      }
    }
  }, [mounted, fechaFiltro, user, selectedEmpresa, sucursalSeleccionada, sucursalCargada]);

  // Focus automático en caja al montar
  useEffect(() => {
    if (mounted) {
      setTimeout(() => inputCajaRef.current?.focus(), 200);
    }
  }, [mounted]);

  // Cargar tipos de caja cuando se activa la pestaña
  useEffect(() => {
    if (mounted && user && tabActiva === 'tipos') {
      cargarTiposCaja();
    }
  }, [mounted, tabActiva, user, selectedEmpresa]);

  // Cargar resumen inventario cuando se activa la pestaña
  useEffect(() => {
    if (mounted && user && tabActiva === 'inventario') {
      cargarResumenCajas();
    }
  }, [mounted, tabActiva, user, selectedEmpresa, sucursalSeleccionada]);

  // Cargar estadísticas cuando se activa la pestaña
  useEffect(() => {
    if (mounted && user && tabActiva === 'estadisticas') {
      cargarEstadisticas();
    }
  }, [mounted, tabActiva, user, selectedEmpresa, sucursalSeleccionada]);

  const cargarSucursales = async () => {
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/sucursales`;
      if (esSysowner && selectedEmpresa) url += `?entorno_id=${selectedEmpresa}`;
      const res = await axios.get<SucursalPaqueteria[]>(url, { withCredentials: true });
      setSucursales(res.data);
    } catch (err) {
      console.error('Error cargando sucursales:', err);
      setSucursales([]);
    } finally {
      setSucursalCargada(true);
    }
  };

  const seleccionarSucursal = (id: number | null) => {
    setSucursalSeleccionada(id);
    localStorage.setItem('paqueteria_sucursal', id === null ? 'general' : String(id));
    setMostrarModalSucursal(false);
  };

  const crearSucursal = async () => {
    if (!nuevaSucursalNombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setCreandoSucursal(true);
    try {
      const payload: any = {
        nombre: nuevaSucursalNombre.trim(),
        color_hex: nuevaSucursalColor,
      };
      if (esSysowner && selectedEmpresa) payload.entorno_id = selectedEmpresa;
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/sucursales`,
        payload,
        { withCredentials: true }
      );
      toast.success('Sucursal creada');
      setNuevaSucursalNombre('');
      setNuevaSucursalColor('#3B82F6');
      await cargarSucursales();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al crear sucursal');
    } finally {
      setCreandoSucursal(false);
    }
  };

  const iniciarEdicionSucursal = (suc: SucursalPaqueteria) => {
    setEditandoSucursalId(suc.id);
    setEditSucursalNombre(suc.nombre);
    setEditSucursalColor(suc.color_hex);
  };

  const cancelarEdicionSucursal = () => {
    setEditandoSucursalId(null);
    setEditSucursalNombre('');
    setEditSucursalColor('#3B82F6');
  };

  const guardarEdicionSucursal = async (sucId: number) => {
    if (!editSucursalNombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/sucursales/${sucId}`,
        { nombre: editSucursalNombre.trim(), color_hex: editSucursalColor },
        { withCredentials: true }
      );
      toast.success('Sucursal actualizada');
      cancelarEdicionSucursal();
      await cargarSucursales();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al editar sucursal');
    }
  };

  const borrarSucursal = async (sucId: number) => {
    if (!confirm('¿Borrar esta sucursal? Solo se puede si no tiene registros.')) return;
    setBorrandoSucursal(sucId);
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/sucursales/${sucId}`,
        { withCredentials: true }
      );
      toast.success('Sucursal eliminada');
      if (sucursalSeleccionada === sucId) {
        setSucursalSeleccionada(null);
        localStorage.setItem('paqueteria_sucursal', 'general');
      }
      await cargarSucursales();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al borrar sucursal');
    } finally {
      setBorrandoSucursal(null);
    }
  };

  // Helper para añadir sucursal_id a las URLs
  const addSucursalParam = (url: string) => {
    if (sucursalSeleccionada !== null) {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}sucursal_id=${sucursalSeleccionada}`;
    }
    return url;
  };

  const cargarEstadisticas = async () => {
    setCargandoEstadisticas(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/estadisticas`;
      if (esSysowner && selectedEmpresa) url += `?entorno_id=${selectedEmpresa}`;
      url = addSucursalParam(url);
      const res = await axios.get<EstadisticasResponse>(url, { withCredentials: true });
      setEstadisticas(res.data);
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    } finally {
      setCargandoEstadisticas(false);
    }
  };

  const fetchEmpresas = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/entornos`, { withCredentials: true });
      setEmpresas(res.data || []);
    } catch (err) {
      console.error('Error fetching empresas:', err);
    }
  };

  const cargarRanking = async () => {
    setCargandoRanking(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/ranking?fecha=${fechaFiltro}`;
      if (esSysowner && selectedEmpresa) url += `&entorno_id=${selectedEmpresa}`;
      url = addSucursalParam(url);
      const res = await axios.get<RankingResponse>(url, { withCredentials: true });
      setRanking(res.data);
    } catch (err) {
      console.error('Error cargando ranking:', err);
    } finally {
      setCargandoRanking(false);
    }
  };

  const cargarMisRegistros = async () => {
    setCargandoMisRegistros(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/mis-registros?fecha=${fechaFiltro}&limite=500`;
      url = addSucursalParam(url);
      const res = await axios.get<RegistroPaquete[]>(url, { withCredentials: true });
      setMisRegistros(res.data);
    } catch (err) {
      console.error('Error cargando mis registros:', err);
    } finally {
      setCargandoMisRegistros(false);
    }
  };

  const cargarTiposCaja = async () => {
    setCargandoTipos(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/tipos-caja`;
      if (esSysowner && selectedEmpresa) url += `?entorno_id=${selectedEmpresa}`;
      const res = await axios.get<TipoCaja[]>(url, { withCredentials: true });
      setTiposCaja(res.data);
    } catch (err) {
      console.error('Error cargando tipos de caja:', err);
    } finally {
      setCargandoTipos(false);
    }
  };

  const cargarTodosRegistros = async () => {
    setCargandoTodos(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/todos-registros?fecha=${fechaFiltro}`;
      if (esSysowner && selectedEmpresa) url += `&entorno_id=${selectedEmpresa}`;
      url = addSucursalParam(url);
      const res = await axios.get<RegistroPaquete[]>(url, { withCredentials: true });
      setTodosRegistros(res.data);
    } catch (err) {
      console.error('Error cargando todos los registros:', err);
    } finally {
      setCargandoTodos(false);
    }
  };

  const verDetalleUsuario = async (usuarioId: number) => {
    if (usuarioSeleccionado === usuarioId) {
      setUsuarioSeleccionado(null);
      setDetalleRegistros([]);
      return;
    }
    setUsuarioSeleccionado(usuarioId);
    setCargandoDetalle(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/detalle-usuario/${usuarioId}?fecha=${fechaFiltro}`;
      if (esSysowner && selectedEmpresa) url += `&entorno_id=${selectedEmpresa}`;
      url = addSucursalParam(url);
      const res = await axios.get<RegistroPaquete[]>(url, { withCredentials: true });
      setDetalleRegistros(res.data);
    } catch (err) {
      console.error('Error cargando detalle:', err);
      toast.error('Error al cargar detalle');
    } finally {
      setCargandoDetalle(false);
    }
  };

  // ============== REGISTRO (escaneo) ==============
  // Flujo: Pieza → Enter → Caja (repetir) → solo ceros = volver a Pieza
  const generarGrupo = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  };

  const handlePiezaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idPieza.trim()) {
        setPiezaActiva(true);
        setCajasAsociadas(0);
        setGrupoPaqueteActual(generarGrupo());
        inputCajaRef.current?.focus();
      }
    }
  };

  const handleCajaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = idCaja.trim();
      // Detectar código terminador: cualquier cadena de solo ceros (0000, 00000, etc.)
      if (/^0+$/.test(val)) {
        if (cajasAsociadas > 0) {
          toast.success(`✅ ${idPieza.trim().toUpperCase()}: ${cajasAsociadas} caja${cajasAsociadas > 1 ? 's' : ''} asociada${cajasAsociadas > 1 ? 's' : ''}`, { duration: 3000 });
        }
        setIdCaja('');
        setIdPieza('');
        setPiezaActiva(false);
        setCajasAsociadas(0);
        setGrupoPaqueteActual('');
        inputPiezaRef.current?.focus();
        return;
      }
      if (val && idPieza.trim()) {
        registrar();
      }
    }
  };

  const registrar = async () => {
    if (!idCaja.trim() || !idPieza.trim()) {
      toast.error('Rellena ID de caja y ID de pieza');
      return;
    }
    setRegistrando(true);
    try {
      const payload: any = {
        id_caja: idCaja.trim(),
        id_pieza: idPieza.trim(),
        grupo_paquete: grupoPaqueteActual || undefined,
      };
      if (esSysowner && selectedEmpresa) payload.entorno_id = selectedEmpresa;
      if (sucursalSeleccionada !== null) payload.sucursal_id = sucursalSeleccionada;
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/registrar`,
        payload,
        { withCredentials: true }
      );
      const count = cajasAsociadas + 1;
      setCajasAsociadas(count);
      toast.success(`📦 ${idCaja.trim().toUpperCase()} → ${idPieza.trim().toUpperCase()} (${count})`, { duration: 1500 });
      setIdCaja('');
      // Recargar datos
      cargarRanking();
      if (!esAdmin) cargarMisRegistros();
      if (esAdmin && mostrarTodos) cargarTodosRegistros();
      if (usuarioSeleccionado) verDetalleUsuario(usuarioSeleccionado);
      // Seguir en campo caja
      inputCajaRef.current?.focus();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al registrar');
    } finally {
      setRegistrando(false);
    }
  };

  // Agrupa registros por grupo_paquete (registros sin grupo = individuales)
  const agruparRegistros = (registros: RegistroPaquete[]) => {
    const grupos: { key: string; pieza: string; items: RegistroPaquete[] }[] = [];
    const seen = new Set<string>();
    for (const reg of registros) {
      const key = reg.grupo_paquete || `_solo_${reg.id}`;
      if (seen.has(key)) {
        const grupo = grupos.find(g => g.key === key);
        if (grupo) grupo.items.push(reg);
      } else {
        seen.add(key);
        grupos.push({ key, pieza: reg.id_pieza, items: [reg] });
      }
    }
    return grupos;
  };

  const borrarRegistro = async (registroId: number) => {
    if (esVistaGeneral) {
      toast.error('Selecciona una sucursal para borrar registros');
      return;
    }
    if (!confirm('¿Estás seguro de que deseas borrar este registro?')) return;
    setBorrando(registroId);
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/borrar/${registroId}`,
        { withCredentials: true }
      );
      toast.success('Registro eliminado');
      cargarRanking();
      if (!esAdmin) cargarMisRegistros();
      if (esAdmin && mostrarTodos) cargarTodosRegistros();
      if (usuarioSeleccionado) verDetalleUsuario(usuarioSeleccionado);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al borrar');
    } finally {
      setBorrando(null);
    }
  };

  // ============== EDITAR REGISTRO ==============
  const iniciarEdicion = (reg: RegistroPaquete) => {
    if (esVistaGeneral) {
      toast.error('Selecciona una sucursal para editar registros');
      return;
    }
    setEditandoId(reg.id);
    setEditCaja(reg.id_caja);
    setEditPieza(reg.id_pieza);
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setEditCaja('');
    setEditPieza('');
  };

  const guardarEdicion = async (registroId: number) => {
    if (!editCaja.trim() || !editPieza.trim()) {
      toast.error('Los campos no pueden estar vacíos');
      return;
    }
    setGuardandoEdit(true);
    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/editar/${registroId}`,
        { id_caja: editCaja.trim(), id_pieza: editPieza.trim() },
        { withCredentials: true }
      );
      toast.success('Registro actualizado');
      cancelarEdicion();
      cargarRanking();
      if (!esAdmin) cargarMisRegistros();
      if (esAdmin && mostrarTodos) cargarTodosRegistros();
      if (usuarioSeleccionado) verDetalleUsuario(usuarioSeleccionado);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al editar');
    } finally {
      setGuardandoEdit(false);
    }
  };

  // ============== TIPOS DE CAJA CRUD ==============
  const crearTipoCaja = async () => {
    if (!nuevoTipoRef.trim() || !nuevoTipoNombre.trim()) {
      toast.error('Referencia y nombre son obligatorios');
      return;
    }
    setCreandoTipo(true);
    try {
      const payload: any = {
        referencia_caja: nuevoTipoRef.trim(),
        tipo_nombre: nuevoTipoNombre.trim(),
        descripcion: nuevoTipoDesc.trim() || null,
        dias_aviso: nuevoTipoDiasAviso ? parseInt(nuevoTipoDiasAviso) : null,
      };
      if (esSysowner && selectedEmpresa) payload.entorno_id = selectedEmpresa;
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/tipos-caja`,
        payload,
        { withCredentials: true }
      );
      toast.success('Tipo de caja creado');
      setNuevoTipoRef('');
      setNuevoTipoNombre('');
      setNuevoTipoDesc('');
      setNuevoTipoDiasAviso('');
      cargarTiposCaja();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al crear tipo');
    } finally {
      setCreandoTipo(false);
    }
  };

  const iniciarEdicionTipo = (tipo: TipoCaja) => {
    setEditandoTipoId(tipo.id);
    setEditTipoRef(tipo.referencia_caja);
    setEditTipoNombre(tipo.tipo_nombre);
    setEditTipoDesc(tipo.descripcion || '');
    setEditTipoDiasAviso(tipo.dias_aviso != null ? String(tipo.dias_aviso) : '');
  };

  const cancelarEdicionTipo = () => {
    setEditandoTipoId(null);
    setEditTipoRef('');
    setEditTipoNombre('');
    setEditTipoDesc('');
    setEditTipoDiasAviso('');
  };

  const guardarEdicionTipo = async (tipoId: number) => {
    if (!editTipoRef.trim() || !editTipoNombre.trim()) {
      toast.error('Referencia y nombre son obligatorios');
      return;
    }
    try {
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/tipos-caja/${tipoId}`,
        {
          referencia_caja: editTipoRef.trim(),
          tipo_nombre: editTipoNombre.trim(),
          descripcion: editTipoDesc.trim() || null,
          dias_aviso: editTipoDiasAviso ? parseInt(editTipoDiasAviso) : null,
        },
        { withCredentials: true }
      );
      toast.success('Tipo actualizado');
      cancelarEdicionTipo();
      cargarTiposCaja();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al editar tipo');
    }
  };

  const borrarTipoCaja = async (tipoId: number) => {
    if (!confirm('¿Borrar este tipo de caja?')) return;
    setBorrandoTipo(tipoId);
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/tipos-caja/${tipoId}`,
        { withCredentials: true }
      );
      toast.success('Tipo eliminado');
      cargarTiposCaja();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al borrar tipo');
    } finally {
      setBorrandoTipo(null);
    }
  };

  // ============== INVENTARIO DE CAJAS ==============
  const cargarResumenCajas = async () => {
    setCargandoResumen(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/tipos-caja/resumen`;
      const params: string[] = [];
      if (fechaDesde) params.push(`desde=${fechaDesde}`);
      if (fechaHasta) params.push(`hasta=${fechaHasta}`);
      if (esSysowner && selectedEmpresa) params.push(`entorno_id=${selectedEmpresa}`);
      if (sucursalSeleccionada !== null) params.push(`sucursal_id=${sucursalSeleccionada}`);
      if (params.length > 0) url += '?' + params.join('&');
      const res = await axios.get<ResumenTipoCaja[]>(url, { withCredentials: true });
      setResumenCajas(res.data);
      // Mostrar alertas de stock bajo (solo toast, no se guarda en buzón)
      for (const r of res.data) {
        if (r.alerta_stock) {
          toast(`Stock bajo: "${r.tipo_nombre}" tiene ${r.dias_restantes} días restantes (aviso a ${r.dias_aviso} días)`, {
            duration: 8000,
            icon: '⚠',
            style: { background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E', fontWeight: 500 },
          });
        }
      }
    } catch (err) {
      console.error('Error cargando resumen:', err);
    } finally {
      setCargandoResumen(false);
    }
  };

  const cargarMovimientosTipo = async (tipoId: number) => {
    if (expandedTipo === tipoId) {
      setExpandedTipo(null);
      return;
    }
    setExpandedTipo(tipoId);
    setCargandoMovimientos(true);
    try {
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/tipos-caja/${tipoId}/movimientos`;
      const params: string[] = [];
      if (fechaDesde) params.push(`desde=${fechaDesde}`);
      if (fechaHasta) params.push(`hasta=${fechaHasta}`);
      if (sucursalSeleccionada !== null) params.push(`sucursal_id=${sucursalSeleccionada}`);
      if (params.length > 0) url += '?' + params.join('&');
      const res = await axios.get<MovimientoCaja[]>(url, { withCredentials: true });
      setMovimientosTipo(prev => ({ ...prev, [tipoId]: res.data }));
    } catch (err) {
      console.error('Error cargando movimientos:', err);
      toast.error('Error al cargar historial');
    } finally {
      setCargandoMovimientos(false);
    }
  };

  const registrarMovimiento = async (tipoId: number, tipo_movimiento: 'entrada' | 'consumo') => {
    const cantStr = tipo_movimiento === 'entrada' 
      ? cantidadEntrada[tipoId] 
      : cantidadConsumo[tipoId];
    const cantidad = parseInt(cantStr || '0');
    if (!cantidad || cantidad <= 0) {
      toast.error('Introduce una cantidad válida');
      return;
    }
    setRegistrandoMov(true);
    try {
      const payload: any = {
        cantidad,
        tipo_movimiento,
        notas: notasMovimiento[tipoId] || null,
      };
      if (sucursalSeleccionada !== null) payload.sucursal_id = sucursalSeleccionada;
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/tipos-caja/${tipoId}/movimiento`,
        payload,
        { withCredentials: true }
      );
      toast.success(tipo_movimiento === 'entrada'
        ? `+${cantidad} cajas añadidas`
        : `-${cantidad} cajas consumidas`
      );
      // Limpiar inputs
      if (tipo_movimiento === 'entrada') {
        setCantidadEntrada(prev => ({ ...prev, [tipoId]: '' }));
      } else {
        setCantidadConsumo(prev => ({ ...prev, [tipoId]: '' }));
      }
      setNotasMovimiento(prev => ({ ...prev, [tipoId]: '' }));
      // Recargar
      cargarResumenCajas();
      if (expandedTipo === tipoId) {
        cargarMovimientosTipo(tipoId);
        setExpandedTipo(tipoId); // mantener expandido
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al registrar movimiento');
    } finally {
      setRegistrandoMov(false);
    }
  };

  const aplicarFiltroFechas = () => {
    cargarResumenCajas();
    setExpandedTipo(null);
  };

  const esFechaHoy = (fechaStr: string) => {
    const hoy = new Date().toISOString().split('T')[0];
    return fechaStr.startsWith(hoy);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modal Selector Sucursal */}
      {mostrarModalSucursal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-blue-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
              </svg>
              Selecciona sucursal
            </h3>
            <p className="text-sm text-gray-500 mb-4">¿Desde dónde estás trabajando?</p>

            <div className="space-y-2 mb-4">
              {sucursales.length > 1 && (
                <button
                  onClick={() => seleccionarSucursal(null)}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-all flex items-center gap-3"
                >
                  <div className="w-4 h-4 rounded-full bg-gray-400" />
                  <div>
                    <span className="font-semibold text-gray-900">General</span>
                    <span className="text-xs text-gray-400 ml-2">(solo lectura)</span>
                  </div>
                </button>
              )}
              {sucursales.map(suc => (
                <div key={suc.id} className="flex items-center gap-2">
                  {editandoSucursalId === suc.id ? (
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-blue-300 bg-blue-50">
                      <input
                        type="text"
                        value={editSucursalNombre}
                        onChange={e => setEditSucursalNombre(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="color"
                        value={editSucursalColor}
                        onChange={e => setEditSucursalColor(e.target.value)}
                        className="w-8 h-7 rounded border border-gray-300 cursor-pointer"
                      />
                      <button
                        onClick={() => guardarEdicionSucursal(suc.id)}
                        className="p-1 text-green-600 hover:text-green-700"
                        title="Guardar"
                      >
                        <CheckIcon />
                      </button>
                      <button
                        onClick={cancelarEdicionSucursal}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Cancelar"
                      >
                        <XIcon />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => seleccionarSucursal(suc.id)}
                        className="flex-1 text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center gap-3"
                      >
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: suc.color_hex }} />
                        <span className="font-semibold text-gray-900">{suc.nombre}</span>
                      </button>
                      {esAdmin && !suc.es_legacy && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); iniciarEdicionSucursal(suc); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                            title="Editar sucursal"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); borrarSucursal(suc.id); }}
                            disabled={borrandoSucursal === suc.id}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                            title="Borrar sucursal"
                          >
                            {borrandoSucursal === suc.id ? <span className="text-xs">...</span> : <TrashIcon />}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Crear nueva sucursal (solo admin) */}
            {esAdmin && (
              <div className="border-t border-gray-200 pt-4 mt-4">
                <p className="text-xs text-gray-500 mb-2">Crear nueva sucursal:</p>
                {esSysowner && !selectedEmpresa ? (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Selecciona una empresa arriba antes de crear sucursales.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuevaSucursalNombre}
                      onChange={e => setNuevaSucursalNombre(e.target.value)}
                      placeholder="Nombre..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="color"
                      value={nuevaSucursalColor}
                      onChange={e => setNuevaSucursalColor(e.target.value)}
                      className="w-10 h-9 rounded border border-gray-300 cursor-pointer"
                    />
                    <button
                      onClick={crearSucursal}
                      disabled={creandoSucursal || !nuevaSucursalNombre.trim()}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium"
                    >
                      {creandoSucursal ? '...' : '+'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Cerrar modal */}
            <button
              onClick={() => setMostrarModalSucursal(false)}
              className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600"
            >
              {sucursalSeleccionada !== null ? 'Cancelar' : 'Cerrar'}
            </button>
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
                <p className="text-xs text-gray-500">Gestión Paquetería</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Badge sucursal */}
              {(sucursales.length > 0 || esAdmin) && (
                <button
                  onClick={() => setMostrarModalSucursal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                  title="Cambiar sucursal"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: sucursalActual?.color_hex || '#9CA3AF' }}
                  />
                  <span className="font-medium text-gray-700">
                    {sucursalActual?.nombre || 'General'}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 text-gray-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              )}
              <p className="text-sm font-medium text-gray-900 hidden sm:block">{user.email}</p>
              <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors">
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

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
                  setDetalleRegistros([]);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">-- Selecciona una empresa --</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ============ ZONA DE ESCANEO ============ */}
        {esVistaGeneral && sucursales.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-center">
            <p className="text-amber-700 font-medium">
              Vista General: solo lectura. Para registrar piezas, selecciona una sucursal.
            </p>
            <button
              onClick={() => setMostrarModalSucursal(true)}
              className="mt-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Seleccionar sucursal
            </button>
          </div>
        ) : (
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-amber-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
            Registrar Pieza en Caja
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-600 mb-1">ID Pieza</label>
              <input
                ref={inputPiezaRef}
                type="text"
                value={idPieza}
                onChange={(e) => setIdPieza(e.target.value)}
                onKeyDown={handlePiezaKeyDown}
                placeholder="Escanea la pieza..."
                className={`w-full px-4 py-3 text-lg border-2 rounded-xl focus:outline-none focus:ring-2 font-mono uppercase ${
                  piezaActiva
                    ? 'border-green-400 bg-green-50 focus:ring-green-500 focus:border-green-500'
                    : 'border-blue-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                autoComplete="off"
                disabled={piezaActiva}
              />
            </div>
            <div className="flex-1 relative">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                ID Caja
                {piezaActiva && cajasAsociadas > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                    {cajasAsociadas} caja{cajasAsociadas > 1 ? 's' : ''}
                  </span>
                )}
              </label>
              <input
                ref={inputCajaRef}
                type="text"
                value={idCaja}
                onChange={(e) => setIdCaja(e.target.value)}
                onKeyDown={handleCajaKeyDown}
                placeholder={piezaActiva ? 'Escanea cajas... (0000 = siguiente pieza)' : 'Primero escanea la pieza'}
                className={`w-full px-4 py-3 text-lg border-2 rounded-xl focus:outline-none focus:ring-2 font-mono uppercase ${
                  piezaActiva
                    ? 'border-amber-300 focus:ring-amber-500 focus:border-amber-500'
                    : 'border-gray-200 bg-gray-50 text-gray-400'
                }`}
                autoComplete="off"
                disabled={!piezaActiva}
              />
            </div>
            <div className="flex items-end gap-2">
              {piezaActiva && (
                <button
                  onClick={() => {
                    if (cajasAsociadas > 0) {
                      toast.success(`✅ ${idPieza.trim().toUpperCase()}: ${cajasAsociadas} caja${cajasAsociadas > 1 ? 's' : ''} asociada${cajasAsociadas > 1 ? 's' : ''}`, { duration: 3000 });
                    }
                    setIdCaja('');
                    setIdPieza('');
                    setPiezaActiva(false);
                    setCajasAsociadas(0);
                    setGrupoPaqueteActual('');
                    inputPiezaRef.current?.focus();
                  }}
                  className="px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-semibold text-sm transition-colors whitespace-nowrap"
                  title="Terminar pieza actual (o escanea 0000)"
                >
                  Siguiente pieza
                </button>
              )}
              <button
                onClick={registrar}
                disabled={registrando || !idCaja.trim() || !idPieza.trim()}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-xl font-semibold text-lg transition-colors whitespace-nowrap flex items-center gap-2"
              >
                {registrando ? '...' : <><PackageIcon className="w-5 h-5" /> Registrar</>}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Escanea pieza → Enter → escanea cajas una a una → Enter cada una → escanea <span className="font-bold text-gray-500">0000</span> para pasar a la siguiente pieza
          </p>
        </div>
        )}

        {/* ============ PESTAÑAS ============ */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setTabActiva('registros')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tabActiva === 'registros'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <TrophyIcon className="w-5 h-5" />
                Ranking y Registros
              </button>
              {esAdmin && (
                <button
                  onClick={() => setTabActiva('tipos')}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    tabActiva === 'tipos'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <TagIcon className="w-5 h-5" />
                  Tipos de Caja
                </button>
              )}
              <button
                onClick={() => setTabActiva('inventario')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tabActiva === 'inventario'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <InventoryIcon className="w-5 h-5" />
                Inventario
              </button>
              <button
                onClick={() => setTabActiva('estadisticas')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tabActiva === 'estadisticas'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <ChartBarIcon className="w-5 h-5" />
                Estadísticas
              </button>
            </div>
          </div>

          {/* ============ TAB: RANKING + REGISTROS ============ */}
          {tabActiva === 'registros' && (
            <div className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-amber-500" />
              Ranking Paquetería
            </h2>
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

          {cargandoRanking ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : !ranking || ranking.usuarios.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay registros de paquetería para esta fecha
            </div>
          ) : (
            <>
              <div className="mb-4 text-center flex gap-3 justify-center flex-wrap">
                <span className="inline-block bg-amber-100 text-amber-800 px-4 py-2 rounded-full font-bold text-lg">
                  {ranking.total_paquetes} paquete{ranking.total_paquetes !== 1 ? 's' : ''}
                </span>
                <span className="inline-block bg-blue-100 text-blue-800 px-4 py-2 rounded-full font-bold text-lg">
                  {ranking.total_general} material{ranking.total_general !== 1 ? 'es' : ''}
                </span>
              </div>

              {/* Ranking cards */}
              <div className="space-y-2">
                {ranking.usuarios.map((usr, idx) => {
                  const isExpanded = usuarioSeleccionado === usr.usuario_id;

                  return (
                    <div key={usr.usuario_id}>
                      <div
                        className="flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all cursor-pointer bg-white border-gray-200 hover:border-blue-300"
                        onClick={() => esAdmin && verDetalleUsuario(usr.usuario_id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-500 w-10 text-center">#{idx + 1}</span>
                          <div>
                            <p className="font-semibold text-gray-900">
                              {usr.usuario_nombre || usr.usuario_email}
                            </p>
                            {usr.usuario_nombre && (
                              <p className="text-xs text-gray-400">{usr.usuario_email}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-2xl font-bold text-gray-900">{usr.total_paquetes}</p>
                            <p className="text-xs text-gray-400">paquete{usr.total_paquetes !== 1 ? 's' : ''}</p>
                            {usr.total_registros > usr.total_paquetes && (
                              <p className="text-xs text-blue-500">{usr.total_registros} mat.</p>
                            )}
                          </div>
                          {usr.primera && usr.ultima && (
                            <div className="text-right text-xs text-gray-400 hidden sm:block">
                              <p>{new Date(usr.primera).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
                              <p>{new Date(usr.ultima).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          )}
                          {esAdmin && (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          )}
                        </div>
                      </div>

                      {/* Detalle expandido (admin) */}
                      {isExpanded && esAdmin && (
                        <div className="mt-1 ml-12 bg-gray-50 rounded-lg p-3 border border-gray-200">
                          {cargandoDetalle ? (
                            <div className="text-center py-4">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                            </div>
                          ) : detalleRegistros.length === 0 ? (
                            <p className="text-gray-500 text-sm text-center py-2">Sin registros</p>
                          ) : (() => {
                            const grupos = agruparRegistros(detalleRegistros);
                            return (
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-gray-700 mb-2">
                                {grupos.length} paquete{grupos.length !== 1 ? 's' : ''} ({detalleRegistros.length} material{detalleRegistros.length !== 1 ? 'es' : ''}) — Operario: <span className="text-blue-600">{usr.usuario_nombre || usr.usuario_email}</span>
                              </div>
                              {grupos.map((grupo, gi) => {
                                const isMulti = grupo.items.length > 1;
                                const isOpen = !isMulti || gruposExpandidos.has(grupo.key);
                                return (
                                <div key={grupo.key} className={`rounded-lg border ${isMulti ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100 bg-white'}`}>
                                  {/* Cabecera del paquete */}
                                  <div
                                    className={`flex items-center justify-between px-3 py-2 ${isOpen && isMulti ? 'border-b border-gray-100' : ''} ${isMulti ? 'cursor-pointer hover:bg-blue-50/60 select-none' : ''}`}
                                    onClick={() => isMulti && toggleGrupo(grupo.key)}
                                  >
                                    <div className="flex items-center gap-2">
                                      {isMulti && (
                                        <span className="text-gray-400 transition-transform duration-200">
                                          {isOpen ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                                        </span>
                                      )}
                                      <span className="text-xs font-bold text-gray-400">#{gi + 1}</span>
                                      <span className="font-mono font-bold text-blue-700 text-sm">{grupo.pieza}</span>
                                      {isMulti && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                                          {grupo.items.length} materiales
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-mono text-xs text-gray-400">
                                      {new Date(grupo.items[grupo.items.length - 1].fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  {/* Materiales/cajas del paquete */}
                                  {isOpen && grupo.items.map((reg) => {
                                    const esEditandoReg = editandoId === reg.id;
                                    if (esEditandoReg) {
                                      return (
                                        <div key={reg.id} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-sm">
                                          <div className="col-span-3 font-mono text-xs text-gray-500">
                                            {new Date(reg.fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                          </div>
                                          <div className="col-span-4">
                                            <input type="text" value={editCaja} onChange={(e) => setEditCaja(e.target.value)}
                                              className="w-full px-2 py-1 text-xs border border-amber-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-amber-500" autoFocus />
                                          </div>
                                          <div className="col-span-3">
                                            <input type="text" value={editPieza} onChange={(e) => setEditPieza(e.target.value)}
                                              onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(reg.id); if (e.key === 'Escape') cancelarEdicion(); }}
                                              className="w-full px-2 py-1 text-xs border border-blue-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                          </div>
                                          <div className="col-span-2 flex justify-center gap-1">
                                            <button onClick={() => guardarEdicion(reg.id)} disabled={guardandoEdit} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50" title="Guardar"><CheckIcon /></button>
                                            <button onClick={cancelarEdicion} className="p-1 text-gray-500 hover:text-gray-700" title="Cancelar"><XIcon /></button>
                                          </div>
                                        </div>
                                      );
                                    }
                                    return (
                                      <div key={reg.id} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5 hover:bg-blue-50/50 border-b border-gray-50 text-sm last:border-0">
                                        <div className="col-span-3 font-mono text-xs text-gray-500">
                                          {new Date(reg.fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className="col-span-4 font-mono font-medium text-amber-700">{reg.id_caja}</div>
                                        <div className="col-span-3 font-mono text-xs text-gray-400">{grupo.items.length > 1 ? '' : reg.id_pieza}</div>
                                        <div className="col-span-2 flex justify-center gap-1">
                                          <button onClick={(e) => { e.stopPropagation(); iniciarEdicion(reg); }} className="p-1 text-blue-400 hover:text-blue-600" title="Editar"><PencilIcon /></button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); borrarRegistro(reg.id); }}
                                            disabled={borrando === reg.id}
                                            className="p-1 text-red-400 hover:text-red-600 disabled:opacity-50"
                                            title="Borrar"
                                          >
                                            {borrando === reg.id ? <span className="text-xs">...</span> : <TrashIcon />}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                );
                              })}
                            </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ============ TODOS LOS REGISTROS (admin) ============ */}
          {esAdmin && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-md font-semibold text-gray-800 flex items-center gap-2">
                  <PackageIcon className="w-5 h-5 text-blue-500" />
                  Todos los Registros del Día
                </h3>
                <button
                  onClick={() => {
                    if (!mostrarTodos) {
                      setMostrarTodos(true);
                      cargarTodosRegistros();
                    } else {
                      setMostrarTodos(false);
                    }
                  }}
                  className="px-4 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {mostrarTodos ? 'Ocultar' : 'Ver todos'}
                </button>
              </div>

              {mostrarTodos && (
                <>
                  {cargandoTodos ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                  ) : todosRegistros.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">No hay registros para esta fecha</p>
                  ) : (() => {
                    const gruposTodos = agruparRegistros(todosRegistros);
                    return (
                    <div className="space-y-2">
                      {gruposTodos.map((grupo, gi) => {
                        const isMulti = grupo.items.length > 1;
                        const isOpen = !isMulti || gruposExpandidos.has(grupo.key);
                        return (
                        <div key={grupo.key} className={`rounded-lg border ${isMulti ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
                          <div
                            className={`flex items-center justify-between px-3 py-2 ${isOpen && isMulti ? 'border-b border-gray-100' : ''} ${isMulti ? 'cursor-pointer hover:bg-blue-50/60 select-none' : ''}`}
                            onClick={() => isMulti && toggleGrupo(grupo.key)}
                          >
                            <div className="flex items-center gap-2">
                              {isMulti && (
                                <span className="text-gray-400 transition-transform duration-200">
                                  {isOpen ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                                </span>
                              )}
                              <span className="text-xs font-bold text-gray-400">#{gi + 1}</span>
                              <span className="font-mono font-bold text-blue-700 text-sm">{grupo.pieza}</span>
                              {isMulti && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                                  {grupo.items.length} mat.
                                </span>
                              )}
                              <span className="text-xs text-gray-500">{grupo.items[0].usuario_nombre || grupo.items[0].usuario_email.split('@')[0]}</span>
                            </div>
                            <span className="font-mono text-xs text-gray-400">
                              {new Date(grupo.items[grupo.items.length - 1].fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {isOpen && grupo.items.map((reg) => {
                            const esEditandoReg = editandoId === reg.id;
                            if (esEditandoReg) {
                              return (
                                <div key={reg.id} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-sm">
                                  <div className="col-span-2 font-mono text-xs text-gray-500">
                                    {new Date(reg.fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  <div className="col-span-2 text-xs text-gray-600 truncate">{reg.usuario_nombre || reg.usuario_email.split('@')[0]}</div>
                                  <div className="col-span-3">
                                    <input type="text" value={editCaja} onChange={(e) => setEditCaja(e.target.value)}
                                      className="w-full px-2 py-1 text-xs border border-amber-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-amber-500" autoFocus />
                                  </div>
                                  <div className="col-span-3">
                                    <input type="text" value={editPieza} onChange={(e) => setEditPieza(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(reg.id); if (e.key === 'Escape') cancelarEdicion(); }}
                                      className="w-full px-2 py-1 text-xs border border-blue-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                  </div>
                                  <div className="col-span-2 flex justify-center gap-1">
                                    <button onClick={() => guardarEdicion(reg.id)} disabled={guardandoEdit} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50" title="Guardar"><CheckIcon /></button>
                                    <button onClick={cancelarEdicion} className="p-1 text-gray-500 hover:text-gray-700" title="Cancelar"><XIcon /></button>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div key={reg.id} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5 hover:bg-blue-50/50 border-b border-gray-50 text-sm last:border-0">
                                <div className="col-span-2 font-mono text-xs text-gray-500">
                                  {new Date(reg.fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="col-span-2 text-xs text-gray-600 truncate">{reg.usuario_nombre || reg.usuario_email.split('@')[0]}</div>
                                <div className="col-span-3 font-mono font-medium text-amber-700">{reg.id_caja}</div>
                                <div className="col-span-3 font-mono text-xs text-gray-400">{grupo.items.length > 1 ? '' : reg.id_pieza}</div>
                                <div className="col-span-2 flex justify-center gap-1">
                                  <button onClick={() => iniciarEdicion(reg)} className="p-1 text-blue-400 hover:text-blue-600" title="Editar"><PencilIcon /></button>
                                  <button
                                    onClick={() => borrarRegistro(reg.id)}
                                    disabled={borrando === reg.id}
                                    className="p-1 text-red-400 hover:text-red-600 disabled:opacity-50"
                                    title="Borrar"
                                  >
                                    {borrando === reg.id ? <span className="text-xs">...</span> : <TrashIcon />}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        );
                      })}
                      <div className="pt-2 mt-2 border-t border-gray-200 text-right">
                        <span className="text-sm font-medium text-gray-600">
                          {gruposTodos.length} paquete{gruposTodos.length !== 1 ? 's' : ''} · <span className="font-bold text-blue-600">{todosRegistros.length}</span> materiales
                        </span>
                      </div>
                    </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* ============ MIS REGISTROS (usuario normal) ============ */}
          {!esAdmin && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-800 mb-3">Mis Registros del Día</h3>
              {cargandoMisRegistros ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : misRegistros.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No tienes registros para esta fecha</p>
              ) : (() => {
                const gruposMis = agruparRegistros(misRegistros);
                return (
                <div className="space-y-2">
                  {gruposMis.map((grupo, gi) => {
                    const isMulti = grupo.items.length > 1;
                    const isOpen = !isMulti || gruposExpandidos.has(grupo.key);
                    return (
                    <div key={grupo.key} className={`rounded-lg border ${isMulti ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
                      <div
                        className={`flex items-center justify-between px-3 py-2 ${isOpen && isMulti ? 'border-b border-gray-100' : ''} ${isMulti ? 'cursor-pointer hover:bg-blue-50/60 select-none' : ''}`}
                        onClick={() => isMulti && toggleGrupo(grupo.key)}
                      >
                        <div className="flex items-center gap-2">
                          {isMulti && (
                            <span className="text-gray-400 transition-transform duration-200">
                              {isOpen ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                            </span>
                          )}
                          <span className="text-xs font-bold text-gray-400">#{gi + 1}</span>
                          <span className="font-mono font-bold text-blue-700 text-sm">{grupo.pieza}</span>
                          {isMulti && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                              {grupo.items.length} mat.
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-xs text-gray-400">
                          {new Date(grupo.items[grupo.items.length - 1].fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {isOpen && grupo.items.map((reg) => {
                        const esDeHoy = esFechaHoy(reg.fecha_registro);
                        const esEditandoReg = editandoId === reg.id;
                        if (esEditandoReg) {
                          return (
                            <div key={reg.id} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-sm">
                              <div className="col-span-3 font-mono text-xs text-gray-500">
                                {new Date(reg.fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              <div className="col-span-4">
                                <input type="text" value={editCaja} onChange={(e) => setEditCaja(e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-amber-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-amber-500" autoFocus />
                              </div>
                              <div className="col-span-3">
                                <input type="text" value={editPieza} onChange={(e) => setEditPieza(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(reg.id); if (e.key === 'Escape') cancelarEdicion(); }}
                                  className="w-full px-2 py-1 text-xs border border-blue-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              </div>
                              <div className="col-span-2 flex justify-center gap-1">
                                <button onClick={() => guardarEdicion(reg.id)} disabled={guardandoEdit} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50" title="Guardar"><CheckIcon /></button>
                                <button onClick={cancelarEdicion} className="p-1 text-gray-500 hover:text-gray-700" title="Cancelar"><XIcon /></button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={reg.id} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5 hover:bg-blue-50/50 border-b border-gray-50 text-sm last:border-0">
                            <div className="col-span-3 font-mono text-xs text-gray-500">
                              {new Date(reg.fecha_registro).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="col-span-4 font-mono font-medium text-amber-700">{reg.id_caja}</div>
                            <div className="col-span-3 font-mono text-xs text-gray-400">{grupo.items.length > 1 ? '' : reg.id_pieza}</div>
                            <div className="col-span-2 flex justify-center gap-1">
                              {esDeHoy && (
                                <button onClick={() => iniciarEdicion(reg)} className="p-1 text-blue-400 hover:text-blue-600" title="Editar"><PencilIcon /></button>
                              )}
                              {esDeHoy ? (
                                <button
                                  onClick={() => borrarRegistro(reg.id)}
                                  disabled={borrando === reg.id}
                                  className="p-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                                  title="Borrar registro"
                                >
                                  {borrando === reg.id ? <span className="text-xs">...</span> : <TrashIcon />}
                                </button>
                              ) : (
                                <span className="text-gray-300 text-xs">--</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    );
                  })}
                </div>
                );
              })()}
            </div>
          )}
            </div>
          )}

          {/* ============ TAB: TIPOS DE CAJA ============ */}
          {tabActiva === 'tipos' && esAdmin && (
            <div className="p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TagIcon className="w-5 h-5 text-purple-500" />
                Asociar Referencia de Caja a Tipo
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Define tipos de caja y asocia cada referencia a un tipo para organizarlas mejor.
              </p>

              {/* Formulario nueva asociación */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <PlusIcon className="w-4 h-4" />
                  Nueva Asociación
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Referencia Caja</label>
                    <input
                      type="text"
                      value={nuevoTipoRef}
                      onChange={(e) => setNuevoTipoRef(e.target.value)}
                      placeholder="Ej: CAJA-001"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tipo / Nombre</label>
                    <input
                      type="text"
                      value={nuevoTipoNombre}
                      onChange={(e) => setNuevoTipoNombre(e.target.value)}
                      placeholder="Ej: Caja Grande, Palet..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Aviso (días restantes)</label>
                    <input
                      type="number"
                      min="1"
                      value={nuevoTipoDiasAviso}
                      onChange={(e) => setNuevoTipoDiasAviso(e.target.value)}
                      placeholder="Ej: 15"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Descripción (opcional)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={nuevoTipoDesc}
                        onChange={(e) => setNuevoTipoDesc(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') crearTipoCaja(); }}
                        placeholder="Notas..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        onClick={crearTipoCaja}
                        disabled={creandoTipo || !nuevoTipoRef.trim() || !nuevoTipoNombre.trim()}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                      >
                        {creandoTipo ? '...' : <><PlusIcon className="w-4 h-4" /> Añadir</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista de tipos */}
              {cargandoTipos ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
                </div>
              ) : tiposCaja.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No hay tipos de caja definidos
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-3 py-2 bg-gray-50 rounded">
                    <div className="col-span-2">Referencia</div>
                    <div className="col-span-3">Tipo</div>
                    <div className="col-span-3">Descripción</div>
                    <div className="col-span-2">Aviso (días)</div>
                    <div className="col-span-2 text-center">Acciones</div>
                  </div>
                  {tiposCaja.map((tipo) => {
                    const esEditandoTipoItem = editandoTipoId === tipo.id;

                    if (esEditandoTipoItem) {
                      return (
                        <div key={tipo.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2 rounded border bg-purple-50 border-purple-200">
                          <div className="col-span-2">
                            <input type="text" value={editTipoRef} onChange={(e) => setEditTipoRef(e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-purple-300 rounded font-mono uppercase focus:outline-none focus:ring-1 focus:ring-purple-500" autoFocus />
                          </div>
                          <div className="col-span-3">
                            <input type="text" value={editTipoNombre} onChange={(e) => setEditTipoNombre(e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500" />
                          </div>
                          <div className="col-span-3">
                            <input type="text" value={editTipoDesc} onChange={(e) => setEditTipoDesc(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicionTipo(tipo.id); if (e.key === 'Escape') cancelarEdicionTipo(); }}
                              className="w-full px-2 py-1 text-sm border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500" />
                          </div>
                          <div className="col-span-2">
                            <input type="number" min="1" value={editTipoDiasAviso} onChange={(e) => setEditTipoDiasAviso(e.target.value)}
                              placeholder="Sin aviso"
                              onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicionTipo(tipo.id); if (e.key === 'Escape') cancelarEdicionTipo(); }}
                              className="w-full px-2 py-1 text-sm border border-amber-300 rounded text-center focus:outline-none focus:ring-1 focus:ring-amber-500" />
                          </div>
                          <div className="col-span-2 flex justify-center gap-1">
                            <button onClick={() => guardarEdicionTipo(tipo.id)} className="p-1 text-green-600 hover:text-green-800" title="Guardar"><CheckIcon /></button>
                            <button onClick={cancelarEdicionTipo} className="p-1 text-gray-500 hover:text-gray-700" title="Cancelar"><XIcon /></button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={tipo.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2 rounded border bg-white border-gray-200 hover:bg-gray-50">
                        <div className="col-span-2 font-mono font-medium text-purple-700">{tipo.referencia_caja}</div>
                        <div className="col-span-3 font-medium text-gray-800">{tipo.tipo_nombre}</div>
                        <div className="col-span-3 text-sm text-gray-500 truncate">{tipo.descripcion || '—'}</div>
                        <div className="col-span-2 text-center">
                          {tipo.dias_aviso != null ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              <ClockIcon className="w-3 h-3" /> {tipo.dias_aviso}d
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </div>
                        <div className="col-span-2 flex justify-center gap-1">
                          <button onClick={() => iniciarEdicionTipo(tipo)} className="p-1 text-blue-400 hover:text-blue-600" title="Editar"><PencilIcon /></button>
                          <button
                            onClick={() => borrarTipoCaja(tipo.id)}
                            disabled={borrandoTipo === tipo.id}
                            className="p-1 text-red-400 hover:text-red-600 disabled:opacity-50"
                            title="Borrar"
                          >
                            {borrandoTipo === tipo.id ? <span className="text-xs">...</span> : <TrashIcon />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ============ TAB: INVENTARIO DE CAJAS ============ */}
          {tabActiva === 'inventario' && (
            <div className="p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <InventoryIcon className="w-5 h-5 text-emerald-500" />
                Control de Inventario de Cajas
                {sucursalActual && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sucursalActual.color_hex }} />
                    {sucursalActual.nombre}
                  </span>
                )}
                {esVistaGeneral && sucursales.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    General (todas)
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                {sucursalActual
                  ? `Stock de cajas en ${sucursalActual.nombre}. Cambia de sucursal desde el selector del menú.`
                  : 'Gestiona el stock de cada tipo de caja: cuántas tienes, cuántas has gastado y el ritmo de consumo.'
                }
              </p>

              {/* Filtro por fechas */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
                    <input
                      type="date"
                      value={fechaDesde}
                      onChange={(e) => setFechaDesde(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
                    <input
                      type="date"
                      value={fechaHasta}
                      onChange={(e) => setFechaHasta(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={aplicarFiltroFechas}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Filtrar
                  </button>
                  {(fechaDesde || fechaHasta) && (
                    <button
                      onClick={() => { setFechaDesde(''); setFechaHasta(''); setTimeout(cargarResumenCajas, 100); }}
                      className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:underline"
                    >
                      Limpiar filtro
                    </button>
                  )}
                </div>
              </div>

              {/* Cards de resumen */}
              {cargandoResumen ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
                </div>
              ) : resumenCajas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No hay tipos de caja. Crea tipos en la pestaña &quot;Tipos de Caja&quot; primero.
                </div>
              ) : (
                <div className="space-y-4">
                  {resumenCajas.map((resumen) => {
                    const isExpanded = expandedTipo === resumen.id;
                    const movs = movimientosTipo[resumen.id] || [];
                    const stockBajo = resumen.stock_actual <= 5;
                    const stockCritico = resumen.stock_actual === 0;

                    return (
                      <div key={resumen.id} className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Cabecera del tipo */}
                        <div className={`p-4 ${stockCritico ? 'bg-red-50' : stockBajo ? 'bg-amber-50' : 'bg-white'}`}>
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            {/* Info del tipo */}
                            <div className="flex items-center gap-3">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stockCritico ? 'bg-red-100' : stockBajo ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                                <PackageIcon className={`w-6 h-6 ${stockCritico ? 'text-red-600' : stockBajo ? 'text-amber-600' : 'text-emerald-600'}`} />
                              </div>
                              <div>
                                <h3 className="font-bold text-gray-900">{resumen.tipo_nombre}</h3>
                                <p className="text-xs text-gray-400 font-mono">REF: {resumen.referencia_caja}</p>
                                {resumen.descripcion && <p className="text-xs text-gray-500">{resumen.descripcion}</p>}
                              </div>
                            </div>

                            {/* Estadísticas */}
                            <div className="flex items-center gap-6">
                              {/* Stock actual */}
                              <div className="text-center">
                                <p className={`text-3xl font-bold ${stockCritico ? 'text-red-600' : stockBajo ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {resumen.stock_actual}
                                </p>
                                <p className="text-xs text-gray-500">Disponibles</p>
                              </div>

                              {/* Entradas */}
                              <div className="text-center">
                                <p className="text-xl font-bold text-blue-600">
                                  {resumen.total_entradas}
                                </p>
                                <p className="text-xs text-gray-500">Entradas</p>
                              </div>

                              {/* Consumidas */}
                              <div className="text-center">
                                <p className="text-xl font-bold text-orange-600">
                                  {resumen.consumo_periodo}
                                </p>
                                <p className="text-xs text-gray-500">Consumidas</p>
                              </div>

                              {/* Media diaria */}
                              <div className="text-center">
                                <p className="text-lg font-bold text-purple-600">
                                  {resumen.media_diaria}
                                </p>
                                <p className="text-xs text-gray-500">Cajas/día</p>
                              </div>

                              {/* Estimación días restantes */}
                              <div className="text-center">
                                <p className={`text-lg font-bold ${
                                  resumen.dias_restantes != null && resumen.dias_aviso != null && resumen.dias_restantes <= resumen.dias_aviso
                                    ? 'text-red-600'
                                    : 'text-gray-700'
                                }`}>
                                  {resumen.dias_restantes != null ? resumen.dias_restantes : '—'}
                                </p>
                                <p className="text-xs text-gray-500">Días restantes</p>
                                {resumen.dias_aviso != null && (
                                  <p className={`text-[10px] mt-0.5 ${
                                    resumen.dias_restantes != null && resumen.dias_restantes <= resumen.dias_aviso
                                      ? 'text-red-500 font-medium'
                                      : 'text-gray-400'
                                  }`}>
                                    Aviso: {resumen.dias_aviso}d
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Desglose por sucursal (solo en vista General con múltiples sucursales) */}
                          {esVistaGeneral && resumen.stock_por_sucursal && resumen.stock_por_sucursal.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-500 mb-2">Stock por sucursal:</p>
                              <div className="flex flex-wrap gap-2">
                                {resumen.stock_por_sucursal.map(ss => (
                                  <div
                                    key={ss.sucursal_id}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-sm"
                                  >
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ss.color_hex }} />
                                    <span className="text-gray-600">{ss.sucursal_nombre}</span>
                                    <span className={`font-bold ${ss.stock_actual === 0 ? 'text-red-500' : ss.stock_actual <= 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                      {ss.stock_actual}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Acciones rápidas: añadir/consumir (solo admin) */}
                          {esAdmin && (
                          <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center gap-3">
                            {/* Entrada de stock */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                placeholder="Cant."
                                value={cantidadEntrada[resumen.id] || ''}
                                onChange={(e) => setCantidadEntrada(prev => ({ ...prev, [resumen.id]: e.target.value }))}
                                className="w-20 px-2 py-1.5 border border-green-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                              <button
                                onClick={() => registrarMovimiento(resumen.id, 'entrada')}
                                disabled={registrandoMov}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                title="Añadir cajas al stock"
                              >
                                <ArrowUpIcon className="w-3.5 h-3.5" /> Entrada
                              </button>
                            </div>

                            {/* Consumo manual */}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                placeholder="Cant."
                                value={cantidadConsumo[resumen.id] || ''}
                                onChange={(e) => setCantidadConsumo(prev => ({ ...prev, [resumen.id]: e.target.value }))}
                                className="w-20 px-2 py-1.5 border border-orange-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                              <button
                                onClick={() => registrarMovimiento(resumen.id, 'consumo')}
                                disabled={registrandoMov}
                                className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                title="Registrar consumo de cajas"
                              >
                                <ArrowDownIcon className="w-3.5 h-3.5" /> Consumo
                              </button>
                            </div>

                            {/* Notas (opcional) */}
                            <input
                              type="text"
                              placeholder="Notas (opcional)"
                              value={notasMovimiento[resumen.id] || ''}
                              onChange={(e) => setNotasMovimiento(prev => ({ ...prev, [resumen.id]: e.target.value }))}
                              className="flex-1 min-w-[120px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                            />
                          </div>
                          )}

                          {/* Ver historial (visible para todos) */}
                          <div className={`${esAdmin ? '' : 'mt-3 pt-3 border-t border-gray-200'} flex justify-end ${esAdmin ? 'mt-2' : ''}`}>
                            <button
                              onClick={() => cargarMovimientosTipo(resumen.id)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                                isExpanded
                                  ? 'bg-gray-200 text-gray-700'
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                              }`}
                            >
                              <ClockIcon className="w-3.5 h-3.5" />
                              {isExpanded ? 'Ocultar historial' : 'Ver historial'}
                            </button>
                          </div>
                        </div>

                        {/* Historial de movimientos (expandido) */}
                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 p-4">
                            {cargandoMovimientos ? (
                              <div className="text-center py-4">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600 mx-auto"></div>
                              </div>
                            ) : movs.length === 0 ? (
                              <p className="text-gray-500 text-sm text-center py-4">Sin movimientos registrados</p>
                            ) : (
                              <div className="space-y-1">
                                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase px-3 py-1.5">
                                  <div className="col-span-2">Fecha</div>
                                  <div className="col-span-2">Tipo</div>
                                  <div className="col-span-2 text-right">Cantidad</div>
                                  <div className={esVistaGeneral ? 'col-span-2' : 'col-span-3'}>Notas</div>
                                  {esVistaGeneral && <div className="col-span-2">Sucursal</div>}
                                  <div className={esVistaGeneral ? 'col-span-2' : 'col-span-3'}>Usuario</div>
                                </div>
                                {movs.map((m) => (
                                  <div key={m.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2 rounded bg-white border border-gray-100 text-sm">
                                    <div className="col-span-2 text-xs text-gray-600">
                                      {new Date(m.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                                      {' '}
                                      {new Date(m.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className="col-span-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        m.tipo_movimiento === 'entrada'
                                          ? 'bg-green-100 text-green-700'
                                          : m.tipo_movimiento === 'consumo'
                                          ? 'bg-orange-100 text-orange-700'
                                          : 'bg-gray-100 text-gray-700'
                                      }`}>
                                        {m.tipo_movimiento === 'entrada' && <ArrowUpIcon className="w-3 h-3" />}
                                        {m.tipo_movimiento === 'consumo' && <ArrowDownIcon className="w-3 h-3" />}
                                        {m.tipo_movimiento}
                                      </span>
                                    </div>
                                    <div className={`col-span-2 text-right font-bold ${
                                      m.cantidad > 0 ? 'text-green-600' : 'text-orange-600'
                                    }`}>
                                      {m.cantidad > 0 ? '+' : ''}{m.cantidad}
                                    </div>
                                    <div className={`${esVistaGeneral ? 'col-span-2' : 'col-span-3'} text-xs text-gray-500 truncate`}>{m.notas || '—'}</div>
                                    {esVistaGeneral && (
                                      <div className="col-span-2 text-xs text-gray-500 truncate">
                                        {m.sucursal_nombre || '—'}
                                      </div>
                                    )}
                                    <div className={`${esVistaGeneral ? 'col-span-2' : 'col-span-3'} text-xs text-gray-400 truncate`}>{m.usuario_email || '—'}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ============ TAB: ESTADÍSTICAS ============ */}
          {tabActiva === 'estadisticas' && (
            <div className="p-4">
              {cargandoEstadisticas ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-500 text-sm mt-3">Cargando estadísticas...</p>
                </div>
              ) : !estadisticas ? (
                <div className="text-center py-12 text-gray-500">No se pudieron cargar las estadísticas</div>
              ) : (
                <div className="space-y-6">
                  {/* Tarjetas resumen */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                      <div className="flex items-center gap-2 text-blue-600 text-sm font-medium mb-1">
                        <CalendarIcon className="w-4 h-4" />
                        Hoy
                      </div>
                      <div className="text-3xl font-bold text-blue-700">{estadisticas.total_hoy}</div>
                      <div className="text-xs text-blue-500 mt-1">paquetes</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
                      <div className="flex items-center gap-2 text-green-600 text-sm font-medium mb-1">
                        <CalendarIcon className="w-4 h-4" />
                        Esta semana
                      </div>
                      <div className="text-3xl font-bold text-green-700">{estadisticas.total_semana}</div>
                      <div className="text-xs text-green-500 mt-1">paquetes</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                      <div className="flex items-center gap-2 text-purple-600 text-sm font-medium mb-1">
                        <CalendarIcon className="w-4 h-4" />
                        Este mes
                      </div>
                      <div className="text-3xl font-bold text-purple-700">{estadisticas.total_mes}</div>
                      <div className="text-xs text-purple-500 mt-1">paquetes</div>
                    </div>
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
                      <div className="flex items-center gap-2 text-amber-600 text-sm font-medium mb-1">
                        <PackageIcon className="w-4 h-4" />
                        Total histórico
                      </div>
                      <div className="text-3xl font-bold text-amber-700">{estadisticas.total_historico.toLocaleString('es-ES')}</div>
                      <div className="text-xs text-amber-500 mt-1">paquetes</div>
                    </div>
                  </div>

                  {/* Métricas secundarias */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <ChartBarIcon className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Promedio diario</p>
                        <p className="text-2xl font-bold text-gray-900">{estadisticas.promedio_diario}</p>
                        <p className="text-xs text-gray-400">últ. 30 días ({estadisticas.dias_trabajados} trabajados)</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-4">
                      <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                        <FireIcon className="w-6 h-6 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Mejor día (récord)</p>
                        <p className="text-2xl font-bold text-gray-900">{estadisticas.mejor_dia_total}</p>
                        <p className="text-xs text-gray-400">
                          {estadisticas.mejor_dia_fecha 
                            ? new Date(estadisticas.mejor_dia_fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
                            : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-4">
                      <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                        <TrophyIcon className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Hoy vs Promedio</p>
                        {(() => {
                          const diff = estadisticas.promedio_diario > 0
                            ? Math.round(((estadisticas.total_hoy - estadisticas.promedio_diario) / estadisticas.promedio_diario) * 100)
                            : 0;
                          return (
                            <>
                              <p className={`text-2xl font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {diff >= 0 ? '+' : ''}{diff}%
                              </p>
                              <p className="text-xs text-gray-400">{diff >= 0 ? 'Por encima' : 'Por debajo'} del promedio</p>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Gráfica últimos 7 días */}
                  {estadisticas.ultimos_dias.length > 0 && (
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <ChartBarIcon className="w-5 h-5 text-blue-500" />
                        Últimos 7 días
                      </h3>
                      {(() => {
                        const maxVal = Math.max(...estadisticas.ultimos_dias.map(d => d.total), 1);
                        const hoy = new Date().toISOString().split('T')[0];
                        return (
                          <div className="flex items-end gap-3 h-52 pt-8 relative">
                            {/* Línea de promedio */}
                            {estadisticas.promedio_diario > 0 && (
                              <div
                                className="absolute left-0 right-0 border-t-2 border-dashed border-blue-300 z-10"
                                style={{ bottom: `${Math.min((estadisticas.promedio_diario / maxVal) * 192, 192)}px` }}
                              >
                                <span className="absolute -top-5 right-0 text-xs text-blue-400 font-medium">
                                  Prom: {estadisticas.promedio_diario}
                                </span>
                              </div>
                            )}
                            {estadisticas.ultimos_dias.map((dia) => {
                              const esHoy = dia.fecha === hoy;
                              const h = maxVal > 0 ? Math.max((dia.total / maxVal) * 192, 4) : 4;
                              const porEncima = dia.total >= estadisticas.promedio_diario;
                              return (
                                <div key={dia.fecha} className="flex-1 flex flex-col items-center justify-end group relative">
                                  {/* Tooltip */}
                                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap z-50 shadow-lg">
                                    <div className="font-semibold">{dia.dia_semana} {dia.fecha.split('-')[2]}/{dia.fecha.split('-')[1]}</div>
                                    <div>{dia.total} paquetes</div>
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                                  </div>
                                  <span className="text-sm font-bold text-gray-700 mb-1">{dia.total}</span>
                                  <div
                                    className={`w-full rounded-t-lg transition-all duration-500 ${
                                      esHoy
                                        ? 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-lg shadow-blue-200'
                                        : porEncima
                                          ? 'bg-gradient-to-t from-green-500 to-green-400'
                                          : dia.total === 0
                                            ? 'bg-gray-200'
                                            : 'bg-gradient-to-t from-orange-400 to-orange-300'
                                    }`}
                                    style={{ height: `${h}px` }}
                                  />
                                  <div className="mt-2 text-center">
                                    <span className={`text-sm font-medium ${esHoy ? 'text-blue-600' : 'text-gray-600'}`}>
                                      {dia.dia_semana.substring(0, 3)}
                                    </span>
                                    <span className={`block text-xs ${esHoy ? 'text-blue-400 font-semibold' : 'text-gray-400'}`}>
                                      {dia.fecha.split('-')[2]}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                      <div className="flex justify-center gap-6 mt-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded bg-blue-500"></span> Hoy
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded bg-green-500"></span> Sobre promedio
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded bg-orange-400"></span> Bajo promedio
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Rankings del mes: usuarios y cajas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Ranking usuarios */}
                    {estadisticas.usuarios.length > 0 && (
                      <div className="bg-white rounded-xl p-5 border border-gray-200">
                        <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <UsersIcon className="w-5 h-5 text-indigo-500" />
                          Ranking Operarios (mes)
                        </h3>
                        <div className="space-y-3">
                          {estadisticas.usuarios.map((usr, idx) => (
                            <div key={usr.usuario_id} className="flex items-center gap-3">
                              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                idx === 0 ? 'bg-amber-100 text-amber-700' :
                                idx === 1 ? 'bg-gray-100 text-gray-600' :
                                idx === 2 ? 'bg-orange-100 text-orange-600' :
                                'bg-gray-50 text-gray-400'
                              }`}>
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-gray-800 truncate">
                                    {usr.usuario_nombre || usr.usuario_email.split('@')[0]}
                                  </span>
                                  <span className="text-sm font-bold text-gray-900 ml-2">{usr.total} pieza{usr.total !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-500 ${
                                      idx === 0 ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                      idx === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                                      'bg-gradient-to-r from-blue-400 to-blue-500'
                                    }`}
                                    style={{ width: `${usr.porcentaje}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400">{usr.porcentaje}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cajas más usadas */}
                    {estadisticas.cajas_top.length > 0 && (
                      <div className="bg-white rounded-xl p-5 border border-gray-200">
                        <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <PackageIcon className="w-5 h-5 text-amber-500" />
                          Cajas más usadas (mes)
                        </h3>
                        <div className="space-y-3">
                          {estadisticas.cajas_top.map((caja, idx) => (
                            <div key={caja.id_caja} className="flex items-center gap-3">
                              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                                idx === 0 ? 'bg-amber-100 text-amber-700' :
                                idx === 1 ? 'bg-gray-100 text-gray-600' :
                                idx === 2 ? 'bg-orange-100 text-orange-600' :
                                'bg-gray-50 text-gray-400'
                              }`}>
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="truncate">
                                    <span className="text-sm font-mono font-bold text-amber-700">{caja.id_caja}</span>
                                    {caja.tipo_nombre && (
                                      <span className="text-xs text-gray-400 ml-2">({caja.tipo_nombre})</span>
                                    )}
                                  </div>
                                  <span className="text-sm font-bold text-gray-900 ml-2 whitespace-nowrap">{caja.total_piezas} pzas</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                  <div
                                    className="h-2 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-all duration-500"
                                    style={{ width: `${caja.porcentaje}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400">{caja.porcentaje}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Desglose por sucursal (solo en vista General) */}
                    {esVistaGeneral && estadisticas.por_sucursal && estadisticas.por_sucursal.length > 0 && (
                      <div className="bg-white rounded-xl p-5 border border-gray-200 md:col-span-2">
                        <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
                          </svg>
                          Desglose por Sucursal
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {estadisticas.por_sucursal.map(suc => (
                            <button
                              key={suc.sucursal_id}
                              onClick={() => seleccionarSucursal(suc.sucursal_id)}
                              className="text-left p-4 rounded-xl border-2 border-gray-100 hover:border-blue-300 hover:shadow transition-all"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: suc.color_hex }} />
                                <span className="font-semibold text-gray-900">{suc.sucursal_nombre}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-gray-500">Hoy:</span>{' '}
                                  <span className="font-bold" style={{ color: suc.color_hex }}>{suc.total_hoy}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Mes:</span>{' '}
                                  <span className="font-bold" style={{ color: suc.color_hex }}>{suc.total_mes}</span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ============== WRAPPER CON PROTECCIÓN ==============
export default function PaqueteriaPage() {
  return (
    <ModuloProtegido modulo="paqueteria">
      <PaqueteriaContent />
    </ModuloProtegido>
  );
}
