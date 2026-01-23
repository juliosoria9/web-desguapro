'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

interface BaseInfo {
  tiene_base: boolean;
  id?: number;
  nombre_archivo?: string;
  total_piezas?: number;
  columnas?: string[];
  mapeo_columnas?: Record<string, string>;
  subido_por?: string;
  fecha_subida?: string;
  fecha_actualizacion?: string;
}

interface Entorno {
  id: number;
  nombre: string;
}

interface CampoDisponible {
  id: string;
  nombre: string;
  descripcion: string;
}

interface AnalisisCSV {
  archivo: string;
  encoding: string;
  delimitador: string;
  columnas: string[];
  total_filas: number;
  muestra: Record<string, string>[];
  campos_disponibles: CampoDisponible[];
  mapeo_sugerido: Record<string, string>;
  campos_detectados: number;
}

// Pasos del wizard
type Paso = 'inicio' | 'mapeo' | 'subiendo';

export default function BaseDesguacePage() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [baseInfo, setBaseInfo] = useState<BaseInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Para sysowner
  const [empresas, setEmpresas] = useState<Entorno[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
  
  // Wizard de mapeo
  const [paso, setPaso] = useState<Paso>('inicio');
  const [analisis, setAnalisis] = useState<AnalisisCSV | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [analizando, setAnalizando] = useState(false);
  
  // Modo formato combinado OEM/OE/IAM
  const [modoCombinado, setModoCombinado] = useState(false);
  const [columnaCombinada, setColumnaCombinada] = useState<string>('');

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (mounted && user) {
      if (user.rol === 'sysowner') {
        fetchEmpresas();
      } else {
        fetchBaseInfo();
      }
    }
  }, [mounted, user]);

  useEffect(() => {
    if (user?.rol === 'sysowner' && selectedEmpresa) {
      fetchBaseInfo();
    }
  }, [selectedEmpresa]);

  const fetchEmpresas = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/entornos`,
        { withCredentials: true }
      );
      setEmpresas(response.data || []);
    } catch (error) {
      console.error('Error fetching empresas:', error);
    }
  };

  const fetchBaseInfo = async () => {
    try {
      setLoading(true);
      const params = selectedEmpresa ? `?entorno_id=${selectedEmpresa}` : '';
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/desguace/info${params}`,
        { withCredentials: true }
      );
      setBaseInfo(response.data);
    } catch (error) {
      console.error('Error fetching base info:', error);
      setBaseInfo({ tiene_base: false });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith('.csv')) {
        toast.error('Solo se permiten archivos CSV');
        return;
      }
      setSelectedFile(file);
      // Reset wizard
      setPaso('inicio');
      setAnalisis(null);
      setMapeo({});
    }
  };

  // Paso 1: Analizar CSV y obtener columnas
  const handleAnalizar = async () => {
    if (!selectedFile) {
      toast.error('Selecciona un archivo CSV');
      return;
    }

    if (user?.rol === 'sysowner' && !selectedEmpresa) {
      toast.error('Selecciona una empresa primero');
      return;
    }

    setAnalizando(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/desguace/analizar`,
        formData,
        {
          withCredentials: true,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      setAnalisis(response.data);
      
      // Usar el mapeo sugerido del backend (auto-detección)
      if (response.data.mapeo_sugerido) {
        setMapeo(response.data.mapeo_sugerido);
      } else {
        // Inicializar mapeo vacío si no hay sugerencias
        const mapeoInicial: Record<string, string> = {};
        response.data.campos_disponibles.forEach((campo: CampoDisponible) => {
          mapeoInicial[campo.id] = '';
        });
        setMapeo(mapeoInicial);
      }
      
      setPaso('mapeo');
      
      // Mostrar mensaje según detección
      const detectados = response.data.campos_detectados || 0;
      if (detectados > 0) {
        toast.success(`CSV analizado. Se detectaron ${detectados} campos automáticamente.`);
      } else {
        toast.success('CSV analizado. Asigna las columnas manualmente.');
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al analizar archivo');
    } finally {
      setAnalizando(false);
    }
  };

  // Actualizar mapeo
  const handleMapeoChange = (campoId: string, columnaCSV: string) => {
    setMapeo(prev => ({
      ...prev,
      [campoId]: columnaCSV
    }));
  };

  // Paso 2: Subir con mapeo
  const handleSubirConMapeo = async () => {
    if (!selectedFile || !analisis) {
      toast.error('Error: no hay archivo seleccionado');
      return;
    }

    // Verificar que al menos un campo esté mapeado O se use modo combinado
    const camposMapeados = Object.values(mapeo).filter(v => v !== '');
    const usaCombinado = modoCombinado && columnaCombinada;
    
    if (camposMapeados.length === 0 && !usaCombinado) {
      toast.error('Debes mapear al menos un campo o usar el formato combinado');
      return;
    }
    
    if (modoCombinado && !columnaCombinada) {
      toast.error('Selecciona la columna que contiene OEM/OE/IAM');
      return;
    }

    setPaso('subiendo');
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mapeo', JSON.stringify(mapeo));
      if (selectedEmpresa) {
        formData.append('entorno_id', selectedEmpresa.toString());
      }
      // Enviar info del modo combinado
      if (modoCombinado && columnaCombinada) {
        formData.append('formato_combinado', 'true');
        formData.append('columna_combinada', columnaCombinada);
      }

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/desguace/upload`,
        formData,
        {
          withCredentials: true,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const vendidas = response.data.piezas_vendidas || 0;
      const mensaje = vendidas > 0 
        ? `Base de datos cargada: ${response.data.piezas_insertadas} piezas, ${vendidas} marcadas como vendidas`
        : `Base de datos cargada: ${response.data.piezas_insertadas} piezas`;
      toast.success(mensaje);
      
      // Reset wizard
      setSelectedFile(null);
      setPaso('inicio');
      setAnalisis(null);
      setMapeo({});
      setModoCombinado(false);
      setColumnaCombinada('');
      
      // Limpiar input file
      const fileInput = document.getElementById('csv-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      await fetchBaseInfo();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al subir archivo');
      setPaso('mapeo');
    } finally {
      setUploading(false);
    }
  };

  const handleCancelarMapeo = () => {
    setPaso('inicio');
    setAnalisis(null);
    setMapeo({});
    setModoCombinado(false);
    setColumnaCombinada('');
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de eliminar la base de datos del desguace?\n\nEsta acción eliminará todas las piezas cargadas.')) {
      return;
    }

    try {
      const params = selectedEmpresa ? `?entorno_id=${selectedEmpresa}` : '';
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/desguace/eliminar${params}`,
        { withCredentials: true }
      );
      toast.success('Base de datos eliminada');
      setBaseInfo({ tiene_base: false });
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Error al eliminar');
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  // Solo admin, owner o sysowner
  if (!['sysowner', 'owner', 'admin'].includes(user.rol)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Acceso Denegado</h1>
          <p className="text-gray-600 mt-2">Solo administradores pueden gestionar la base de datos</p>
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

  const getEmpresaNombre = () => {
    const emp = empresas.find(e => e.id === selectedEmpresa);
    return emp ? emp.nombre : '';
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
                <h1 className="text-xl font-bold text-gray-900">DesguaPro</h1>
                <p className="text-xs text-gray-500">Base de Datos Desguace</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user.email}
                  {user.entorno_nombre && (
                    <span className="text-blue-600 ml-1">({user.entorno_nombre})</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {user.rol === 'sysowner' && 'Prop. Sistema'}
                  {user.rol === 'owner' && 'Propietario'}
                  {user.rol === 'admin' && 'Administrador'}
                </p>
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
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
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
        {(user.rol !== 'sysowner' || selectedEmpresa) && (
          <>
            {/* Estado actual de la base de datos */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  Base de Datos del Desguace
                  {user.rol === 'sysowner' && selectedEmpresa && (
                    <span className="text-blue-600 text-base font-normal ml-2">
                      - {getEmpresaNombre()}
                    </span>
                  )}
                </h2>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-500 text-sm">Cargando información...</p>
                </div>
              ) : baseInfo?.tiene_base ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-green-600">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                        <span className="text-green-800 font-semibold">Base de datos cargada</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">
                            <strong>Archivo:</strong> {baseInfo.nombre_archivo}
                          </p>
                          <p className="text-gray-600 mt-1">
                            <strong>Total piezas:</strong> {baseInfo.total_piezas?.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">
                            <strong>Subido por:</strong> {baseInfo.subido_por}
                          </p>
                          <p className="text-gray-600 mt-1">
                            <strong>Fecha:</strong> {baseInfo.fecha_subida ? formatDate(baseInfo.fecha_subida) : '-'}
                          </p>
                        </div>
                      </div>
                      
                      {baseInfo.mapeo_columnas && Object.keys(baseInfo.mapeo_columnas).length > 0 && (
                        <div className="mt-4">
                          <p className="text-gray-600 text-sm mb-2"><strong>Campos mapeados:</strong></p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(baseInfo.mapeo_columnas)
                              .filter(([_, v]) => v)
                              .map(([campo, columna], idx) => (
                                <span key={idx} className="px-2 py-1 bg-white border border-green-300 rounded text-xs text-green-700">
                                  {campo} → {columna}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <button
                      onClick={handleDelete}
                      className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors ml-4"
                      title="Eliminar base de datos"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-yellow-600 mx-auto mb-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <p className="text-yellow-800 font-semibold">No hay base de datos cargada</p>
                  <p className="text-yellow-700 text-sm mt-1">Sube un archivo CSV con las piezas del desguace</p>
                </div>
              )}
            </div>

            {/* Wizard de subida */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {baseInfo?.tiene_base ? 'Actualizar Base de Datos' : 'Subir Base de Datos'}
              </h2>
              
              {/* Paso 1: Seleccionar archivo */}
              {paso === 'inicio' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      1. Selecciona el archivo CSV
                    </label>
                    <input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    {selectedFile && (
                      <p className="text-sm text-green-600 mt-2">
                        ✓ Archivo seleccionado: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                  </div>

                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-800 mb-2">📋 Campos disponibles para mapear:</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-blue-700">
                      <span>• Ref ID</span>
                      <span>• OEM</span>
                      <span>• OE</span>
                      <span>• IAM</span>
                      <span>• Precio</span>
                      <span>• Ubicación</span>
                      <span>• Observaciones</span>
                      <span>• Artículo</span>
                      <span>• Marca</span>
                      <span>• Modelo</span>
                      <span>• Versión</span>
                      <span>• Imagen</span>
                    </div>
                    <p className="text-xs text-blue-600 mt-2">
                      En el siguiente paso podrás asignar cada columna de tu CSV a estos campos.
                    </p>
                  </div>

                  <button
                    onClick={handleAnalizar}
                    disabled={!selectedFile || analizando}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    {analizando ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Analizando CSV...
                      </span>
                    ) : (
                      '2. Analizar y Mapear Columnas →'
                    )}
                  </button>
                </div>
              )}

              {/* Paso 2: Mapeo de columnas */}
              {paso === 'mapeo' && analisis && (
                <div className="space-y-6">
                  {/* Info del archivo */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Archivo</p>
                        <p className="font-medium text-gray-900">{analisis.archivo}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Filas</p>
                        <p className="font-medium text-gray-900">{analisis.total_filas.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Columnas</p>
                        <p className="font-medium text-gray-900">{analisis.columnas.length}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Encoding</p>
                        <p className="font-medium text-gray-900">{analisis.encoding}</p>
                      </div>
                    </div>
                  </div>

                  {/* Toggle para formato combinado OEM/OE/IAM */}
                  <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🔗</span>
                          <h4 className="font-semibold text-orange-800">Formato combinado OEM/OE/IAM</h4>
                        </div>
                        <p className="text-sm text-orange-700 mt-1">
                          Activa esta opción si tu CSV tiene OEM, OE e IAM en una sola columna con formato: <code className="bg-orange-100 px-1 rounded">OEM/OE/IAM</code>
                        </p>
                        <p className="text-xs text-orange-600 mt-1">
                          Ejemplo: <code className="bg-orange-100 px-1 rounded">1K0959653C/1K0959653/TRICLO123,VALEO456</code>
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer ml-4">
                        <input
                          type="checkbox"
                          checked={modoCombinado}
                          onChange={(e) => {
                            setModoCombinado(e.target.checked);
                            if (!e.target.checked) {
                              setColumnaCombinada('');
                            }
                            // Si activamos modo combinado, limpiar mapeos de oem, oe, iam
                            if (e.target.checked) {
                              setMapeo(prev => ({
                                ...prev,
                                oem: '',
                                oe: '',
                                iam: ''
                              }));
                            }
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>
                    
                    {/* Selector de columna combinada */}
                    {modoCombinado && (
                      <div className="mt-4 pt-4 border-t border-orange-200">
                        <label className="block text-sm font-medium text-orange-800 mb-2">
                          Selecciona la columna que contiene OEM/OE/IAM:
                        </label>
                        <select
                          value={columnaCombinada}
                          onChange={(e) => setColumnaCombinada(e.target.value)}
                          className="w-full md:w-1/2 px-3 py-2 border-2 border-orange-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                        >
                          <option value="">-- Seleccionar columna --</option>
                          {analisis.columnas.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                        {columnaCombinada && (
                          <p className="text-xs text-green-600 mt-2">
                            ✓ Se separarán los valores por "/" y se asignarán a OEM, OE e IAM automáticamente
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Mapeo de campos */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Asigna las columnas del CSV a cada campo:
                    </h3>
                    <p className="text-sm text-gray-500 mb-2">
                      Selecciona qué columna de tu CSV corresponde a cada campo. Deja vacío los campos que no quieras mapear.
                    </p>
                    {modoCombinado && (
                      <p className="text-sm text-orange-600 mb-2">
                        ⚠️ Los campos OEM, OE e IAM están deshabilitados porque usarás el formato combinado.
                      </p>
                    )}
                    {analisis.campos_detectados > 0 && !modoCombinado && (
                      <p className="text-sm text-green-600 mb-4">
                        ✓ Se detectaron automáticamente {analisis.campos_detectados} campos. Puedes modificarlos si no son correctos.
                      </p>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {analisis.campos_disponibles.map((campo) => {
                        const valorActual = mapeo[campo.id] || '';
                        const esAutoDetectado = analisis.mapeo_sugerido && analisis.mapeo_sugerido[campo.id] === valorActual && valorActual !== '';
                        
                        // Deshabilitar OEM, OE, IAM si está en modo combinado
                        const esCampoCombinado = ['oem', 'oe', 'iam'].includes(campo.id);
                        const deshabilitado = modoCombinado && esCampoCombinado;
                        
                        return (
                          <div 
                            key={campo.id} 
                            className={`flex items-center gap-3 p-3 rounded-lg border-2 ${
                              deshabilitado
                                ? 'bg-orange-50 border-orange-200 opacity-60'
                                : valorActual 
                                  ? esAutoDetectado 
                                    ? 'bg-green-50 border-green-200' 
                                    : 'bg-blue-50 border-blue-200'
                                  : 'bg-gray-50 border-gray-100'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <label className="block text-sm font-medium text-gray-900">
                                {campo.nombre}
                                {deshabilitado && (
                                  <span className="ml-2 text-xs text-orange-600 font-normal">🔗 Combinado</span>
                                )}
                                {!deshabilitado && esAutoDetectado && (
                                  <span className="ml-2 text-xs text-green-600 font-normal">✓ Auto</span>
                                )}
                              </label>
                              <p className="text-xs text-gray-500 truncate">{campo.descripcion}</p>
                            </div>
                            <select
                              value={deshabilitado ? '' : valorActual}
                              onChange={(e) => handleMapeoChange(campo.id, e.target.value)}
                              disabled={deshabilitado}
                              className={`w-48 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                                deshabilitado 
                                  ? 'border-orange-300 bg-orange-100 cursor-not-allowed'
                                  : valorActual ? 'border-green-400 bg-white' : 'border-gray-300'
                              }`}
                            >
                              <option value="">{deshabilitado ? '(formato combinado)' : '-- No mapear --'}</option>
                              {analisis.columnas.map((col) => (
                                <option key={col} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Muestra de datos */}
                  {analisis.muestra.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        Vista previa de datos:
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs border border-gray-200 rounded-lg">
                          <thead className="bg-gray-100">
                            <tr>
                              {analisis.columnas.map((col) => (
                                <th key={col} className="px-3 py-2 text-left text-gray-700 font-semibold border-b">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {analisis.muestra.map((fila, idx) => (
                              <tr key={idx} className="border-b hover:bg-gray-50">
                                {analisis.columnas.map((col) => (
                                  <td key={col} className="px-3 py-2 text-gray-600 max-w-xs truncate">
                                    {fila[col] || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Botones */}
                  <div className="flex gap-4">
                    <button
                      onClick={handleCancelarMapeo}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 rounded-lg transition-colors"
                    >
                      ← Volver
                    </button>
                    <button
                      onClick={handleSubirConMapeo}
                      disabled={uploading || Object.values(mapeo).filter(v => v !== '').length === 0}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors"
                    >
                      Subir Base de Datos ✓
                    </button>
                  </div>

                  {baseInfo?.tiene_base && (
                    <p className="text-xs text-orange-600 text-center">
                      ⚠️ Subir este archivo reemplazará completamente la base de datos actual
                    </p>
                  )}
                </div>
              )}

              {/* Paso 3: Subiendo */}
              {paso === 'subiendo' && (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-lg font-semibold text-gray-900">Subiendo base de datos...</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Procesando {analisis?.total_filas.toLocaleString()} piezas. Esto puede tardar unos segundos.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
