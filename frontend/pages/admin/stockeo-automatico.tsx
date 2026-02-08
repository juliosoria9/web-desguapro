'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Entorno {
  id: number;
  nombre: string;
}

interface CampoBD {
  key: string;
  label: string;
  required: boolean;
  descripcion?: string;
}

interface ConfiguracionStockeo {
  id: number;
  entorno_trabajo_id: number;
  entorno_nombre: string | null;
  ruta_csv: string | null;
  encoding: string;
  delimitador: string;
  mapeo_columnas: Record<string, string> | null;
  intervalo_minutos: number;
  activo: boolean;
  ultima_ejecucion: string | null;
  ultimo_resultado: string | null;
  piezas_importadas: number;
  ventas_detectadas: number;
}

interface CSVHeaders {
  headers: string[];
  preview: Record<string, string>[];
  total_filas: number;
  archivo_existe: boolean;
  error: string | null;
}

const ENCODINGS = [
  { value: 'utf-8-sig', label: 'UTF-8 (con BOM)' },
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'latin-1', label: 'Latin-1 (ISO-8859-1)' },
  { value: 'cp1252', label: 'Windows-1252' },
];

const DELIMITADORES = [
  { value: ';', label: 'Punto y coma (;)' },
  { value: ',', label: 'Coma (,)' },
  { value: '\t', label: 'Tabulador' },
  { value: '|', label: 'Pipe (|)' },
];

const INTERVALOS = [
  { value: 15, label: 'Cada 15 minutos' },
  { value: 30, label: 'Cada 30 minutos' },
  { value: 60, label: 'Cada hora' },
  { value: 120, label: 'Cada 2 horas' },
  { value: 360, label: 'Cada 6 horas' },
  { value: 720, label: 'Cada 12 horas' },
  { value: 1440, label: 'Una vez al día' },
];

