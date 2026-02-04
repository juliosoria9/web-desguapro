'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL; 

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('Intentando login con:', username);
      const response = await axios.post(`${API_URL}/api/v1/auth/login`, {
        email: username,  // El backend espera 'email' pero es el username
        password,
      }, {
        withCredentials: true,  // Permitir que el backend establezca la cookie HTTPOnly
      });

      console.log('Respuesta del servidor:', response.data);
      const { usuario, access_token } = response.data;

      // Guardar en Zustand store (usuario y token)
      setAuth(usuario, access_token);

      toast.success(`¡Bienvenido ${usuario.email}!`);

      // Redirigir a dashboard
      setTimeout(() => {
        router.push('/dashboard');
      }, 500);
    } catch (error: any) {
      console.error('Error en login:', error);
      const detail = error.response?.data?.detail;
      let message = 'Error en login';
      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        message = detail[0]?.msg || message;
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <div className="w-32 h-32 bg-white rounded-2xl flex items-center justify-center shadow-xl overflow-hidden p-2">
              <img
                src="/logo.png"
                alt="Logo DesguaPro"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            DesguaPro
          </h1>
          <p className="text-blue-100 text-lg mb-4">
            Software de Gestión para Desguaces
          </p>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-left max-w-lg mx-auto">
            <p className="text-blue-50 text-sm leading-relaxed mb-3">
              <span className="font-semibold text-white">Controla tu negocio al completo.</span>{' '}
              Obtén precios competitivos del mercado, gestiona compras, ventas y gastos en una sola plataforma. 
              Totalmente adaptable al software de tu desguace.
            </p>
            <div className="flex items-center gap-2 text-blue-200 text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              <a href="mailto:julio.soria.rodriguez@gmail.com" className="hover:text-white transition-colors">
                julio.soria.rodriguez@gmail.com
              </a>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-lg shadow-xl p-8 space-y-6"
        >
          {/* Usuario */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              placeholder="tu usuario"
              required
            />
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}

