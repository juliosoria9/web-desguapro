import React, { useState } from 'react';
import { preciosAPI } from '@/lib/api';
import { useBusquedaStore } from '@/lib/store';
import toast from 'react-hot-toast';

interface BuscadorProps {
  onResultado: (resultado: any) => void;
  plataformas: { [key: string]: string };
}

export function FormBuscar({ onResultado, plataformas }: BuscadorProps) {
  const store = useBusquedaStore();
  const [localCantidad, setLocalCantidad] = useState('30');

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!store.referencia.trim()) {
      toast.error('Ingresa una referencia');
      return;
    }

    store.setCargando(true);
    store.setError(null);

    try {
      const cantidad = localCantidad === 'Todas' ? -1 : parseInt(localCantidad);
      
      toast.loading('Buscando precios...');
      const response = await preciosAPI.buscar(
        store.referencia,
        store.plataforma,
        cantidad
      );

      store.setResultado(response.data);
      onResultado(response.data);
      
      toast.dismiss();
      toast.success(`✓ Encontrados ${response.data.precios.length} precios`);
    } catch (error: any) {
      const mensaje = error.response?.data?.detail || 'Error al buscar precios';
      store.setError(mensaje);
      toast.dismiss();
      toast.error(mensaje);
    } finally {
      store.setCargando(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h1 className="text-3xl font-bold mb-6">🔍 Buscador de Precios</h1>

      <form onSubmit={handleBuscar} className="space-y-4">
        {/* Plataforma */}
        <div>
          <label className="block text-sm font-medium mb-2">Plataforma</label>
          <select
            value={store.plataforma}
            onChange={(e) => store.setBusqueda(store.referencia, e.target.value, parseInt(localCantidad) || 30)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(plataformas).map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Referencia */}
        <div>
          <label className="block text-sm font-medium mb-2">Referencia</label>
          <input
            type="text"
            value={store.referencia}
            onChange={(e) => store.setBusqueda(e.target.value, store.plataforma, parseInt(localCantidad) || 30)}
            placeholder="Ej: 1K0959653C"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Cantidad */}
        <div>
          <label className="block text-sm font-medium mb-2">Cantidad de piezas</label>
          <select
            value={localCantidad}
            onChange={(e) => setLocalCantidad(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="30">30</option>
            <option value="60">60</option>
            <option value="90">90</option>
            <option value="180">180</option>
            <option value="Todas">Todas</option>
          </select>
        </div>

        {/* Botón */}
        <button
          type="submit"
          disabled={store.cargando}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {store.cargando ? '⏳ Buscando...' : '🔍 Buscar Precio'}
        </button>
      </form>

      {store.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
          <p className="text-red-800">❌ {store.error}</p>
        </div>
      )}
    </div>
  );
}