export default function StockeoAutomaticoPage() {
  const router = useRouter();
  const { user, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  
  // Estados principales
  const [empresas, setEmpresas] = useState<Entorno[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<number | null>(null);
  const [config, setConfig] = useState<ConfiguracionStockeo | null>(null);
  const [camposBD, setCamposBD] = useState<CampoBD[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<CSVHeaders | null>(null);
  
  // Estados de formulario
  const [rutaCsv, setRutaCsv] = useState('');
  const [encoding, setEncoding] = useState('utf-8-sig');
  const [delimitador, setDelimitador] = useState(';');
  const [intervalo, setIntervalo] = useState(30);
  const [activo, setActivo] = useState(false);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  
  // Estados de carga
  const [loading, setLoading] = useState(false);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);

  // Cargar auth
  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  // Verificar permisos
  useEffect(() => {
    if (mounted && (!user || user.rol !== 'sysowner')) {
      router.push('/dashboard');
    }
  }, [mounted, user, router]);

  // Cargar empresas y campos BD
  const cargarDatosIniciales = useCallback(async () => {
    try {
      const [empresasRes, camposRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/auth/entornos`, { withCredentials: true }),
        axios.get(`${API_URL}/api/v1/stockeo/campos-disponibles`, { withCredentials: true })
      ]);
      
      setEmpresas(empresasRes.data);
      setCamposBD(camposRes.data);
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
      toast.error('Error cargando datos');
    }
  }, []);

  useEffect(() => {
    if (mounted && user?.rol === 'sysowner') {
      cargarDatosIniciales();
    }
  }, [mounted, user, cargarDatosIniciales]);

  // Cargar configuración cuando se selecciona empresa
  const cargarConfiguracion = useCallback(async (entornoId: number) => {
    setLoading(true);
    setCsvHeaders(null);
    
    try {
      const res = await axios.get(`${API_URL}/api/v1/stockeo/configuracion/${entornoId}`, {
        withCredentials: true
      });
      
      const data = res.data;
      setConfig(data);
      setRutaCsv(data.ruta_csv || '');
      setEncoding(data.encoding || 'utf-8-sig');
      setDelimitador(data.delimitador || ';');
      setIntervalo(data.intervalo_minutos || 30);
      setActivo(data.activo || false);
      setMapeo(data.mapeo_columnas || {});
      
      // Si hay ruta, cargar headers automáticamente
      if (data.ruta_csv) {
        await leerHeadersCSV(data.ruta_csv, data.encoding, data.delimitador);
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      toast.error('Error cargando configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEmpresa) {
      cargarConfiguracion(selectedEmpresa);
    }
  }, [selectedEmpresa, cargarConfiguracion]);

  // Leer headers del CSV
  const leerHeadersCSV = async (ruta?: string, enc?: string, delim?: string) => {
    const rutaFinal = ruta || rutaCsv;
    const encFinal = enc || encoding;
    const delimFinal = delim || delimitador;
    
    if (!rutaFinal) {
      toast.error('Introduce una ruta de archivo');
      return;
    }
    
    setLoadingHeaders(true);
    
    try {
      const params = new URLSearchParams({
        ruta_csv: rutaFinal,
        encoding: encFinal,
        delimitador: delimFinal
      });
      
      const res = await axios.post(
        `${API_URL}/api/v1/stockeo/leer-csv-headers?${params}`,
        {},
        { withCredentials: true }
      );
      
      setCsvHeaders(res.data);
      
      if (res.data.error) {
        toast.error(res.data.error);
      } else if (res.data.headers.length > 0) {
        toast.success(`CSV cargado: ${res.data.total_filas} filas, ${res.data.headers.length} columnas`);
      }
    } catch (error: any) {
      console.error('Error leyendo CSV:', error);
      toast.error(error.response?.data?.detail || 'Error leyendo archivo CSV');
    } finally {
      setLoadingHeaders(false);
    }
  };

  // Guardar configuración
  const guardarConfiguracion = async () => {
    if (!selectedEmpresa) return;
    
    // Validar que refid esté mapeado
    if (!mapeo.refid) {
      toast.error('Debes mapear al menos el campo "ID Referencia" (refid)');
      return;
    }
    
    setSaving(true);
    
    try {
      await axios.post(
        `${API_URL}/api/v1/stockeo/configuracion`,
        {
          entorno_trabajo_id: selectedEmpresa,
          ruta_csv: rutaCsv || null,
          encoding,
          delimitador,
          mapeo_columnas: Object.keys(mapeo).length > 0 ? mapeo : null,
          intervalo_minutos: intervalo,
          activo
        },
        { withCredentials: true }
      );
      
      toast.success('Configuración guardada correctamente');
      
      // Recargar configuración
      await cargarConfiguracion(selectedEmpresa);
    } catch (error: any) {
      console.error('Error guardando:', error);
      toast.error(error.response?.data?.detail || 'Error guardando configuración');
    } finally {
      setSaving(false);
    }
  };

  // Ejecutar importación ahora
  const ejecutarAhora = async () => {
    if (!selectedEmpresa) return;
    
    setEjecutando(true);
    
    try {
      const res = await axios.post(
        `${API_URL}/api/v1/stockeo/ejecutar-ahora/${selectedEmpresa}`,
        {},
        { withCredentials: true }
      );
      
      toast.success(res.data.mensaje || 'Importación iniciada');
    } catch (error: any) {
      console.error('Error ejecutando:', error);
      toast.error(error.response?.data?.detail || 'Error ejecutando importación');
    } finally {
      setEjecutando(false);
    }
  };

  // Actualizar mapeo
  const actualizarMapeo = (campoBD: string, columnaCSV: string) => {
    setMapeo(prev => {
      const nuevo = { ...prev };
      if (columnaCSV === '') {
        delete nuevo[campoBD];
      } else {
        nuevo[campoBD] = columnaCSV;
      }
      return nuevo;
    });
  };

  if (!mounted || !user || user.rol !== 'sysowner') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-600 hover:text-gray-900"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Stockeo Automático</h1>
              <p className="text-sm text-gray-500">Configuración de importación CSV por empresa</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Selector de empresa */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Seleccionar Empresa
          </label>
          <select
            value={selectedEmpresa || ''}
            onChange={(e) => setSelectedEmpresa(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full md:w-96 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">-- Selecciona una empresa --</option>
            {empresas.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.nombre}</option>
            ))}
          </select>
        </div>

        {/* Configuración */}
        {selectedEmpresa && (
          <>
            {loading ? (
              <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-gray-500 mt-4">Cargando configuración...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Estado actual */}
                {config && config.id > 0 && (
                  <div className={`rounded-xl shadow-sm p-6 ${config.activo ? 'bg-green-50 border-2 border-green-200' : 'bg-gray-50 border-2 border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${config.activo ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                        <span className={`font-medium ${config.activo ? 'text-green-700' : 'text-gray-600'}`}>
                          {config.activo ? 'Importación Activa' : 'Importación Desactivada'}
                        </span>
                      </div>
                      {config.ultima_ejecucion && (
                        <div className="text-sm text-gray-500">
                          Última ejecución: {new Date(config.ultima_ejecucion).toLocaleString('es-ES')}
                        </div>
                      )}
                    </div>
                    {config.ultimo_resultado && (
                      <p className="mt-2 text-sm text-gray-600">{config.ultimo_resultado}</p>
                    )}
                    <div className="mt-3 flex gap-6 text-sm">
                      <span className="text-gray-600">
                        📦 Piezas importadas: <strong>{config.piezas_importadas.toLocaleString()}</strong>
                      </span>
                      <span className="text-gray-600">
                        💰 Ventas detectadas: <strong>{config.ventas_detectadas.toLocaleString()}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {/* Configuración de archivo */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    Configuración del Archivo CSV
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ruta del archivo CSV
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={rutaCsv}
                          onChange={(e) => setRutaCsv(e.target.value)}
                          placeholder="/var/uploads/csv/stock.csv"
                          className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        />
                        <button
                          onClick={() => leerHeadersCSV()}
                          disabled={loadingHeaders || !rutaCsv}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {loadingHeaders ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                            </svg>
                          )}
                          Analizar
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Ruta absoluta al archivo CSV en el servidor
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Encoding
                      </label>
                      <select
                        value={encoding}
                        onChange={(e) => setEncoding(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {ENCODINGS.map(enc => (
                          <option key={enc.value} value={enc.value}>{enc.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Delimitador
                      </label>
                      <select
                        value={delimitador}
                        onChange={(e) => setDelimitador(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {DELIMITADORES.map(del => (
                          <option key={del.value} value={del.value}>{del.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Resultado del análisis CSV */}
                {csvHeaders && (
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
                      </svg>
                      Mapeo de Columnas
                      {csvHeaders.archivo_existe && !csvHeaders.error && (
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          ({csvHeaders.total_filas.toLocaleString()} filas)
                        </span>
                      )}
                    </h2>
                    
                    {csvHeaders.error ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                        <p className="font-medium">Error leyendo archivo:</p>
                        <p className="text-sm mt-1">{csvHeaders.error}</p>
                      </div>
                    ) : csvHeaders.headers.length > 0 ? (
                      <>
                        {/* Tabla de mapeo */}
                        <div className="overflow-x-auto mb-6">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="text-left p-3 font-medium text-gray-700">Campo en BD</th>
                                <th className="text-left p-3 font-medium text-gray-700">Columna del CSV</th>
                                <th className="text-left p-3 font-medium text-gray-700">Requerido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {camposBD.map((campo) => (
                                <tr key={campo.key} className={`border-t hover:bg-gray-50 ${campo.key === 'oem_oe_iam' ? 'bg-blue-50' : ''}`}>
                                  <td className="p-3">
                                    <span className={campo.required ? 'font-medium text-gray-900' : 'text-gray-600'}>
                                      {campo.label}
                                    </span>
                                    <span className="text-xs text-gray-400 ml-2">({campo.key})</span>
                                    {campo.descripcion && (
                                      <p className="text-xs text-blue-600 mt-1">{campo.descripcion}</p>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    <select
                                      value={mapeo[campo.key] || ''}
                                      onChange={(e) => actualizarMapeo(campo.key, e.target.value)}
                                      className={`w-full p-2 border rounded-lg text-sm ${
                                        campo.required && !mapeo[campo.key] 
                                          ? 'border-red-300 bg-red-50' 
                                          : campo.key === 'oem_oe_iam' && mapeo[campo.key]
                                            ? 'border-blue-300 bg-blue-50'
                                            : 'border-gray-300'
                                      }`}
                                    >
                                      <option value="">-- No mapear --</option>
                                      {csvHeaders.headers.map((header) => (
                                        <option key={header} value={header}>{header}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-3">
                                    {campo.required ? (
                                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                        Requerido
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 text-xs">Opcional</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        {/* Preview de datos */}
                        {csvHeaders.preview.length > 0 && (
                          <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-2">Vista previa de datos:</h3>
                            <div className="overflow-x-auto border rounded-lg">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-100">
                                    {csvHeaders.headers.slice(0, 8).map((header) => (
                                      <th key={header} className="text-left p-2 font-medium text-gray-600 whitespace-nowrap">
                                        {header}
                                      </th>
                                    ))}
                                    {csvHeaders.headers.length > 8 && (
                                      <th className="text-left p-2 font-medium text-gray-400">...</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {csvHeaders.preview.map((row, idx) => (
                                    <tr key={idx} className="border-t">
                                      {csvHeaders.headers.slice(0, 8).map((header) => (
                                        <td key={header} className="p-2 text-gray-600 whitespace-nowrap max-w-[150px] truncate">
                                          {row[header] || '-'}
                                        </td>
                                      ))}
                                      {csvHeaders.headers.length > 8 && (
                                        <td className="p-2 text-gray-400">...</td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-500">No se encontraron columnas en el archivo</p>
                    )}
                  </div>
                )}

                {/* Configuración de tiempo */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    Programación
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Frecuencia de importación
                      </label>
                      <select
                        value={intervalo}
                        onChange={(e) => setIntervalo(parseInt(e.target.value))}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {INTERVALOS.map(int => (
                          <option key={int.value} value={int.value}>{int.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex items-end">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={activo}
                            onChange={(e) => setActivo(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-14 h-7 rounded-full transition-colors ${activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${activo ? 'left-7' : 'left-0.5'}`}></div>
                          </div>
                        </div>
                        <span className={`font-medium ${activo ? 'text-green-700' : 'text-gray-600'}`}>
                          {activo ? 'Importación activa' : 'Importación desactivada'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="flex flex-wrap gap-4 justify-end">
                  <button
                    onClick={ejecutarAhora}
                    disabled={ejecutando || !rutaCsv || !mapeo.refid}
                    className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {ejecutando ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                      </svg>
                    )}
                    Ejecutar Ahora
                  </button>
                  
                  <button
                    onClick={guardarConfiguracion}
                    disabled={saving}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                    Guardar Configuración
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Sin empresa seleccionada */}
        {!selectedEmpresa && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-300 mb-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Selecciona una empresa</h3>
            <p className="text-gray-500">Elige una empresa del selector superior para configurar su importación automática de stock</p>
          </div>
        )}
      </main>
    </div>
  );
}
