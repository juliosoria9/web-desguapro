import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import ModuloProtegido from '@/components/ModuloProtegido';

interface ConfigEstado {
  tiene_configuracion: boolean;
  pieza_familia: {
    archivo: string | null;
    registros: number;
    tiene_datos: boolean;
  } | null;
  familia_precios: {
    archivo: string | null;
    registros: number;
    tiene_datos: boolean;
  } | null;
  fecha_actualizacion: string | null;
  entorno_id?: number;
}

interface PiezaFamilia {
  id?: number;
  pieza: string;
  familia: string;
}

interface FamiliaPrecios {
  id?: number;
  familia: string;
  precios: number[];
}

interface Entorno {
  id: number;
  nombre: string;
}

function ConfiguracionPreciosContent() {
  const router = useRouter();
  const { user, loadFromStorage } = useAuthStore();
  
  const [estado, setEstado] = useState<ConfigEstado | null>(null);
  const [piezasFamilia, setPiezasFamilia] = useState<PiezaFamilia[]>([]);
  const [familiasPrecios, setFamiliasPrecios] = useState<FamiliaPrecios[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'estado' | 'piezas' | 'familias'>('estado');
  const [searchPiezas, setSearchPiezas] = useState('');
  const [searchFamilias, setSearchFamilias] = useState('');
  const [mounted, setMounted] = useState(false);
  const [entornos, setEntornos] = useState<Entorno[]>([]);
  const [selectedEntorno, setSelectedEntorno] = useState<number | null>(null);
  
  // Estados para edición
  const [editingPieza, setEditingPieza] = useState<number | null>(null);
  const [editPiezaData, setEditPiezaData] = useState<{ pieza: string; familia: string }>({ pieza: '', familia: '' });
  const [editingFamilia, setEditingFamilia] = useState<number | null>(null);
  const [editFamiliaData, setEditFamiliaData] = useState<{ familia: string; precios: string }>({ familia: '', precios: '' });
  const [saving, setSaving] = useState(false);
  const [showAddPieza, setShowAddPieza] = useState(false);
  const [showAddFamilia, setShowAddFamilia] = useState(false);
  const [newPieza, setNewPieza] = useState<{ pieza: string; familia: string }>({ pieza: '', familia: '' });
  const [newFamilia, setNewFamilia] = useState<{ familia: string; precios: string }>({ familia: '', precios: '' });

  const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000') + '/api/v1';

  const fetchEntornos = useCallback(async () => {
    if (user?.rol !== 'sysowner') return;
    try {
      const res = await fetch(`${API_BASE}/precios-config/entornos`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setEntornos(data);
      }
    } catch (error) {
      console.error('Error cargando entornos:', error);
    }
  }, [API_BASE, user?.rol]);

  const fetchEstado = useCallback(async () => {
    try {
      const url = selectedEntorno 
        ? `${API_BASE}/precios-config/estado?entorno_id=${selectedEntorno}`
        : `${API_BASE}/precios-config/estado`;
      const res = await fetch(url, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setEstado(data);
      }
    } catch (error) {
      console.error('Error cargando estado:', error);
    }
  }, [API_BASE, selectedEntorno]);

  const fetchPiezasFamilia = useCallback(async () => {
    try {
      const url = selectedEntorno
        ? `${API_BASE}/precios-config/piezas-familia?entorno_id=${selectedEntorno}`
        : `${API_BASE}/precios-config/piezas-familia`;
      const res = await fetch(url, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setPiezasFamilia(data);
      }
    } catch (error) {
      console.error('Error cargando piezas-familia:', error);
    }
  }, [API_BASE, selectedEntorno]);

  const fetchFamiliasPrecios = useCallback(async () => {
    try {
      const url = selectedEntorno
        ? `${API_BASE}/precios-config/familias-precios?entorno_id=${selectedEntorno}`
        : `${API_BASE}/precios-config/familias-precios`;
      const res = await fetch(url, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setFamiliasPrecios(data);
      }
    } catch (error) {
      console.error('Error cargando familias-precios:', error);
    }
  }, [API_BASE, selectedEntorno]);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (!mounted) return;

    if (!user) {
      router.push('/login');
      return;
    }

    // Todos los usuarios autenticados pueden ver la configuración
    // Cargar entornos si es sysowner
    if (user.rol === 'sysowner') {
      fetchEntornos();
    }

    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchEstado(),
        fetchPiezasFamilia(),
        fetchFamiliasPrecios()
      ]);
      setLoading(false);
    };
    loadData();
  }, [mounted, user, router, fetchEstado, fetchPiezasFamilia, fetchFamiliasPrecios, fetchEntornos]);

  // Recargar datos cuando cambie el entorno seleccionado
  useEffect(() => {
    if (!mounted || !user) return;
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchEstado(),
        fetchPiezasFamilia(),
        fetchFamiliasPrecios()
      ]);
      setLoading(false);
    };
    loadData();
  }, [selectedEntorno, mounted, user, fetchEstado, fetchPiezasFamilia, fetchFamiliasPrecios]);

  const handleUpload = async (tipo: 'pieza-familia' | 'familia-precios', file: File) => {
    setUploading(tipo);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const url = selectedEntorno
        ? `${API_BASE}/precios-config/${tipo}?entorno_id=${selectedEntorno}`
        : `${API_BASE}/precios-config/${tipo}`;
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: `${data.mensaje} - ${data.registros} registros cargados` });
        // Recargar datos
        await Promise.all([
          fetchEstado(),
          fetchPiezasFamilia(),
          fetchFamiliasPrecios()
        ]);
      } else {
        setMessage({ type: 'error', text: data.detail || 'Error subiendo archivo' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de eliminar toda la configuración de precios?')) {
      return;
    }

    try {
      const url = selectedEntorno
        ? `${API_BASE}/precios-config/eliminar?entorno_id=${selectedEntorno}`
        : `${API_BASE}/precios-config/eliminar`;
      const res = await fetch(url, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Configuración eliminada correctamente' });
        await Promise.all([
          fetchEstado(),
          fetchPiezasFamilia(),
          fetchFamiliasPrecios()
        ]);
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Error eliminando configuración' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error de conexión' });
    }
  };

  // ========== FUNCIONES CRUD PIEZA-FAMILIA ==========
  const handleEditPieza = (p: PiezaFamilia) => {
    setEditingPieza(p.id || null);
    setEditPiezaData({ pieza: p.pieza, familia: p.familia });
  };

  const handleSavePieza = async (id: number) => {
    setSaving(true);
    try {
      const params = new URLSearchParams({
        pieza: editPiezaData.pieza,
        familia: editPiezaData.familia,
        ...(selectedEntorno && { entorno_id: selectedEntorno.toString() })
      });
      const res = await fetch(`${API_BASE}/precios-config/pieza-familia/${id}?${params}`, {
        method: 'PUT',
        credentials: 'include'
      });
      if (res.ok) {
        setEditingPieza(null);
        await fetchPiezasFamilia();
        setMessage({ type: 'success', text: 'Registro actualizado' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Error actualizando' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePieza = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      const params = selectedEntorno ? `?entorno_id=${selectedEntorno}` : '';
      const res = await fetch(`${API_BASE}/precios-config/pieza-familia/${id}${params}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        await fetchPiezasFamilia();
        await fetchEstado();
        setMessage({ type: 'success', text: 'Registro eliminado' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error eliminando' });
    }
  };

  const handleAddPieza = async () => {
    if (!newPieza.pieza || !newPieza.familia) return;
    setSaving(true);
    try {
      const params = new URLSearchParams({
        pieza: newPieza.pieza,
        familia: newPieza.familia,
        ...(selectedEntorno && { entorno_id: selectedEntorno.toString() })
      });
      const res = await fetch(`${API_BASE}/precios-config/pieza-familia/nuevo?${params}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        setShowAddPieza(false);
        setNewPieza({ pieza: '', familia: '' });
        await fetchPiezasFamilia();
        await fetchEstado();
        setMessage({ type: 'success', text: 'Registro añadido' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Error añadiendo' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  // ========== FUNCIONES CRUD FAMILIA-PRECIOS ==========
  const handleEditFamilia = (f: FamiliaPrecios) => {
    setEditingFamilia(f.id || null);
    setEditFamiliaData({ familia: f.familia, precios: f.precios.join(', ') });
  };

  const handleSaveFamilia = async (id: number) => {
    setSaving(true);
    try {
      const params = new URLSearchParams({
        familia: editFamiliaData.familia,
        precios: editFamiliaData.precios.replace(/\s/g, ''),
        ...(selectedEntorno && { entorno_id: selectedEntorno.toString() })
      });
      const res = await fetch(`${API_BASE}/precios-config/familia-precios/${id}?${params}`, {
        method: 'PUT',
        credentials: 'include'
      });
      if (res.ok) {
        setEditingFamilia(null);
        await fetchFamiliasPrecios();
        setMessage({ type: 'success', text: 'Registro actualizado' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Error actualizando' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFamilia = async (id: number) => {
    if (!confirm('¿Eliminar esta familia?')) return;
    try {
      const params = selectedEntorno ? `?entorno_id=${selectedEntorno}` : '';
      const res = await fetch(`${API_BASE}/precios-config/familia-precios/${id}${params}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        await fetchFamiliasPrecios();
        await fetchEstado();
        setMessage({ type: 'success', text: 'Registro eliminado' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error eliminando' });
    }
  };

  const handleAddFamilia = async () => {
    if (!newFamilia.familia || !newFamilia.precios) return;
    setSaving(true);
    try {
      const params = new URLSearchParams({
        familia: newFamilia.familia,
        precios: newFamilia.precios.replace(/\s/g, ''),
        ...(selectedEntorno && { entorno_id: selectedEntorno.toString() })
      });
      const res = await fetch(`${API_BASE}/precios-config/familia-precios/nuevo?${params}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        setShowAddFamilia(false);
        setNewFamilia({ familia: '', precios: '' });
        await fetchFamiliasPrecios();
        await fetchEstado();
        setMessage({ type: 'success', text: 'Registro añadido' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Error añadiendo' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  // ========== FUNCIONES DE DESCARGA CSV ==========
  const downloadPiezaFamiliaCSV = () => {
    if (piezasFamilia.length === 0) return;
    
    const header = 'PIEZA;FAMILIA\n';
    const rows = piezasFamilia.map(p => `${p.pieza};${p.familia}`).join('\n');
    const csvContent = header + rows;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pieza_familia.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadFamiliaPreciosCSV = () => {
    if (familiasPrecios.length === 0) return;
    
    // Encontrar el máximo número de precios para crear las columnas
    const maxPrecios = Math.max(...familiasPrecios.map(f => f.precios.length));
    const headerCols = ['FAMILIA', ...Array.from({ length: maxPrecios }, (_, i) => `PRECIO${i + 1}`)];
    const header = headerCols.join(';') + '\n';
    
    const rows = familiasPrecios.map(f => {
      const precios = f.precios.map(p => p.toString());
      // Rellenar con vacíos si hay menos precios
      while (precios.length < maxPrecios) precios.push('');
      return [f.familia, ...precios].join(';');
    }).join('\n');
    
    const csvContent = header + rows;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'familia_precios.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Verificar si puede editar
  const canEdit = user && ['sysowner', 'owner', 'admin'].includes(user.rol);

  // Filtrar datos
  const piezasFiltradas = piezasFamilia.filter(p => 
    p.pieza.toLowerCase().includes(searchPiezas.toLowerCase()) ||
    p.familia.toLowerCase().includes(searchPiezas.toLowerCase())
  );

  const familiasFiltradas = familiasPrecios.filter(f =>
    f.familia.toLowerCase().includes(searchFamilias.toLowerCase())
  );

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Configuración de Precios - DesguaPro</title>
      </Head>

      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
                ← Volver
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">
                Configuración de Precios
              </h1>
            </div>
            <div className="text-sm text-gray-600">
              {user?.email}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          {/* Mensaje */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          {/* Selector de empresa para sysowner */}
          {user?.rol === 'sysowner' && entornos.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-purple-800 mb-2">Seleccionar Empresa</h3>
              <select
                value={selectedEntorno || ''}
                onChange={(e) => setSelectedEntorno(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full md:w-64 px-3 py-2 border rounded-lg"
              >
                <option value="">Mi empresa actual</option>
                {entornos.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Explicación */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-800 mb-2">Configuración por empresa</h3>
            <p className="text-blue-700 text-sm">
              Aquí puedes subir los archivos de configuración de precios específicos para tu desguace. 
              Todos los usuarios de tu empresa usarán estos archivos para calcular los precios sugeridos.
              {!estado?.tiene_configuracion && (
                <strong className="block mt-2 text-orange-700">
                  ⚠️ No hay configuración de precios. Sube los archivos para poder calcular precios sugeridos.
                </strong>
              )}
            </p>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('estado')}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === 'estado'
                      ? 'border-yellow-500 text-yellow-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Estado General
                </button>
                <button
                  onClick={() => setActiveTab('piezas')}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === 'piezas'
                      ? 'border-yellow-500 text-yellow-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Piezas → Familias ({piezasFamilia.length})
                </button>
                <button
                  onClick={() => setActiveTab('familias')}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === 'familias'
                      ? 'border-yellow-500 text-yellow-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Familias → Precios ({familiasPrecios.length})
                </button>
              </nav>
            </div>

            <div className="p-6">
              {/* Tab Estado */}
              {activeTab === 'estado' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Pieza Familia */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-2">Archivo Pieza → Familia</h3>
                      <p className="text-gray-600 text-sm mb-4">
                        Mapea cada tipo de pieza a su familia de precios
                      </p>
                      
                      {estado?.pieza_familia?.tiene_datos ? (
                        <div className="bg-green-50 p-3 rounded mb-4">
                          <p className="text-green-800">
                            <strong>{estado.pieza_familia.archivo}</strong>
                          </p>
                          <p className="text-green-700 text-sm">
                            {estado.pieza_familia.registros} registros cargados
                          </p>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 p-3 rounded mb-4">
                          <p className="text-yellow-800">No hay archivo subido</p>
                          <p className="text-yellow-700 text-sm">Se usa el archivo global</p>
                        </div>
                      )}

                      {/* Solo admin/owner/sysowner pueden subir */}
                      {user && ['sysowner', 'owner', 'admin'].includes(user.rol) && (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">Formato: CSV con columnas PIEZA;FAMILIA</p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                handleUpload('pieza-familia', e.target.files[0]);
                              }
                            }}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"
                            disabled={uploading !== null}
                          />
                          {uploading === 'pieza-familia' && (
                            <p className="text-sm text-gray-600">Subiendo...</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Familia Precios */}
                    <div className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-2">Archivo Familia → Precios</h3>
                      <p className="text-gray-600 text-sm mb-4">
                        Define los precios escalonados para cada familia
                      </p>
                      
                      {estado?.familia_precios?.tiene_datos ? (
                        <div className="bg-green-50 p-3 rounded mb-4">
                          <p className="text-green-800">
                            <strong>{estado.familia_precios.archivo}</strong>
                          </p>
                          <p className="text-green-700 text-sm">
                            {estado.familia_precios.registros} familias cargadas
                          </p>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 p-3 rounded mb-4">
                          <p className="text-yellow-800">No hay archivo subido</p>
                          <p className="text-yellow-700 text-sm">Sube un archivo para configurar</p>
                        </div>
                      )}

                      {/* Solo admin/owner/sysowner pueden subir */}
                      {user && ['sysowner', 'owner', 'admin'].includes(user.rol) && (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">Formato: CSV con columnas FAMILIA;PRECIO1;PRECIO2;...;PRECIO20</p>
                          <input
                            type="file"
                            accept=".csv"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                handleUpload('familia-precios', e.target.files[0]);
                              }
                            }}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"
                            disabled={uploading !== null}
                          />
                          {uploading === 'familia-precios' && (
                            <p className="text-sm text-gray-600">Subiendo...</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Botón eliminar */}
                  {estado?.tiene_configuracion && (user?.rol === 'owner' || user?.rol === 'sysowner') && (
                    <div className="border-t pt-4">
                      <button
                        onClick={handleDelete}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                      >
                        Eliminar toda la configuración
                      </button>
                      <p className="text-gray-500 text-sm mt-2">
                        Esto eliminará los archivos subidos.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Tab Piezas */}
              {activeTab === 'piezas' && (
                <div>
                  {piezasFamilia.length === 0 && !canEdit ? (
                    <p className="text-gray-500 text-center py-8">
                      No hay datos de piezas cargados. Sube el archivo pieza_familia.csv
                    </p>
                  ) : (
                    <>
                      <div className="mb-4 flex flex-wrap gap-2 items-center justify-between">
                        <input
                          type="text"
                          placeholder="Buscar pieza o familia..."
                          value={searchPiezas}
                          onChange={(e) => setSearchPiezas(e.target.value)}
                          className="w-full md:w-64 px-3 py-2 border rounded-lg"
                        />
                        <div className="flex gap-2">
                          {piezasFamilia.length > 0 && (
                            <button
                              onClick={downloadPiezaFamiliaCSV}
                              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm flex items-center gap-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                              </svg>
                              Descargar CSV
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => setShowAddPieza(true)}
                              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm"
                            >
                              + Añadir Pieza
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Formulario añadir */}
                      {showAddPieza && (
                        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <h4 className="font-medium mb-2">Nueva Pieza</h4>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              placeholder="Nombre pieza"
                              value={newPieza.pieza}
                              onChange={(e) => setNewPieza({ ...newPieza, pieza: e.target.value.toUpperCase() })}
                              className="px-3 py-2 border rounded flex-1 min-w-32"
                            />
                            <input
                              type="text"
                              placeholder="Familia"
                              value={newPieza.familia}
                              onChange={(e) => setNewPieza({ ...newPieza, familia: e.target.value.toUpperCase() })}
                              className="px-3 py-2 border rounded flex-1 min-w-32"
                            />
                            <button
                              onClick={handleAddPieza}
                              disabled={saving}
                              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              {saving ? '...' : 'Guardar'}
                            </button>
                            <button
                              onClick={() => { setShowAddPieza(false); setNewPieza({ pieza: '', familia: '' }); }}
                              className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto max-h-96">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pieza</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Familia</th>
                              {canEdit && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {piezasFiltradas.slice(0, 100).map((p, i) => (
                              <tr key={p.id || i} className="hover:bg-gray-50">
                                {editingPieza === p.id ? (
                                  <>
                                    <td className="px-4 py-2">
                                      <input
                                        type="text"
                                        value={editPiezaData.pieza}
                                        onChange={(e) => setEditPiezaData({ ...editPiezaData, pieza: e.target.value.toUpperCase() })}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                      />
                                    </td>
                                    <td className="px-4 py-2">
                                      <input
                                        type="text"
                                        value={editPiezaData.familia}
                                        onChange={(e) => setEditPiezaData({ ...editPiezaData, familia: e.target.value.toUpperCase() })}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                      />
                                    </td>
                                    <td className="px-4 py-2 text-right space-x-1">
                                      <button
                                        onClick={() => handleSavePieza(p.id!)}
                                        disabled={saving}
                                        className="text-green-600 hover:text-green-800 text-sm"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        onClick={() => setEditingPieza(null)}
                                        className="text-gray-500 hover:text-gray-700 text-sm"
                                      >
                                        ✗
                                      </button>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-4 py-2 text-sm">{p.pieza}</td>
                                    <td className="px-4 py-2 text-sm text-gray-600">{p.familia}</td>
                                    {canEdit && (
                                      <td className="px-4 py-2 text-right space-x-2">
                                        <button
                                          onClick={() => handleEditPieza(p)}
                                          className="text-blue-600 hover:text-blue-800 text-xs"
                                        >
                                          Editar
                                        </button>
                                        <button
                                          onClick={() => handleDeletePieza(p.id!)}
                                          className="text-red-600 hover:text-red-800 text-xs"
                                        >
                                          Eliminar
                                        </button>
                                      </td>
                                    )}
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {piezasFiltradas.length > 100 && (
                          <p className="text-center text-gray-500 py-2">
                            Mostrando 100 de {piezasFiltradas.length} resultados
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Tab Familias */}
              {activeTab === 'familias' && (
                <div>
                  {familiasPrecios.length === 0 && !canEdit ? (
                    <p className="text-gray-500 text-center py-8">
                      No hay datos de familias cargados. Sube el archivo familia_precios.csv
                    </p>
                  ) : (
                    <>
                      <div className="mb-4 flex flex-wrap gap-2 items-center justify-between">
                        <input
                          type="text"
                          placeholder="Buscar familia..."
                          value={searchFamilias}
                          onChange={(e) => setSearchFamilias(e.target.value)}
                          className="w-full md:w-64 px-3 py-2 border rounded-lg"
                        />
                        <div className="flex gap-2">
                          {familiasPrecios.length > 0 && (
                            <button
                              onClick={downloadFamiliaPreciosCSV}
                              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm flex items-center gap-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                              </svg>
                              Descargar CSV
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() => setShowAddFamilia(true)}
                              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm"
                            >
                              + Añadir Familia
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Formulario añadir */}
                      {showAddFamilia && (
                        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <h4 className="font-medium mb-2">Nueva Familia</h4>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              placeholder="Nombre familia"
                              value={newFamilia.familia}
                              onChange={(e) => setNewFamilia({ ...newFamilia, familia: e.target.value.toUpperCase() })}
                              className="px-3 py-2 border rounded w-40"
                            />
                            <input
                              type="text"
                              placeholder="Precios (ej: 10,20,30,40)"
                              value={newFamilia.precios}
                              onChange={(e) => setNewFamilia({ ...newFamilia, precios: e.target.value })}
                              className="px-3 py-2 border rounded flex-1 min-w-48"
                            />
                            <button
                              onClick={handleAddFamilia}
                              disabled={saving}
                              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              {saving ? '...' : 'Guardar'}
                            </button>
                            <button
                              onClick={() => { setShowAddFamilia(false); setNewFamilia({ familia: '', precios: '' }); }}
                              className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                            >
                              Cancelar
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">Ingresa los precios separados por comas (ej: 18, 28, 48, 88, 148)</p>
                        </div>
                      )}

                      <div className="overflow-x-auto max-h-96">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Familia</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precios</th>
                              {canEdit && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {familiasFiltradas.map((f, i) => (
                              <tr key={f.id || i} className="hover:bg-gray-50">
                                {editingFamilia === f.id ? (
                                  <>
                                    <td className="px-4 py-2">
                                      <input
                                        type="text"
                                        value={editFamiliaData.familia}
                                        onChange={(e) => setEditFamiliaData({ ...editFamiliaData, familia: e.target.value.toUpperCase() })}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                      />
                                    </td>
                                    <td className="px-4 py-2">
                                      <input
                                        type="text"
                                        value={editFamiliaData.precios}
                                        onChange={(e) => setEditFamiliaData({ ...editFamiliaData, precios: e.target.value })}
                                        className="w-full px-2 py-1 border rounded text-sm"
                                        placeholder="10, 20, 30, 40"
                                      />
                                    </td>
                                    <td className="px-4 py-2 text-right space-x-1">
                                      <button
                                        onClick={() => handleSaveFamilia(f.id!)}
                                        disabled={saving}
                                        className="text-green-600 hover:text-green-800 text-sm"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        onClick={() => setEditingFamilia(null)}
                                        className="text-gray-500 hover:text-gray-700 text-sm"
                                      >
                                        ✗
                                      </button>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-4 py-2 text-sm font-medium">{f.familia}</td>
                                    <td className="px-4 py-2 text-sm">
                                      <div className="flex flex-wrap gap-1">
                                        {f.precios.map((precio, j) => (
                                          <span 
                                            key={j}
                                            className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs"
                                          >
                                            €{precio}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                    {canEdit && (
                                      <td className="px-4 py-2 text-right space-x-2">
                                        <button
                                          onClick={() => handleEditFamilia(f)}
                                          className="text-blue-600 hover:text-blue-800 text-xs"
                                        >
                                          Editar
                                        </button>
                                        <button
                                          onClick={() => handleDeleteFamilia(f.id!)}
                                          className="text-red-600 hover:text-red-800 text-xs"
                                        >
                                          Eliminar
                                        </button>
                                      </td>
                                    )}
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

// Exportar componente envuelto con protección de módulo
export default function ConfiguracionPrecios() {
  return (
    <ModuloProtegido modulo="precios_sugeridos">
      <ConfiguracionPreciosContent />
    </ModuloProtegido>
  );
}