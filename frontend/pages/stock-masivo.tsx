'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import axios from 'axios';
import toast from 'react-hot-toast';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface ColumnMapping {
  id: string;
  oem: string;
  oe: string;
  tipo_pieza: string;
  precio: string;
}

interface CheckResult {
  ref_id: string;
  ref_oem: string;
  tipo_pieza: string;
  precio_actual: number;
  precio_mercado: number;
  precio_sugerido: number | null;
  diferencia_porcentaje: number;
  precios_encontrados: number;
  es_outlier: boolean;
  familia: string;
}

interface CheckResponse {
  total_items: number;
  items_procesados: number;
  items_con_outliers: number;
  resultados: CheckResult[];
  tiempo_procesamiento: number;
}

type ProcessingStatus = 'idle' | 'uploading' | 'mapping' | 'processing' | 'completed' | 'error';

export default function StockMasivoPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  
  // Estados del flujo
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [delimiter, setDelimiter] = useState<string>(';');
  
  // Mapeo de columnas
  const [mapping, setMapping] = useState<ColumnMapping>({
    id: '',
    oem: '',
    oe: '',
    tipo_pieza: '',
    precio: '',
  });
  
  // Opciones de procesamiento
  const [umbral, setUmbral] = useState(20);
  const [workers, setWorkers] = useState(5);
  const [delay, setDelay] = useState(0.5);
  
  // Resultados
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  // Control de procesamiento
  const [shouldStop, setShouldStop] = useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  
  // Filtros
  const [ignorarBaratas, setIgnorarBaratas] = useState(false); // Ignorar piezas más baratas que precio mercado
  const [tiposExcluidos, setTiposExcluidos] = useState<string[]>([]); // Tipos de piezas a excluir
  const [tiposDisponibles, setTiposDisponibles] = useState<string[]>([]); // Tipos únicos en el CSV
  const [searchTipo, setSearchTipo] = useState(''); // Búsqueda de tipos
  const [showSuggestions, setShowSuggestions] = useState(false); // Mostrar sugerencias
  
  // Archivos de configuración de precios
  const [familiaPreciosFile, setFamiliaPreciosFile] = useState<File | null>(null);
  const [piezaFamiliaFile, setPiezaFamiliaFile] = useState<File | null>(null);
  const [configUploaded, setConfigUploaded] = useState(false);
  
  // CSV de exclusión por ID
  const [exclusionFile, setExclusionFile] = useState<File | null>(null);
  const [exclusionHeaders, setExclusionHeaders] = useState<string[]>([]);
  const [exclusionData, setExclusionData] = useState<string[][]>([]);
  const [exclusionIdColumn, setExclusionIdColumn] = useState<string>('');
  const [idsToExclude, setIdsToExclude] = useState<Set<string>>(new Set());
  
  // Consola de logs
  const [logs, setLogs] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const consoleRef = React.useRef<HTMLDivElement>(null);
  
  // Función para añadir log
  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefixes: Record<string, string> = { 
      info: '[INFO]', 
      success: '[OK]', 
      error: '[ERROR]', 
      warning: '[WARN]' 
    };
    const logMessage = `[${timestamp}] ${prefixes[type]} ${message}`;
    setLogs(prev => [...prev, logMessage]);
    
    // Auto-scroll al final
    setTimeout(() => {
      if (consoleRef.current) {
        consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
      }
    }, 10);
  };
  
  // Limpiar consola
  const clearLogs = () => setLogs([]);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  // Detectar delimitador automáticamente
  const detectDelimiter = (text: string): string => {
    const firstLine = text.split('\n')[0];
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    
    if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
    if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
    return ',';
  };

  // Parsear CSV
  const parseCSV = (text: string, delim: string): string[][] => {
    // Limpiar BOM si existe
    let cleanText = text;
    if (cleanText.charCodeAt(0) === 0xFEFF) {
      cleanText = cleanText.slice(1);
    }
    
    const lines = cleanText.trim().split('\n');
    return lines.map(line => {
      // Limpiar retorno de carro si existe
      line = line.replace(/\r$/, '');
      
      // Manejo básico de campos con comillas
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delim && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  };

  // Manejar subida de archivo
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    
    const uploadedFile = e.target.files[0];
    setFile(uploadedFile);
    setStatus('uploading');
    
    try {
      const text = await uploadedFile.text();
      const detectedDelimiter = detectDelimiter(text);
      setDelimiter(detectedDelimiter);
      
      const parsed = parseCSV(text, detectedDelimiter);
      if (parsed.length < 2) {
        toast.error('El archivo debe tener al menos una fila de datos');
        setStatus('idle');
        return;
      }
      
      setCsvHeaders(parsed[0]);
      setCsvData(parsed.slice(1));
      setStatus('mapping');
      
      // Intentar auto-mapeo
      autoMapColumns(parsed[0]);
      
      // Extraer tipos únicos de piezas para el filtro
      extractUniqueTipos(parsed[0], parsed.slice(1));
      
      toast.success(`Archivo cargado: ${parsed.length - 1} filas detectadas`);
    } catch (error) {
      console.error('Error al leer archivo:', error);
      toast.error('Error al leer el archivo CSV');
      setStatus('error');
    }
  };

  // Auto-mapeo de columnas basado en nombres comunes
  const autoMapColumns = (headers: string[]) => {
    const lowerHeaders = headers.map(h => h.toLowerCase().replace(/[.\s]/g, '_'));
    
    const newMapping: ColumnMapping = {
      id: '',
      oem: '',
      oe: '',
      tipo_pieza: '',
      precio: '',
    };
    
    // Buscar ID
    const idPatterns = ['ref_id', 'ref.id', 'id', 'codigo', 'code'];
    for (const pattern of idPatterns) {
      const idx = lowerHeaders.findIndex(h => h.includes(pattern.replace('.', '_')));
      if (idx !== -1) {
        newMapping.id = headers[idx];
        break;
      }
    }
    
    // Buscar OEM
    const oemPatterns = ['ref_oem', 'ref.oem', 'oem', 'referencia', 'reference'];
    for (const pattern of oemPatterns) {
      const idx = lowerHeaders.findIndex(h => h.includes(pattern.replace('.', '_')));
      if (idx !== -1) {
        newMapping.oem = headers[idx];
        break;
      }
    }
    
    // Buscar OE
    const oePatterns = ['ref_oe', 'ref.oe', 'oe', 'original'];
    for (const pattern of oePatterns) {
      const idx = lowerHeaders.findIndex(h => h.includes(pattern.replace('.', '_')));
      if (idx !== -1) {
        newMapping.oe = headers[idx];
        break;
      }
    }
    
    // Buscar tipo de pieza
    const tipoPiezaPatterns = ['articulo', 'tipo_pieza', 'tipo', 'pieza', 'categoria', 'category', 'part_type'];
    for (const pattern of tipoPiezaPatterns) {
      const idx = lowerHeaders.findIndex(h => h.includes(pattern));
      if (idx !== -1) {
        newMapping.tipo_pieza = headers[idx];
        break;
      }
    }
    
    // Buscar precio
    const precioPatterns = ['precio', 'price', 'pvp', 'importe', 'coste'];
    for (const pattern of precioPatterns) {
      const idx = lowerHeaders.findIndex(h => h.includes(pattern));
      if (idx !== -1) {
        newMapping.precio = headers[idx];
        break;
      }
    }
    
    setMapping(newMapping);
  };

  // Extraer tipos únicos de piezas del CSV
  const extractUniqueTipos = (headers: string[], data: string[][]) => {
    // Buscar columna de tipo de pieza
    const lowerHeaders = headers.map(h => h.toLowerCase().replace(/[.\s]/g, '_'));
    const tipoPiezaPatterns = ['articulo', 'tipo_pieza', 'tipo', 'pieza', 'categoria', 'category', 'part_type'];
    
    let tipoPiezaIdx = -1;
    for (const pattern of tipoPiezaPatterns) {
      const idx = lowerHeaders.findIndex(h => h.includes(pattern));
      if (idx !== -1) {
        tipoPiezaIdx = idx;
        break;
      }
    }
    
    if (tipoPiezaIdx !== -1) {
      const tipos = new Set<string>();
      data.forEach(row => {
        const tipo = row[tipoPiezaIdx]?.trim().toUpperCase();
        if (tipo) tipos.add(tipo);
      });
      setTiposDisponibles(Array.from(tipos).sort());
    }
  };

  // Toggle tipo excluido
  const toggleTipoExcluido = (tipo: string) => {
    setTiposExcluidos(prev => 
      prev.includes(tipo) 
        ? prev.filter(t => t !== tipo) 
        : [...prev, tipo]
    );
  };

  // Manejar archivo de exclusión
  const handleExclusionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    
    const uploadedFile = e.target.files[0];
    setExclusionFile(uploadedFile);
    
    try {
      const text = await uploadedFile.text();
      const detectedDelim = detectDelimiter(text);
      const parsed = parseCSV(text, detectedDelim);
      
      if (parsed.length < 2) {
        toast.error('El archivo de exclusión debe tener al menos una fila de datos');
        setExclusionFile(null);
        return;
      }
      
      setExclusionHeaders(parsed[0]);
      setExclusionData(parsed.slice(1));
      setExclusionIdColumn(''); // Reset columna seleccionada
      setIdsToExclude(new Set());
      
      toast.success(`Archivo de exclusión cargado: ${parsed.length - 1} filas`);
    } catch (error) {
      console.error('Error al leer archivo de exclusión:', error);
      toast.error('Error al leer el archivo de exclusión');
      setExclusionFile(null);
    }
  };

  // Actualizar IDs a excluir cuando se selecciona columna
  const handleExclusionColumnChange = (column: string) => {
    setExclusionIdColumn(column);
    
    if (column && exclusionData.length > 0) {
      const idx = exclusionHeaders.indexOf(column);
      if (idx !== -1) {
        const ids = new Set<string>();
        exclusionData.forEach(row => {
          const id = row[idx]?.trim();
          if (id) ids.add(id);
        });
        setIdsToExclude(ids);
        toast.success(`${ids.size} IDs marcados para excluir`);
      }
    } else {
      setIdsToExclude(new Set());
    }
  };

  // Limpiar archivo de exclusión
  const clearExclusionFile = () => {
    setExclusionFile(null);
    setExclusionHeaders([]);
    setExclusionData([]);
    setExclusionIdColumn('');
    setIdsToExclude(new Set());
  };

  // Manejar cambio de mapeo
  const handleMappingChange = (field: keyof ColumnMapping, value: string) => {
    setMapping(prev => ({ ...prev, [field]: value }));
    
    // Si se cambia el tipo de pieza, actualizar tipos disponibles
    if (field === 'tipo_pieza' && value) {
      const idx = csvHeaders.indexOf(value);
      if (idx !== -1) {
        const tipos = new Set<string>();
        csvData.forEach(row => {
          const tipo = row[idx]?.trim().toUpperCase();
          if (tipo) tipos.add(tipo);
        });
        setTiposDisponibles(Array.from(tipos).sort());
      }
    }
  };

  // Validar mapeo
  const isMappingValid = () => {
    return mapping.id && mapping.oem && mapping.tipo_pieza && mapping.precio;
  };

  // Iniciar procesamiento
  const handleStartProcessing = async () => {
    if (!isMappingValid()) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }
    
    setStatus('processing');
    setIsProcessing(true);
    setShouldStop(false);
    clearLogs();
    
    // Crear AbortController para cancelación
    abortControllerRef.current = new AbortController();
    
    addLog('Iniciando verificación de stock...', 'info');
    addLog(`Configuración: Umbral ${umbral}%, Workers ${workers}, Delay ${delay}s`, 'info');
    if (ignorarBaratas) addLog('Filtro activo: Ignorar piezas más baratas que precio mercado', 'info');
    if (tiposExcluidos.length > 0) addLog(`Tipos excluidos: ${tiposExcluidos.join(', ')}`, 'info');
    if (idsToExclude.size > 0) addLog(`IDs a excluir del CSV secundario: ${idsToExclude.size}`, 'info');
    
    try {
      // Preparar items con el mapeo
      const headerIndexes = {
        id: csvHeaders.indexOf(mapping.id),
        oem: csvHeaders.indexOf(mapping.oem),
        oe: csvHeaders.indexOf(mapping.oe),
        tipo_pieza: csvHeaders.indexOf(mapping.tipo_pieza),
        precio: csvHeaders.indexOf(mapping.precio),
      };
      
      const items = csvData.map(row => {
        // Parsear precio (puede tener formato europeo con coma)
        let precio = 0;
        if (headerIndexes.precio !== -1) {
          const precioStr = row[headerIndexes.precio] || '0';
          precio = parseFloat(precioStr.replace(',', '.').replace(/[^\d.-]/g, ''));
        }
        
        return {
          ref_id: headerIndexes.id !== -1 ? row[headerIndexes.id] : '',
          ref_oem: headerIndexes.oem !== -1 ? row[headerIndexes.oem] : '',
          ref_oe: headerIndexes.oe !== -1 ? row[headerIndexes.oe] : '',
          tipo_pieza: headerIndexes.tipo_pieza !== -1 ? row[headerIndexes.tipo_pieza]?.trim().toUpperCase() : '',
          precio: precio,
        };
      }).filter(item => {
        // Filtrar items sin OEM o precio
        if (!item.ref_oem || item.precio <= 0) return false;
        // Filtrar tipos excluidos
        if (tiposExcluidos.includes(item.tipo_pieza)) return false;
        // Filtrar IDs del CSV de exclusión
        if (idsToExclude.size > 0 && idsToExclude.has(item.ref_id)) return false;
        return true;
      });
      
      if (items.length === 0) {
        addLog('No hay items válidos para procesar', 'error');
        toast.error('No hay items válidos para procesar');
        setStatus('mapping');
        setIsProcessing(false);
        return;
      }
      
      const itemsExcluidos = csvData.length - items.length;
      if (itemsExcluidos > 0) {
        addLog(`Items excluidos por filtros: ${itemsExcluidos}`, 'info');
      }
      addLog(`Total items a procesar: ${items.length}`, 'info');
      setProgress({ current: 0, total: items.length });
      
      // Procesamiento paralelo independiente
      const allResults: CheckResult[] = [];
      let itemsConOutliers = 0;
      let processed = 0;
      const startTime = Date.now();
      
      // Función para procesar un item individual
      const processItem = async (item: typeof items[0]): Promise<CheckResult | null> => {
        try {
          const response = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/stock/verificar-masivo`,
            {
              items: [item],
              umbral_diferencia: umbral,
              workers: 1,
              delay: 0,
            },
            {
              withCredentials: true,
              timeout: 60000,
              signal: abortControllerRef.current?.signal,
            }
          );
          
          if (response.data.resultados && response.data.resultados.length > 0) {
            return response.data.resultados[0];
          }
          return null;
        } catch (error: any) {
          if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
            throw error; // Re-throw para que se maneje arriba
          }
          return null;
        }
      };
      
      // Procesar con workers paralelos independientes
      const queue = [...items];
      const activePromises: Promise<void>[] = [];
      
      const worker = async () => {
        while (queue.length > 0 && !shouldStop && !abortControllerRef.current?.signal.aborted) {
          const item = queue.shift();
          if (!item) break;
          
          try {
            const result = await processItem(item);
            processed++;
            setProgress({ current: processed, total: items.length });
            
            if (result) {
              // Filtrar si es más barata y está activo el filtro
              if (ignorarBaratas && result.diferencia_porcentaje < 0) {
                addLog(
                  `${result.ref_oem} | ${result.tipo_pieza} | IGNORADA (más barata)`,
                  'info'
                );
              } else {
                allResults.push(result);
                if (result.es_outlier) itemsConOutliers++;
                
                const diffSign = result.diferencia_porcentaje > 0 ? '+' : '';
                const status = result.es_outlier ? 'OUTLIER' : 'OK';
                addLog(
                  `${result.ref_oem} | ${result.tipo_pieza} | ${result.precio_actual.toFixed(2)}€ → ${result.precio_mercado.toFixed(2)}€ | ${diffSign}${result.diferencia_porcentaje.toFixed(1)}% | ${status}`,
                  result.es_outlier ? 'warning' : 'success'
                );
              }
            } else {
              addLog(`${item.ref_oem} | Sin datos de mercado`, 'info');
            }
            
            // Delay entre peticiones del mismo worker
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
            
          } catch (error: any) {
            if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
              break;
            }
            addLog(`Error: ${item.ref_oem} - ${error.message}`, 'error');
          }
        }
      };
      
      // Iniciar workers
      for (let i = 0; i < workers; i++) {
        activePromises.push(worker());
      }
      
      // Esperar a que terminen todos los workers
      await Promise.all(activePromises);
      
      const elapsedTime = (Date.now() - startTime) / 1000;
      const wasStopped = shouldStop || abortControllerRef.current?.signal.aborted;
      
      addLog('─'.repeat(50), 'info');
      if (wasStopped) {
        addLog(`DETENIDO por el usuario en ${elapsedTime.toFixed(1)}s`, 'warning');
      } else {
        addLog(`Verificación completada en ${elapsedTime.toFixed(1)}s`, 'success');
      }
      addLog(`Total procesados: ${allResults.length}/${items.length}`, 'info');
      addLog(`Outliers encontrados: ${itemsConOutliers}`, itemsConOutliers > 0 ? 'warning' : 'info');
      
      setResult({
        total_items: items.length,
        items_procesados: allResults.length,
        items_con_outliers: itemsConOutliers,
        resultados: allResults,
        tiempo_procesamiento: elapsedTime,
      });
      setStatus('completed');
      setIsProcessing(false);
      toast.success(wasStopped ? 'Proceso detenido - Resultados parciales' : 'Verificación completada');
      
    } catch (error: any) {
      console.error('Error en verificación:', error);
      addLog(`Error: ${error.response?.data?.detail || error.message}`, 'error');
      toast.error(error.response?.data?.detail || 'Error al verificar stock');
      setStatus('error');
      setIsProcessing(false);
    }
  };

  // Detener procesamiento
  const handleStopProcessing = () => {
    setShouldStop(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    addLog('Deteniendo proceso... espera a que terminen las peticiones activas', 'warning');
    toast.loading('Deteniendo...', { duration: 2000 });
  };

  // Exportar resultados a CSV único
  const handleExportCSV = () => {
    if (!result) return;
    
    const headers = ['ID', 'OEM', 'Tipo Pieza', 'Precio Actual', 'Precio Mercado', 'Precio Sugerido', 'Diferencia %', 'Familia', 'Estado'];
    const rows = result.resultados.map(r => [
      r.ref_id,
      r.ref_oem,
      r.tipo_pieza,
      r.precio_actual.toFixed(2).replace('.', ','),
      r.precio_mercado.toFixed(2).replace('.', ','),
      r.precio_sugerido?.toFixed(2).replace('.', ',') || '-',
      r.diferencia_porcentaje.toFixed(2).replace('.', ','),
      r.familia,
      r.es_outlier ? 'OUTLIER' : 'OK',
    ]);
    
    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock_verificado_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success('CSV exportado');
  };

  // Exportar resultados agrupados por precio sugerido en un ZIP
  const handleExportZIP = async () => {
    if (!result) return;
    
    toast.loading('Generando archivos...', { duration: 2000 });
    
    const zip = new JSZip();
    const fecha = new Date().toISOString().split('T')[0];
    
    // Agrupar resultados por precio sugerido
    const gruposPorPrecio: Record<string, typeof result.resultados> = {};
    const sinPrecioSugerido: typeof result.resultados = [];
    
    result.resultados.forEach(r => {
      if (r.precio_sugerido !== null && r.precio_sugerido !== undefined) {
        const precioKey = r.precio_sugerido.toFixed(0);
        if (!gruposPorPrecio[precioKey]) {
          gruposPorPrecio[precioKey] = [];
        }
        gruposPorPrecio[precioKey].push(r);
      } else {
        sinPrecioSugerido.push(r);
      }
    });
    
    const headers = ['ID', 'OEM', 'Tipo Pieza', 'Precio Actual', 'Precio Mercado', 'Precio Sugerido', 'Diferencia %', 'Familia', 'Estado'];
    
    // Crear CSV para cada precio sugerido
    Object.entries(gruposPorPrecio)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([precio, items]) => {
        const rows = items.map(r => [
          r.ref_id,
          r.ref_oem,
          r.tipo_pieza,
          r.precio_actual.toFixed(2).replace('.', ','),
          r.precio_mercado.toFixed(2).replace('.', ','),
          r.precio_sugerido?.toFixed(2).replace('.', ',') || '-',
          r.diferencia_porcentaje.toFixed(2).replace('.', ','),
          r.familia,
          r.es_outlier ? 'CAMBIAR' : 'OK',
        ]);
        
        const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        zip.file(`piezas_${precio}€.csv`, csvContent);
      });
    
    // Crear CSV para piezas sin precio sugerido
    if (sinPrecioSugerido.length > 0) {
      const rows = sinPrecioSugerido.map(r => [
        r.ref_id,
        r.ref_oem,
        r.tipo_pieza,
        r.precio_actual.toFixed(2).replace('.', ','),
        r.precio_mercado.toFixed(2).replace('.', ','),
        '-',
        r.diferencia_porcentaje.toFixed(2).replace('.', ','),
        r.familia,
        r.es_outlier ? 'REVISAR' : 'OK',
      ]);
      
      const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
      zip.file('piezas_sin_precio_sugerido.csv', csvContent);
    }
    
    // Crear resumen
    const resumenLines = [
      `Resumen de Verificación - ${fecha}`,
      '',
      `Total items: ${result.total_items}`,
      `Items procesados: ${result.items_procesados}`,
      `Outliers encontrados: ${result.items_con_outliers}`,
      `Tiempo de procesamiento: ${result.tiempo_procesamiento.toFixed(1)}s`,
      '',
      'Distribución por precio sugerido:',
      ...Object.entries(gruposPorPrecio)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([precio, items]) => `  - ${precio}€: ${items.length} piezas`),
      sinPrecioSugerido.length > 0 ? `  - Sin precio sugerido: ${sinPrecioSugerido.length} piezas` : '',
    ];
    zip.file('_RESUMEN.txt', resumenLines.join('\n'));
    
    // Generar y descargar ZIP
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `stock_verificado_${fecha}.zip`);
    
    toast.success(`ZIP generado con ${Object.keys(gruposPorPrecio).length + (sinPrecioSugerido.length > 0 ? 1 : 0)} archivos`);
  };

  // Reiniciar
  const handleReset = () => {
    setFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setMapping({ id: '', oem: '', oe: '', tipo_pieza: '', precio: '' });
    setResult(null);
    setStatus('idle');
    setProgress({ current: 0, total: 0 });
    setLogs([]);
    setIsProcessing(false);
    setShouldStop(false);
    setTiposExcluidos([]);
    setTiposDisponibles([]);
    setIgnorarBaratas(false);
    setSearchTipo('');
    setShowSuggestions(false);
    setFamiliaPreciosFile(null);
    setPiezaFamiliaFile(null);
    setConfigUploaded(false);
    // Limpiar archivo de exclusión
    setExclusionFile(null);
    setExclusionHeaders([]);
    setExclusionData([]);
    setExclusionIdColumn('');
    setIdsToExclude(new Set());
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
                <p className="text-xs text-gray-500">Stock Masivo</p>
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

      {/* Progress Steps */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-center space-x-4 mb-8">
          {['Subir CSV', 'Mapear Columnas', 'Procesar', 'Resultados'].map((step, idx) => {
            const stepStatus = 
              (idx === 0 && ['idle', 'uploading'].includes(status)) ? 'current' :
              (idx === 1 && status === 'mapping') ? 'current' :
              (idx === 2 && status === 'processing') ? 'current' :
              (idx === 3 && ['completed', 'error'].includes(status)) ? 'current' :
              (idx === 0 && ['mapping', 'processing', 'completed'].includes(status)) ? 'completed' :
              (idx === 1 && ['processing', 'completed'].includes(status)) ? 'completed' :
              (idx === 2 && status === 'completed') ? 'completed' :
              'pending';
            
            return (
              <React.Fragment key={step}>
                <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold ${
                  stepStatus === 'completed' ? 'bg-green-600 text-white' :
                  stepStatus === 'current' ? 'bg-blue-600 text-white' :
                  'bg-gray-200 text-gray-500'
                }`}>
                  {stepStatus === 'completed' ? '✓' : idx + 1}
                </div>
                {idx < 3 && <div className={`w-16 h-1 ${
                  stepStatus === 'completed' ? 'bg-green-600' : 'bg-gray-200'
                }`} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        
        {/* Step 1: Upload */}
        {(status === 'idle' || status === 'uploading') && (
          <div className="bg-white rounded-lg shadow p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">📤 Subir Base de Datos CSV</h2>
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
                id="csvUpload"
              />
              <label htmlFor="csvUpload" className="cursor-pointer">
                <div className="text-6xl mb-4">📁</div>
                <p className="text-xl text-gray-600 mb-2">
                  {status === 'uploading' ? 'Cargando...' : 'Haz clic o arrastra un archivo CSV'}
                </p>
                <p className="text-sm text-gray-500">
                  Acepta archivos CSV con cualquier estructura de columnas
                </p>
              </label>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {status === 'mapping' && (
          <div className="bg-white rounded-lg shadow p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">🗂️ Mapear Columnas</h2>
              <button
                onClick={handleReset}
                className="text-gray-500 hover:text-gray-700"
              >
                ← Cambiar archivo
              </button>
            </div>
            
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Archivo:</strong> {file?.name} | 
                <strong> Filas:</strong> {csvData.length} | 
                <strong> Columnas:</strong> {csvHeaders.length} | 
                <strong> Delimitador:</strong> {delimiter === ';' ? 'Punto y coma (;)' : delimiter === ',' ? 'Coma (,)' : 'Tabulador'}
              </p>
            </div>

            {/* Mapeo de columnas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📍 Columna ID <span className="text-red-500">*</span>
                </label>
                <select
                  value={mapping.id}
                  onChange={(e) => handleMappingChange('id', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Seleccionar --</option>
                  {csvHeaders.filter(h => h.trim() !== '').map((h, idx) => (
                    <option key={`id-${idx}-${h}`} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔧 Columna OEM (Referencia) <span className="text-red-500">*</span>
                </label>
                <select
                  value={mapping.oem}
                  onChange={(e) => handleMappingChange('oem', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Seleccionar --</option>
                  {csvHeaders.filter(h => h.trim() !== '').map((h, idx) => (
                    <option key={`oem-${idx}-${h}`} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔩 Columna OE (Opcional)
                </label>
                <select
                  value={mapping.oe}
                  onChange={(e) => handleMappingChange('oe', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Ninguna --</option>
                  {csvHeaders.filter(h => h.trim() !== '').map((h, idx) => (
                    <option key={`oe-${idx}-${h}`} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📦 Columna Tipo de Pieza <span className="text-red-500">*</span>
                </label>
                <select
                  value={mapping.tipo_pieza}
                  onChange={(e) => handleMappingChange('tipo_pieza', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Seleccionar --</option>
                  {csvHeaders.filter(h => h.trim() !== '').map((h, idx) => (
                    <option key={`tipo-${idx}-${h}`} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  💰 Columna Precio <span className="text-red-500">*</span>
                </label>
                <select
                  value={mapping.precio}
                  onChange={(e) => handleMappingChange('precio', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Seleccionar --</option>
                  {csvHeaders.filter(h => h.trim() !== '').map((h, idx) => (
                    <option key={`precio-${idx}-${h}`} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Vista previa */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">👁️ Vista Previa (primeras 5 filas)</h3>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">ID</th>
                      <th className="px-3 py-2 text-left">OEM</th>
                      <th className="px-3 py-2 text-left">OE</th>
                      <th className="px-3 py-2 text-left">Tipo Pieza</th>
                      <th className="px-3 py-2 text-left">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {csvData.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">
                          {mapping.id ? row[csvHeaders.indexOf(mapping.id)] : '-'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {mapping.oem ? row[csvHeaders.indexOf(mapping.oem)] : '-'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {mapping.oe ? row[csvHeaders.indexOf(mapping.oe)] : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {mapping.tipo_pieza ? row[csvHeaders.indexOf(mapping.tipo_pieza)] : '-'}
                        </td>
                        <td className="px-3 py-2 font-semibold">
                          {mapping.precio ? row[csvHeaders.indexOf(mapping.precio)] : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Opciones de procesamiento */}
            <div className="border-t pt-6 mb-8">
              <h3 className="text-lg font-semibold mb-4">⚙️ Opciones de Procesamiento</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Umbral Diferencia: {umbral}%
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={umbral}
                    onChange={(e) => setUmbral(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">Marca como outlier si la diferencia supera este %</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Workers Paralelos: {workers}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={workers}
                    onChange={(e) => setWorkers(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">Más workers = más rápido pero más carga</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Delay entre peticiones: {delay}s
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="2"
                    step="0.1"
                    value={delay}
                    onChange={(e) => setDelay(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">Espera entre cada búsqueda</p>
                </div>
              </div>
              
              {/* Checkbox ignorar baratas */}
              <div className="mt-6">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ignorarBaratas}
                    onChange={(e) => setIgnorarBaratas(e.target.checked)}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Ignorar piezas más baratas que el precio de mercado
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-8">
                  Solo mostrará piezas que estén por encima del precio medio del mercado
                </p>
              </div>
            </div>

            {/* Filtro de tipos de piezas - Buscador */}
            {tiposDisponibles.length > 0 && (
              <div className="border-t pt-6 mb-8">
                <h3 className="text-lg font-semibold mb-4">
                  🚫 Excluir Tipos de Piezas 
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    ({tiposExcluidos.length} excluidos)
                  </span>
                </h3>
                
                {/* Buscador con autocompletado */}
                <div className="relative mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Buscar tipo de pieza para excluir:
                  </label>
                  <input
                    type="text"
                    value={searchTipo}
                    onChange={(e) => {
                      setSearchTipo(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Escribe para buscar... (ej: motor, caja, faro)"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  
                  {/* Sugerencias dropdown */}
                  {showSuggestions && searchTipo && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {tiposDisponibles
                        .filter(tipo => 
                          tipo.toLowerCase().includes(searchTipo.toLowerCase()) && 
                          !tiposExcluidos.includes(tipo)
                        )
                        .slice(0, 10)
                        .map((tipo) => (
                          <button
                            key={tipo}
                            onClick={() => {
                              setTiposExcluidos(prev => [...prev, tipo]);
                              setSearchTipo('');
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm border-b last:border-b-0"
                          >
                            <span className="text-gray-700">{tipo}</span>
                            <span className="text-gray-400 ml-2">+ Excluir</span>
                          </button>
                        ))}
                      {tiposDisponibles.filter(tipo => 
                        tipo.toLowerCase().includes(searchTipo.toLowerCase()) && 
                        !tiposExcluidos.includes(tipo)
                      ).length === 0 && (
                        <div className="px-4 py-2 text-sm text-gray-500">
                          No se encontraron resultados
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Lista de tipos excluidos */}
                {tiposExcluidos.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <p className="text-sm font-medium text-red-800">
                        Tipos de piezas que NO se verificarán:
                      </p>
                      <button
                        onClick={() => setTiposExcluidos([])}
                        className="text-xs text-red-600 hover:text-red-800 underline"
                      >
                        Limpiar todo
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tiposExcluidos.map((tipo) => (
                        <span
                          key={tipo}
                          className="inline-flex items-center bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm"
                        >
                          <span className="line-through">{tipo}</span>
                          <button
                            onClick={() => setTiposExcluidos(prev => prev.filter(t => t !== tipo))}
                            className="ml-2 text-red-600 hover:text-red-900 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {tiposExcluidos.length === 0 && (
                  <p className="text-sm text-gray-500 italic">
                    No hay tipos de piezas excluidos. Usa el buscador para añadir.
                  </p>
                )}
              </div>
            )}

            {/* Subir archivos de configuración de precios */}
            <div className="border-t pt-6 mb-8">
              <h3 className="text-lg font-semibold mb-4">
                📁 Archivos de Configuración de Precios (Opcional)
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Sube los archivos CSV necesarios para calcular precios sugeridos por familia:
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* familia_precios.csv */}
                <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
                  familiaPreciosFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
                }`}>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setFamiliaPreciosFile(e.target.files[0]);
                        toast.success('familia_precios.csv cargado');
                      }
                    }}
                    className="hidden"
                    id="familiaPreciosUpload"
                  />
                  <label htmlFor="familiaPreciosUpload" className="cursor-pointer block">
                    <div className="text-3xl mb-2">{familiaPreciosFile ? '✅' : '📊'}</div>
                    <p className="text-sm font-medium text-gray-700">familia_precios.csv</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {familiaPreciosFile ? familiaPreciosFile.name : 'Precios por familia'}
                    </p>
                  </label>
                  {familiaPreciosFile && (
                    <button
                      onClick={() => setFamiliaPreciosFile(null)}
                      className="mt-2 text-xs text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                
                {/* pieza_familia.csv */}
                <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
                  piezaFamiliaFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
                }`}>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setPiezaFamiliaFile(e.target.files[0]);
                        toast.success('pieza_familia.csv cargado');
                      }
                    }}
                    className="hidden"
                    id="piezaFamiliaUpload"
                  />
                  <label htmlFor="piezaFamiliaUpload" className="cursor-pointer block">
                    <div className="text-3xl mb-2">{piezaFamiliaFile ? '✅' : '🔗'}</div>
                    <p className="text-sm font-medium text-gray-700">pieza_familia.csv</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {piezaFamiliaFile ? piezaFamiliaFile.name : 'Relación pieza-familia'}
                    </p>
                  </label>
                  {piezaFamiliaFile && (
                    <button
                      onClick={() => setPiezaFamiliaFile(null)}
                      className="mt-2 text-xs text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
              
              {(familiaPreciosFile || piezaFamiliaFile) && (
                <p className="text-xs text-green-600 mt-2">
                  ✓ Los archivos se usarán para calcular precios sugeridos
                </p>
              )}
            </div>

            {/* CSV de exclusión por ID */}
            <div className="border-t pt-6 mb-8">
              <h3 className="text-lg font-semibold mb-4">
                🚫 Excluir Piezas por ID (Opcional)
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Sube un CSV con IDs de piezas que quieras excluir del chequeo:
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Subir archivo */}
                <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
                  exclusionFile ? 'border-orange-400 bg-orange-50' : 'border-gray-300 hover:border-blue-400'
                }`}>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleExclusionFileUpload}
                    className="hidden"
                    id="exclusionFileUpload"
                  />
                  <label htmlFor="exclusionFileUpload" className="cursor-pointer block">
                    <div className="text-3xl mb-2">{exclusionFile ? '📋' : '➕'}</div>
                    <p className="text-sm font-medium text-gray-700">CSV de exclusión</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {exclusionFile ? exclusionFile.name : 'Subir archivo con IDs a excluir'}
                    </p>
                  </label>
                  {exclusionFile && (
                    <button
                      onClick={clearExclusionFile}
                      className="mt-2 text-xs text-red-600 hover:text-red-800"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                
                {/* Seleccionar columna de ID */}
                {exclusionFile && exclusionHeaders.length > 0 && (
                  <div className="flex flex-col justify-center">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Selecciona la columna de ID:
                    </label>
                    <select
                      value={exclusionIdColumn}
                      onChange={(e) => handleExclusionColumnChange(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    >
                      <option value="">-- Seleccionar columna --</option>
                      {exclusionHeaders.filter(h => h.trim() !== '').map((h, idx) => (
                        <option key={`excl-${idx}-${h}`} value={h}>{h}</option>
                      ))}
                    </select>
                    {idsToExclude.size > 0 && (
                      <p className="text-xs text-orange-600 mt-2">
                        ⚠️ {idsToExclude.size} IDs serán excluidos del procesamiento
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Botón iniciar */}
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {tiposExcluidos.length > 0 && (
                  <p className="text-orange-600">
                    ⚠️ {tiposExcluidos.length} tipos de piezas serán excluidos
                  </p>
                )}
                {idsToExclude.size > 0 && (
                  <p className="text-orange-600">
                    ⚠️ {idsToExclude.size} IDs serán excluidos
                  </p>
                )}
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={handleReset}
                  className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleStartProcessing}
                  disabled={!isMappingValid()}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors"
                >
                  🚀 Iniciar Verificación
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Processing */}
        {status === 'processing' && (
          <div className="bg-white rounded-lg shadow p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">⏳ Procesando Stock</h2>
              <div className="text-right">
                <p className="text-sm text-gray-500">Progreso</p>
                <p className="text-2xl font-bold text-blue-600">
                  {progress.current}/{progress.total}
                </p>
              </div>
            </div>
            
            {/* Barra de progreso */}
            <div className="mb-6">
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div 
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 mt-2 text-center">
                {progress.total > 0 ? ((progress.current / progress.total) * 100).toFixed(1) : 0}% completado
              </p>
            </div>
            
            {/* Consola de logs */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-gray-700">📟 Consola</h3>
                <button
                  onClick={clearLogs}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Limpiar
                </button>
              </div>
              <div 
                ref={consoleRef}
                className="bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg h-80 overflow-y-auto"
              >
                {logs.length === 0 ? (
                  <p className="text-gray-500">Esperando logs...</p>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className="py-0.5">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* Botón detener */}
            <div className="flex justify-center mt-6">
              <button
                onClick={handleStopProcessing}
                disabled={shouldStop}
                className="px-8 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors flex items-center space-x-2"
              >
                <span>⏹️</span>
                <span>{shouldStop ? 'Deteniendo...' : 'Detener y Ver Resultados'}</span>
              </button>
            </div>
            
            <div className="text-center text-sm text-gray-500 mt-4">
              <p>Puedes detener en cualquier momento y ver los resultados obtenidos hasta ahora.</p>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {(status === 'completed' || status === 'error') && result && (
          <div className="space-y-6">
            {/* Panel de resultados */}
            <div className="bg-white rounded-lg shadow p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">📊 Resultados</h2>
                <div className="flex space-x-4">
                  <button
                    onClick={handleExportZIP}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center space-x-2"
                  >
                    <span>📦</span>
                    <span>Exportar ZIP (por precio)</span>
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center space-x-2"
                  >
                    <span>📥</span>
                    <span>Exportar CSV único</span>
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Nueva Verificación
                  </button>
                </div>
              </div>

              {/* Resumen */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Total Items</p>
                  <p className="text-2xl font-bold text-blue-600">{result.total_items}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Procesados</p>
                  <p className="text-2xl font-bold text-green-600">{result.items_procesados}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Outliers</p>
                  <p className="text-2xl font-bold text-red-600">{result.items_con_outliers}</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Tasa Éxito</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {((result.items_procesados / result.total_items) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Tiempo</p>
                <p className="text-2xl font-bold text-purple-600">{result.tiempo_procesamiento.toFixed(1)}s</p>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex space-x-4 mb-4">
              <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
                Todos ({result.resultados.length})
              </button>
              <button className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-sm font-medium">
                Solo Outliers ({result.items_con_outliers})
              </button>
            </div>

            {/* Tabla de resultados */}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">ID</th>
                    <th className="px-3 py-2 text-left">OEM</th>
                    <th className="px-3 py-2 text-left">Tipo Pieza</th>
                    <th className="px-3 py-2 text-right">Precio Actual</th>
                    <th className="px-3 py-2 text-right">Precio Mercado</th>
                    <th className="px-3 py-2 text-right">Precio Sugerido</th>
                    <th className="px-3 py-2 text-right">Diferencia</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.resultados.map((r, idx) => (
                    <tr key={idx} className={r.es_outlier ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 font-mono text-xs">{r.ref_id}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.ref_oem}</td>
                      <td className="px-3 py-2">{r.tipo_pieza}</td>
                      <td className="px-3 py-2 text-right">{r.precio_actual.toFixed(2)}€</td>
                      <td className="px-3 py-2 text-right">{r.precio_mercado.toFixed(2)}€</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-600">
                        {r.precio_sugerido ? `${r.precio_sugerido.toFixed(2)}€` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={r.diferencia_porcentaje > 0 ? 'text-green-600' : 'text-red-600'}>
                          {r.diferencia_porcentaje > 0 ? '+' : ''}{r.diferencia_porcentaje.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          r.es_outlier ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {r.es_outlier ? '⚠️ Revisar' : '✓ OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
            
            {/* Consola de logs - Colapsable */}
            {logs.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <details className="group">
                  <summary className="cursor-pointer flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-700">📟 Consola de Logs</h3>
                    <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div 
                    ref={consoleRef}
                    className="mt-4 bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg h-60 overflow-y-auto"
                  >
                    {logs.map((log, idx) => (
                      <div key={idx} className="py-0.5">
                        {log}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
