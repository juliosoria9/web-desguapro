'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/auth-store';
import ModuloProtegido from '@/components/ModuloProtegido';

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/v1`;

interface PiezaVerificacion {
  referencia: string;
  cantidad_solicitada: number;
  encontrada: boolean;
  cantidad_stock: number;
  suficiente: boolean;
  porcentaje_stock: number;
  cantidad_a_comprar: number;
  necesita_comprar: boolean;
  articulo?: string;
  marca?: string;
  precio?: number;
  ubicacion?: string;
  imagen?: string;
  oe?: string;
  iam?: string;
  observaciones?: string;
  ultima_compra?: string;
  ultima_venta?: string;
  rotacion_dias?: number;
  ventas_totales?: number;
}

interface ArchivoGuardado {
  id: number;
  nombre: string;
  fecha: string;
  total_piezas: number;
}

interface PiezaEditar {
  referencia: string;
  cantidad: number;
  oe: string;
  iam: string;
  precio: string;
  observaciones: string;
  imagen: string;
}

interface Entorno {
  id: number;
  nombre: string;
}

function VerificarPiezasContent() {
  const router = useRouter();
  const { user, token, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [archivoActual, setArchivoActual] = useState<ArchivoGuardado | null>(null);
  const [mostrarCambiar, setMostrarCambiar] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [umbralCompra, setUmbralCompra] = useState(30);
  const [resultados, setResultados] = useState<PiezaVerificacion[]>([]);
  const [resumen, setResumen] = useState<{total: number, encontradas: number, suficientes: number, a_comprar: number} | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [imagenesModal, setImagenesModal] = useState<string[]>([]);
  const [imagenActualIdx, setImagenActualIdx] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados para edición
  const [editandoPieza, setEditandoPieza] = useState<PiezaEditar | null>(null);
  const [piezaOriginalRef, setPiezaOriginalRef] = useState<string>('');
  const [guardando, setGuardando] = useState(false);
  
  // Estados para piezas pedidas
  const [piezasPedidas, setPiezasPedidas] = useState<Set<string>>(new Set());
  const [mostrarPedidas, setMostrarPedidas] = useState(false);
  
  // Paginación para Stock OK
  const [paginaStock, setPaginaStock] = useState(1);
  const ITEMS_POR_PAGINA = 100;
  
  // Para sysowner: selector de entorno
  const [empresas, setEmpresas] = useState<Entorno[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (token && user) {
      if (user.rol === 'sysowner') {
        fetchEmpresas();
      } else {
        cargarCSVGuardado();
        cargarPiezasPedidas();
      }
    }
  }, [token, user]);
  
  // Cuando sysowner selecciona una empresa, re-verificar el stock
  useEffect(() => {
    if (user?.rol === 'sysowner' && selectedEmpresa && token && archivoActual) {
      // Re-verificar el CSV actual contra el stock del nuevo entorno
      verificarCSVGuardado(archivoActual.id);
    } else if (user?.rol === 'sysowner' && selectedEmpresa && token && !archivoActual) {
      // Si no hay archivo cargado, cargar
      cargarCSVGuardado();
      cargarPiezasPedidas();
    }
  }, [selectedEmpresa]);
  
  // Fetch empresas para sysowner
  const fetchEmpresas = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/auth/entornos`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEmpresas(response.data || []);
    } catch (error) {
      console.error('Error fetching empresas:', error);
    }
  };

  // Cargar piezas que ya están pedidas
  const cargarPiezasPedidas = async () => {
    try {
      const response = await axios.get(`${API_URL}/piezas/pedidas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const refs = new Set<string>(response.data.piezas?.map((p: any) => p.referencia) || []);
      setPiezasPedidas(refs);
    } catch (error) {
      console.error('Error cargando pedidas:', error);
    }
  };

  // Cargar CSV guardado automáticamente al iniciar
  const cargarCSVGuardado = async () => {
    try {
      setCargandoInicial(true);
      // Para sysowner, NO filtrar por entorno al listar CSVs (verá todos)
      // El entorno seleccionado solo afecta la verificación del stock
      const response = await axios.get(`${API_URL}/piezas/csv-guardados`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const archivos = response.data.archivos || [];
      if (archivos.length > 0) {
        // Hay un archivo guardado, cargarlo y verificar automáticamente
        const archivoGuardado = archivos[0];
        setArchivoActual(archivoGuardado);
        await verificarCSVGuardado(archivoGuardado.id);
      } else {
        setArchivoActual(null);
        setResultados([]);
        setResumen(null);
      }
    } catch (error) {
      console.error('Error cargando CSV guardado:', error);
    } finally {
      setCargandoInicial(false);
    }
  };

  // Verificar un CSV guardado por su ID
  const verificarCSVGuardado = async (csvId: number) => {
    try {
      setLoading(true);
      // Para sysowner, incluir el entorno seleccionado
      const body: any = { umbral_compra: umbralCompra };
      if (user?.rol === 'sysowner' && selectedEmpresa) {
        body.entorno_id = selectedEmpresa;
      }
      const response = await axios.post(
        `${API_URL}/piezas/verificar-guardado/${csvId}`,
        body,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setResultados(response.data.piezas || []);
      setResumen(response.data.resumen || null);
    } catch (error: any) {
      console.error('Error verificando CSV guardado:', error);
      toast.error('Error al verificar el archivo guardado');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setArchivo(file);
    }
  };

  // Subir nuevo CSV y reemplazar el anterior
  const subirNuevoCSV = async () => {
    if (!archivo) {
      toast.error('Selecciona un archivo CSV');
      return;
    }

    setLoading(true);
    try {
      // Eliminar el anterior si existe
      if (archivoActual) {
        try {
          await axios.delete(`${API_URL}/piezas/csv-guardados/${archivoActual.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch (e) {
          console.error('Error eliminando archivo anterior:', e);
        }
      }

      // Subir el nuevo
      const formData = new FormData();
      formData.append('archivo', archivo);
      formData.append('umbral_compra', umbralCompra.toString());
      formData.append('guardar', 'true');

      const response = await axios.post(
        `${API_URL}/piezas/verificar-csv`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      setResultados(response.data.piezas || []);
      setResumen(response.data.resumen || null);
      
      // Actualizar archivo actual
      const archivosResp = await axios.get(`${API_URL}/piezas/csv-guardados`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const archivos = archivosResp.data.archivos || [];
      if (archivos.length > 0) {
        setArchivoActual(archivos[0]);
      }
      
      setMostrarCambiar(false);
      setArchivo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      toast.success('Archivo actualizado correctamente');
    } catch (error: any) {
      console.error('Error subiendo CSV:', error);
      toast.error(error.response?.data?.detail || 'Error al subir el archivo');
    } finally {
      setLoading(false);
    }
  };

  // Reverificar con nuevo umbral
  const reverificar = async () => {
    if (archivoActual) {
      await verificarCSVGuardado(archivoActual.id);
    }
  };

  const descargarCSV = async () => {
    if (!archivoActual) return;
    try {
      const response = await axios.get(`${API_URL}/piezas/csv-guardados/${archivoActual.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = archivoActual.nombre;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Error al descargar');
    }
  };

  // Filtrar resultados por búsqueda
  const filtrarPiezas = (piezas: PiezaVerificacion[]) => {
    if (!busqueda.trim()) return piezas;
    const term = busqueda.toLowerCase();
    return piezas.filter(p => 
      p.referencia.toLowerCase().includes(term) ||
      p.articulo?.toLowerCase().includes(term) ||
      p.marca?.toLowerCase().includes(term) ||
      p.oe?.toLowerCase().includes(term) ||
      p.iam?.toLowerCase().includes(term)
    );
  };

  // Filtrar piezas ya pedidas de la lista de comprar (a menos que se quieran ver)
  const piezasAComprarTodas = filtrarPiezas(resultados.filter(p => p.necesita_comprar));
  const piezasAComprar = mostrarPedidas 
    ? piezasAComprarTodas 
    : piezasAComprarTodas.filter(p => !piezasPedidas.has(p.referencia));
  const piezasPedidasLista = piezasAComprarTodas.filter(p => piezasPedidas.has(p.referencia));
  const piezasOk = filtrarPiezas(resultados.filter(p => !p.necesita_comprar && p.encontrada));

  // Contar piezas por OEM para mostrar en burbuja
  const contadorPorOem = React.useMemo(() => {
    const contador: Record<string, number> = {};
    resultados.forEach(p => {
      if (p.oe && p.oe.trim()) {
        const oe = p.oe.trim().toLowerCase();
        contador[oe] = (contador[oe] || 0) + 1;
      }
    });
    return contador;
  }, [resultados]);

  // Función para obtener cantidad de piezas con mismo OEM
  const getCantidadMismoOem = (pieza: PiezaVerificacion): number => {
    if (!pieza.oe || !pieza.oe.trim()) return 0;
    return contadorPorOem[pieza.oe.trim().toLowerCase()] || 0;
  };

  const exportarCompras = () => {
    if (piezasAComprar.length === 0) return;
    const csv = [
      'OEM;CANTIDAD_NECESARIA;CANTIDAD_EN_STOCK;CANTIDAD_A_COMPRAR;ARTICULO;MARCA;PRECIO_UNIT',
      ...piezasAComprar.map(r => 
        `${r.referencia};${r.cantidad_solicitada};${r.cantidad_stock};${r.cantidad_a_comprar};${r.articulo || ''};${r.marca || ''};${r.precio || ''}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `piezas_a_comprar_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Abrir galería de imágenes
  const abrirGaleria = (imagenStr: string | undefined) => {
    if (!imagenStr) return;
    // Separar por comas y limpiar espacios
    const imagenes = imagenStr.split(',').map(img => img.trim()).filter(img => img.length > 0);
    if (imagenes.length > 0) {
      setImagenesModal(imagenes);
      setImagenActualIdx(0);
    }
  };

  // Abrir modal de edición
  const abrirEdicion = (pieza: PiezaVerificacion) => {
    setPiezaOriginalRef(pieza.referencia);
    setEditandoPieza({
      referencia: pieza.referencia,
      cantidad: pieza.cantidad_solicitada,
      oe: pieza.oe || '',
      iam: pieza.iam || '',
      precio: pieza.precio?.toString() || '',
      observaciones: pieza.observaciones || '',
      imagen: pieza.imagen || ''
    });
  };

  // Guardar edición de pieza
  const guardarEdicion = async () => {
    if (!editandoPieza || !archivoActual) return;
    
    setGuardando(true);
    try {
      // Obtener contenido actual del CSV
      const response = await axios.get(`${API_URL}/piezas/csv-guardados/${archivoActual.id}/contenido`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      let piezas = response.data.piezas || [];
      
      // Buscar y actualizar la pieza
      const idx = piezas.findIndex((p: any) => p.oem === piezaOriginalRef);
      if (idx >= 0) {
        piezas[idx] = {
          oem: editandoPieza.referencia,
          cantidad: editandoPieza.cantidad,
          oe: editandoPieza.oe,
          iam: editandoPieza.iam,
          precio: editandoPieza.precio,
          observaciones: editandoPieza.observaciones,
          imagen: editandoPieza.imagen
        };
      }
      
      // Guardar CSV actualizado
      await axios.put(`${API_URL}/piezas/csv-guardados/${archivoActual.id}`, {
        piezas: piezas
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Pieza actualizada');
      setEditandoPieza(null);
      
      // Reverificar
      await verificarCSVGuardado(archivoActual.id);
    } catch (error) {
      console.error('Error guardando:', error);
      toast.error('Error al guardar cambios');
    } finally {
      setGuardando(false);
    }
  };

  // Eliminar pieza del CSV
  const eliminarPieza = async (referencia: string) => {
    if (!archivoActual) return;
    if (!confirm(`¿Eliminar la pieza ${referencia} del listado?`)) return;
    
    setGuardando(true);
    try {
      // Obtener contenido actual
      const response = await axios.get(`${API_URL}/piezas/csv-guardados/${archivoActual.id}/contenido`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      let piezas = response.data.piezas || [];
      
      // Filtrar la pieza a eliminar
      piezas = piezas.filter((p: any) => p.oem !== referencia);
      
      // Guardar CSV actualizado
      await axios.put(`${API_URL}/piezas/csv-guardados/${archivoActual.id}`, {
        piezas: piezas
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Actualizar contador local
      setArchivoActual(prev => prev ? {...prev, total_piezas: piezas.length} : null);
      
      toast.success('Pieza eliminada');
      
      // Reverificar
      await verificarCSVGuardado(archivoActual.id);
    } catch (error) {
      console.error('Error eliminando:', error);
      toast.error('Error al eliminar');
    } finally {
      setGuardando(false);
    }
  };

  // Marcar pieza como pedida/comprada
  const marcarComoPedida = async (pieza: PiezaVerificacion) => {
    try {
      await axios.post(`${API_URL}/piezas/pedidas`, {
        referencia: pieza.referencia,
        cantidad: pieza.cantidad_a_comprar,
        observaciones: pieza.articulo || pieza.observaciones
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Actualizar estado local
      setPiezasPedidas(prev => new Set([...prev, pieza.referencia]));
      toast.success(`${pieza.referencia} marcada como pedida`);
    } catch (error) {
      console.error('Error marcando pedida:', error);
      toast.error('Error al marcar como pedida');
    }
  };

  // Cancelar pedido
  const cancelarPedido = async (referencia: string) => {
    try {
      await axios.delete(`${API_URL}/piezas/pedidas/${encodeURIComponent(referencia)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Actualizar estado local
      setPiezasPedidas(prev => {
        const nuevo = new Set(prev);
        nuevo.delete(referencia);
        return nuevo;
      });
      toast.success('Pedido cancelado');
    } catch (error) {
      console.error('Error cancelando:', error);
      toast.error('Error al cancelar pedido');
    }
  };

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modal galería de imágenes */}
      {imagenesModal.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4" onClick={() => setImagenesModal([])}>
          <div className="max-w-5xl w-full max-h-[90vh] relative" onClick={e => e.stopPropagation()}>
            {/* Botón cerrar */}
            <button 
              onClick={() => setImagenesModal([])} 
              className="absolute -top-12 right-0 text-white text-3xl hover:text-gray-300 z-10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Contador */}
            {imagenesModal.length > 1 && (
              <div className="absolute -top-12 left-0 text-white text-lg font-medium">
                {imagenActualIdx + 1} / {imagenesModal.length}
              </div>
            )}
            
            {/* Imagen actual */}
            <div className="flex items-center justify-center h-[80vh]">
              <img 
                src={imagenesModal[imagenActualIdx]} 
                alt={`Imagen ${imagenActualIdx + 1}`} 
                className="max-w-full max-h-full object-contain rounded-lg"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="%23334155" width="200" height="200"/><text fill="%239ca3af" font-size="14" x="50%" y="50%" text-anchor="middle" dy=".3em">Error al cargar</text></svg>';
                }}
              />
            </div>
            
            {/* Navegación */}
            {imagenesModal.length > 1 && (
              <>
                {/* Botón anterior */}
                <button
                  onClick={() => setImagenActualIdx(prev => prev > 0 ? prev - 1 : imagenesModal.length - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                </button>
                
                {/* Botón siguiente */}
                <button
                  onClick={() => setImagenActualIdx(prev => prev < imagenesModal.length - 1 ? prev + 1 : 0)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-3 rounded-full transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </>
            )}
            
            {/* Miniaturas */}
            {imagenesModal.length > 1 && (
              <div className="flex justify-center gap-2 mt-4 overflow-x-auto pb-2">
                {imagenesModal.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setImagenActualIdx(idx)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${idx === imagenActualIdx ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal edición */}
      {editandoPieza && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setEditandoPieza(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg> Editar Pieza</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OEM / Referencia</label>
                <input
                  type="text"
                  value={editandoPieza.referencia}
                  onChange={e => setEditandoPieza({...editandoPieza, referencia: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={editandoPieza.cantidad}
                    onChange={e => setEditandoPieza({...editandoPieza, cantidad: parseInt(e.target.value) || 1})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio</label>
                  <input
                    type="text"
                    value={editandoPieza.precio}
                    onChange={e => setEditandoPieza({...editandoPieza, precio: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">OE</label>
                  <input
                    type="text"
                    value={editandoPieza.oe}
                    onChange={e => setEditandoPieza({...editandoPieza, oe: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IAM</label>
                  <input
                    type="text"
                    value={editandoPieza.iam}
                    onChange={e => setEditandoPieza({...editandoPieza, iam: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Artículo</label>
                <input
                  type="text"
                  value={editandoPieza.imagen}
                  onChange={e => setEditandoPieza({...editandoPieza, imagen: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Imagen</label>
                <input
                  type="text"
                  value={editandoPieza.observaciones}
                  onChange={e => setEditandoPieza({...editandoPieza, observaciones: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditandoPieza(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={guardarEdicion}
                disabled={guardando || !editandoPieza.referencia}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {guardando ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Guardando...</>
                ) : (
                  <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg> Guardar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button onClick={() => router.push('/dashboard')} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Control de Stock</h1>
                <p className="text-xs text-gray-500">Verificar y gestionar reposición</p>
              </div>
            </div>
            <span className="text-sm text-gray-600">{user.email}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Selector de empresa para sysowner */}
        {user.rol === 'sysowner' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Seleccionar Empresa</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {empresas.map((empresa) => (
                <button
                  key={empresa.id}
                  onClick={() => setSelectedEmpresa(empresa.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedEmpresa === empresa.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900 text-sm">{empresa.nombre}</p>
                </button>
              ))}
              {empresas.length === 0 && (
                <p className="col-span-4 text-center text-gray-500 py-4">
                  No hay empresas creadas
                </p>
              )}
            </div>
          </div>
        )}

        {/* Mostrar solo si hay empresa seleccionada (o no es sysowner) */}
        {(user.rol !== 'sysowner' || selectedEmpresa) ? (
          <>
        {cargandoInicial ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-500">Cargando datos...</p>
          </div>
        ) : (
          <>
            {/* Archivo actual */}
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              {archivoActual ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-blue-600"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                    <div>
                      <h3 className="font-semibold text-gray-800">{archivoActual.nombre}</h3>
                      <p className="text-sm text-gray-500">{archivoActual.total_piezas} piezas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => router.push(`/editar-csv?id=${archivoActual.id}`)} className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg> Editar
                    </button>
                    <button onClick={descargarCSV} className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg> Descargar
                    </button>
                    <button onClick={() => setMostrarCambiar(!mostrarCambiar)} className="px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg> Cambiar archivo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500 mb-3">No hay ningún archivo cargado</p>
                  <button onClick={() => setMostrarCambiar(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg> Subir archivo CSV
                  </button>
                </div>
              )}

              {/* Formulario para cambiar/subir archivo */}
              {mostrarCambiar && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-orange-600 mb-3">⚠️ El archivo actual será reemplazado por el nuevo</p>
                  <div className="flex flex-wrap gap-3 items-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileChange}
                      className="flex-1 min-w-64 px-3 py-2 border border-gray-300 rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <button
                      onClick={subirNuevoCSV}
                      disabled={!archivo || loading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? 'Subiendo...' : <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg> Subir y reemplazar</>}
                    </button>
                    <button
                      onClick={() => { setMostrarCambiar(false); setArchivo(null); }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Configuración umbral */}
            {archivoActual && (
              <div className="bg-white rounded-lg shadow p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">Umbral compra:</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="10"
                      value={umbralCompra}
                      onChange={(e) => setUmbralCompra(parseInt(e.target.value))}
                      className="w-32"
                    />
                    <span className="text-lg font-bold text-blue-600 w-14">{umbralCompra}%</span>
                  </div>
                  <button
                    onClick={reverificar}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Verificando...</>
                    ) : (
                      <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg> Verificar</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Resumen */}
            {resumen && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-500">Total referencias</p>
                  <p className="text-2xl font-bold text-gray-900">{resumen.total}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-500">En stock suficiente</p>
                  <p className="text-2xl font-bold text-green-600">{resumen.suficientes}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4 border-2 border-red-200">
                  <p className="text-sm text-gray-500 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg> A comprar</p>
                  <p className="text-2xl font-bold text-red-600">{resumen.a_comprar}</p>
                  <p className="text-xs text-gray-400">(reponer + nuevas)</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm text-gray-500">Nuevas (no en stock)</p>
                  <p className="text-2xl font-bold text-orange-600">{resumen.total - resumen.encontradas}</p>
                </div>
              </div>
            )}

            {/* Buscador */}
            {resultados.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Buscar por OEM, artículo, marca, OE, IAM..."
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  {busqueda && (
                    <button onClick={() => setBusqueda('')} className="text-gray-500 hover:text-gray-700">✕ Limpiar</button>
                  )}
                </div>
              </div>
            )}

            {/* SECCIÓN: Piezas a Comprar */}
            {(piezasAComprar.length > 0 || piezasPedidasLista.length > 0) && (
              <div className="mb-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-red-700 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg> Piezas a Comprar ({piezasAComprar.length})</h2>
                    {piezasPedidasLista.length > 0 && (
                      <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
                        {piezasPedidasLista.length} ya pedidas
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {piezasPedidasLista.length > 0 && (
                      <button 
                        onClick={() => setMostrarPedidas(!mostrarPedidas)}
                        className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${mostrarPedidas ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          {mostrarPedidas ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                          )}
                        </svg>
                        {mostrarPedidas ? 'Ocultar pedidas' : 'Ver pedidas'}
                      </button>
                    )}
                    <button onClick={exportarCompras} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg> Exportar
                    </button>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow overflow-hidden border-2 border-red-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-red-50">
                        <tr>
                          <th className="px-3 py-3 text-left text-xs font-medium text-red-700 uppercase">Imagen</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-red-700 uppercase">OEM</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-red-700 uppercase">Tipo</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-red-700 uppercase">Necesario</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-red-700 uppercase">En Stock</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-red-700 uppercase font-bold">A COMPRAR</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-red-700 uppercase">Artículo</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-red-700 uppercase">Precio</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-red-700 uppercase">Últ. Venta</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-red-700 uppercase">Rotación</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-red-700 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {piezasAComprar.map((pieza, idx) => (
                          <tr key={idx} className={`hover:bg-red-50 ${!pieza.encontrada ? 'bg-orange-50' : ''}`}>
                            <td className="px-3 py-2">
                              {pieza.observaciones ? (
                                <div className="relative w-12 h-12 cursor-pointer group" onClick={() => abrirGaleria(pieza.observaciones)}>
                                  <img src={pieza.observaciones.split(',')[0].trim()} alt="" className="w-12 h-12 object-cover rounded group-hover:opacity-80" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                                  {getCantidadMismoOem(pieza) > 1 && (
                                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium" title={`${getCantidadMismoOem(pieza)} piezas con OEM: ${pieza.oe}`}>
                                      {getCantidadMismoOem(pieza)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">Sin img</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900">{pieza.referencia}</td>
                            <td className="px-3 py-2 text-center">
                              {!pieza.encontrada ? (
                                <span className="px-2 py-1 rounded-full text-xs font-bold bg-orange-500 text-white">NUEVO</span>
                              ) : (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">Reponer</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600 text-center">{pieza.cantidad_solicitada}</td>
                            <td className="px-3 py-2 text-sm text-center"><span className="text-red-600 font-medium">{pieza.cantidad_stock}</span></td>
                            <td className="px-3 py-2 text-center"><span className="text-lg font-bold text-red-600 bg-red-100 px-3 py-1 rounded-lg">+{pieza.cantidad_a_comprar}</span></td>
                            <td className="px-3 py-2 text-sm text-gray-600 max-w-xs truncate" title={pieza.articulo || pieza.observaciones || ''}>{pieza.articulo || pieza.observaciones || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{pieza.precio ? `${pieza.precio.toFixed(2)} €` : '-'}</td>
                            <td className="px-3 py-2 text-center text-xs text-gray-500">
                              {pieza.ultima_venta ? new Date(pieza.ultima_venta).toLocaleDateString('es-ES') : '-'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {pieza.rotacion_dias !== null && pieza.rotacion_dias !== undefined ? (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  pieza.rotacion_dias <= 30 ? 'bg-green-100 text-green-800' :
                                  pieza.rotacion_dias <= 90 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {pieza.rotacion_dias}d
                                </span>
                              ) : '-'}
                              {pieza.ventas_totales ? (
                                <span className="ml-1 text-xs text-gray-400">({pieza.ventas_totales})</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {piezasPedidas.has(pieza.referencia) ? (
                                  <button
                                    onClick={() => cancelarPedido(pieza.referencia)}
                                    className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex items-center gap-1"
                                    title="Cancelar pedido"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                                    Pedida
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => marcarComoPedida(pieza)}
                                    className="px-2 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
                                    title="Marcar como comprada"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg>
                                    Comprar
                                  </button>
                                )}
                                <button
                                  onClick={() => abrirEdicion(pieza)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Editar"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                                </button>
                                <button
                                  onClick={() => eliminarPieza(pieza.referencia)}
                                  disabled={guardando}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                  title="Eliminar"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN: Stock OK */}
            {piezasOk.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-green-700 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Stock OK ({piezasOk.length})
                  </h2>
                  {piezasOk.length > ITEMS_POR_PAGINA && (
                    <span className="text-sm text-gray-500">
                      Mostrando {((paginaStock - 1) * ITEMS_POR_PAGINA) + 1}-{Math.min(paginaStock * ITEMS_POR_PAGINA, piezasOk.length)} de {piezasOk.length}
                    </span>
                  )}
                </div>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-green-50">
                        <tr>
                          <th className="px-3 py-3 text-left text-xs font-medium text-green-700 uppercase">Imagen</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-green-700 uppercase">OEM</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-green-700 uppercase">Necesario</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-green-700 uppercase">En Stock</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-green-700 uppercase">% Stock</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-green-700 uppercase">Artículo</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-green-700 uppercase">Ubicación</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-green-700 uppercase">Últ. Compra</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-green-700 uppercase">Últ. Venta</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-green-700 uppercase">Rotación</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-green-700 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {piezasOk
                          .slice((paginaStock - 1) * ITEMS_POR_PAGINA, paginaStock * ITEMS_POR_PAGINA)
                          .map((pieza, idx) => (
                          <tr key={idx} className="hover:bg-green-50">
                            <td className="px-3 py-2">
                              {pieza.observaciones ? (
                                <div className="relative w-12 h-12 cursor-pointer group" onClick={() => abrirGaleria(pieza.observaciones)}>
                                  <img src={pieza.observaciones.split(',')[0].trim()} alt="" className="w-12 h-12 object-cover rounded group-hover:opacity-80" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                                  {getCantidadMismoOem(pieza) > 1 && (
                                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium" title={`${getCantidadMismoOem(pieza)} piezas con OEM: ${pieza.oe}`}>
                                      {getCantidadMismoOem(pieza)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">Sin img</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900">{pieza.referencia}</td>
                            <td className="px-3 py-2 text-sm text-gray-600 text-center">{pieza.cantidad_solicitada}</td>
                            <td className="px-3 py-2 text-sm text-center"><span className="text-green-600 font-medium">{pieza.cantidad_stock}</span></td>
                            <td className="px-3 py-2 text-sm text-center">
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">{pieza.porcentaje_stock}%</span>
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600">{pieza.articulo || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{pieza.ubicacion || '-'}</td>
                            <td className="px-3 py-2 text-center text-xs text-gray-500">
                              {pieza.ultima_compra ? new Date(pieza.ultima_compra).toLocaleDateString('es-ES') : '-'}
                            </td>
                            <td className="px-3 py-2 text-center text-xs text-gray-500">
                              {pieza.ultima_venta ? new Date(pieza.ultima_venta).toLocaleDateString('es-ES') : '-'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {pieza.rotacion_dias !== null && pieza.rotacion_dias !== undefined ? (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  pieza.rotacion_dias <= 30 ? 'bg-green-100 text-green-800' :
                                  pieza.rotacion_dias <= 90 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {pieza.rotacion_dias}d
                                </span>
                              ) : '-'}
                              {pieza.ventas_totales ? (
                                <span className="ml-1 text-xs text-gray-400">({pieza.ventas_totales})</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => abrirEdicion(pieza)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Editar"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                                </button>
                                <button
                                  onClick={() => eliminarPieza(pieza.referencia)}
                                  disabled={guardando}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                  title="Eliminar"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Paginación */}
                  {piezasOk.length > ITEMS_POR_PAGINA && (
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPaginaStock(1)}
                          disabled={paginaStock === 1}
                          className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Primera
                        </button>
                        <button
                          onClick={() => setPaginaStock(p => Math.max(1, p - 1))}
                          disabled={paginaStock === 1}
                          className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                          Anterior
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Página</span>
                        <select
                          value={paginaStock}
                          onChange={(e) => setPaginaStock(parseInt(e.target.value))}
                          className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          {Array.from({ length: Math.ceil(piezasOk.length / ITEMS_POR_PAGINA) }, (_, i) => (
                            <option key={i + 1} value={i + 1}>{i + 1}</option>
                          ))}
                        </select>
                        <span className="text-sm text-gray-600">de {Math.ceil(piezasOk.length / ITEMS_POR_PAGINA)}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPaginaStock(p => Math.min(Math.ceil(piezasOk.length / ITEMS_POR_PAGINA), p + 1))}
                          disabled={paginaStock >= Math.ceil(piezasOk.length / ITEMS_POR_PAGINA)}
                          className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          Siguiente
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                        </button>
                        <button
                          onClick={() => setPaginaStock(Math.ceil(piezasOk.length / ITEMS_POR_PAGINA))}
                          disabled={paginaStock >= Math.ceil(piezasOk.length / ITEMS_POR_PAGINA)}
                          className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Última
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Estado vacío - sin archivo ni resultados */}
            {!archivoActual && !loading && resultados.length === 0 && (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-300 mb-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Sube un archivo CSV</h3>
                <p className="text-gray-500">Formato: OEM;Cantidad;OE;IAM;Precio;Observaciones;Imagen</p>
              </div>
            )}
          </>
        )}
          </>
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-gray-500">Selecciona una empresa para ver el control de stock</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Exportar componente envuelto con protección de módulo
export default function VerificarPiezasPage() {
  return (
    <ModuloProtegido modulo="piezas_nuevas">
      <VerificarPiezasContent />
    </ModuloProtegido>
  );
}