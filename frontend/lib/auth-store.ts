import { create } from 'zustand';
import axios from 'axios';

export interface User {
  id: number;
  email: string;
  nombre_completo?: string;
  rol: string;  // owner, admin, user
  entorno_trabajo_id?: number;
  entorno_nombre?: string;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  
  setAuth: (user: User, token?: string) => void;
  logout: () => Promise<void>;
  loadFromStorage: () => void;
}

// Normaliza el rol a minúsculas
const normalizeUser = (user: any): User => ({
  id: user.id,
  email: user.email,
  nombre_completo: user.nombre_completo || user.nombre,
  rol: String(user.rol).toLowerCase(),
  entorno_trabajo_id: user.entorno_trabajo_id,
  entorno_nombre: user.entorno_nombre,
});

export const useAuthStore = create<AuthStore>((set) => ({
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
        `${process.env.NEXT_PUBLIC_API_URL}/auth/logout`,
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
}));
