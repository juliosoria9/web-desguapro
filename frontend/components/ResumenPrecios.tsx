import React from 'react';
import toast from 'react-hot-toast';

interface Resultado {
  referencia: string;
  plataforma: string;
  precios: number[];
  resumen: {
    media: number;
    mediana: number;
    minimo: number;
    maximo: number;
    desviacion_estandar: number;
    cantidad_precios: number;
    outliers_removidos: number;
  };
}

export function ResumenPrecios({ resultado }: { resultado: Resultado }) {
  if (!resultado) return null;

  const { resumen } = resultado;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <h2 className="text-2xl font-bold mb-4">📊 Resumen de Precios</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Media', valor: resumen.media, icono: '📈' },
          { label: 'Mediana', valor: resumen.mediana, icono: '📊' },
          { label: 'Mínimo', valor: resumen.minimo, icono: '📉' },
          { label: 'Máximo', valor: resumen.maximo, icono: '⬆️' },
          { label: 'Desv. Est.', valor: resumen.desviacion_estandar, icono: '📐' },
          { label: 'Precios', valor: resumen.cantidad_precios, icono: '🔢' },
        ].map((item) => (
          <div key={item.label} className="bg-blue-50 rounded-lg p-4">
            <p className="text-gray-600 text-sm font-medium">{item.label}</p>
            <p className="text-2xl font-bold text-blue-600 mt-2">
              {item.icono} {typeof item.valor === 'number' ? item.valor.toFixed(2) : item.valor}
              {item.label !== 'Precios' && item.label !== 'Desv. Est.' && '€'}
            </p>
          </div>
        ))}
      </div>

      {resumen.outliers_removidos > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-yellow-800 font-medium">
            ⚠️ {resumen.outliers_removidos} outliers removidos
          </p>
          <p className="text-sm text-yellow-700 mt-1">
            Rango limpio: {resumen.media - 50}€ - {resumen.media + 50}€
          </p>
        </div>
      )}
    </div>
  );
}

export function ListaPrecios({ precios }: { precios: number[] }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mt-6">
      <h2 className="text-2xl font-bold mb-4">💰 Todos los Precios</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {precios.map((precio, idx) => (
          <div key={idx} className="bg-gray-50 rounded p-2 flex justify-between">
            <span className="text-gray-600">#{idx + 1}</span>
            <span className="font-bold text-blue-600">{precio.toFixed(2)}€</span>
          </div>
        ))}
      </div>
    </div>
  );
}

