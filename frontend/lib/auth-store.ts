import { create } from 'zustand';
import axios from 'axios';

export interface Modulos {
  fichadas: boolean;
  stock_masivo: boolean;
  referencias: boolean;
  piezas_nuevas: boolean;
  ventas: boolean;
  precios_sugeridos: boolean;
  importacion_csv: boolean;
  inventario_piezas: boolean;
  estudio_coches: boolean;
  paqueteria: boolean;
  oem_equivalentes: boolean;
}

export interface User {
  id: number;
  email: string;
  nombre_completo?: string;
  rol: string;  // owner, admin, user
  entorno_trabajo_id?: number;
  entorno_nombre?: string;
  modulos?: Modulos;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  
  setAuth: (user: User, token?: string) => void;
  logout: () => Promise<void>;
  loadFromStorage: () => void;
  hasModulo: (modulo: keyof Modulos) => boolean;
}

// Módulos por defecto (todos desactivados — se activan desde el backend por entorno)
const defaultModulos: Modulos = {
  fichadas: false,
  stock_masivo: false,
  referencias: false,
  piezas_nuevas: false,
  ventas: false,
  precios_sugeridos: false,
  importacion_csv: false,
  inventario_piezas: false,
  estudio_coches: false,
  paqueteria: false,
  oem_equivalentes: false,
};

// Normaliza el rol a minúsculas
const normalizeUser = (user: any): User => ({
  id: user.id,
  email: user.email,
  nombre_completo: user.nombre_completo || user.nombre,
  rol: String(user.rol).toLowerCase(),
  entorno_trabajo_id: user.entorno_trabajo_id,
  entorno_nombre: user.entorno_nombre,
  modulos: user.modulos || defaultModulos,
});

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  setAuth: (user: User, token?: string) => {
    const normalizedUser = normalizeUser(user);
    // Guardar datos de usuario y token
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    if (token) {
      localStorage.setItem('token', token);
    }
    set({
      user: normalizedUser,
      token: token || localStorage.getItem('token'),
      isAuthenticated: true,
    });
  },

  logout: async () => {
    // Llamar al backend para eliminar la cookie HTTPOnly
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/logout`,
        {},
        { 
          withCredentials: true,
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }
      );
    } catch (error) {
      console.error('Error en logout:', error);
    }
    // Limpiar estado local
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },

  loadFromStorage: () => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          const normalizedUser = normalizeUser(user);
          set({
            user: normalizedUser,
            token: token,
            isAuthenticated: true,
          });
        } catch {
          // Si hay error, limpiar storage
          localStorage.removeItem('user');
          localStorage.removeItem('token');
        }
      }
    }
  },

  hasModulo: (modulo: keyof Modulos): boolean => {
    const { user } = get();
    // sysowner siempre tiene acceso a todo
    if (user?.rol === 'sysowner') return true;
    // Si no hay usuario o no hay módulos definidos, denegar por defecto
    if (!user?.modulos) return false;
    return user.modulos[modulo] ?? false;
  },
}));
