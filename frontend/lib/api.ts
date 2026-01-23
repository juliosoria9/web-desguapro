import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 30000,
});

// Interceptor para errores
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    throw error;
  }
);

// Precios API
export const preciosAPI = {
  buscar: (referencia: string, plataforma: string, cantidad: number) =>
    apiClient.post('/precios/buscar', { referencia, plataforma, cantidad }),
  
  plataformas: () =>
    apiClient.get('/precios/plataformas-disponibles'),
};

// Stock API
export const stockAPI = {
  verificar: (items: any[], umbral: number, workers: number) =>
    apiClient.post('/stock/verificar', { items, umbral_diferencia: umbral, workers }),
};

// Plataformas API
export const plataformasAPI = {
  listar: () =>
    apiClient.get('/plataformas/'),
  
  obtener: (id: string) =>
    apiClient.get(`/plataformas/${id}`),
};

// Token API
export const tokenAPI = {
  obtener: () =>
    apiClient.get('/token/obtener'),
  
  configurar: (token: string) =>
    apiClient.post('/token/configurar', { token }),
};
