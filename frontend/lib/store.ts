import { create } from 'zustand';

interface BusquedaStore {
  referencia: string;
  plataforma: string;
  cantidad: number;
  cargando: boolean;
  resultado: any;
  error: string | null;
  
  setBusqueda: (referencia: string, plataforma: string, cantidad: number) => void;
  setCargando: (cargando: boolean) => void;
  setResultado: (resultado: any) => void;
  setError: (error: string | null) => void;
  resetear: () => void;
}

export const useBusquedaStore = create<BusquedaStore>((set) => ({
  referencia: '',
  plataforma: 'ecooparts',
  cantidad: 30,
  cargando: false,
  resultado: null,
  error: null,
  
  setBusqueda: (referencia, plataforma, cantidad) =>
    set({ referencia, plataforma, cantidad }),
  setCargando: (cargando) => set({ cargando }),
  setResultado: (resultado) => set({ resultado }),
  setError: (error) => set({ error }),
  resetear: () =>
    set({
      referencia: '',
      plataforma: 'ecooparts',
      cantidad: 30,
      resultado: null,
      error: null,
    }),
}));

interface StockStore {
  items: any[];
  cargando: boolean;
  resultado: any;
  error: string | null;
  
  setItems: (items: any[]) => void;
  setCargando: (cargando: boolean) => void;
  setResultado: (resultado: any) => void;
  setError: (error: string | null) => void;
}

export const useStockStore = create<StockStore>((set) => ({
  items: [],
  cargando: false,
  resultado: null,
  error: null,
  
  setItems: (items) => set({ items }),
  setCargando: (cargando) => set({ cargando }),
  setResultado: (resultado) => set({ resultado }),
  setError: (error) => set({ error }),
}));
