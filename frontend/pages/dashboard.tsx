'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage, hasModulo } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Navbar */}
      <nav className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="w-11 h-11 rounded-lg flex items-center justify-center overflow-hidden bg-white border border-gray-200 shadow-sm">
                <img src="/logo.png" alt="DesguaPro" className="w-9 h-9 object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  DesguaPro
                </h1>
                <p className="text-xs text-gray-500">Dashboard</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user.email}
                  {user.entorno_nombre && (
                    <span className="text-blue-600 ml-1 font-semibold">({user.entorno_nombre})</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {user.rol === 'sysowner' && 'Prop. Sistema'}
                  {user.rol === 'owner' && 'Propietario'}
                  {user.rol === 'admin' && 'Administrador'}
                  {user.rol === 'user' && 'Usuario'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-4 py-2 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Buscador */}
          <div 
            className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
            onClick={() => router.push('/search')}
          >
            <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Buscar Precios
            </h2>
            <p className="text-gray-600">
              Busca piezas y compara precios
            </p>
          </div>

          {/* Card: Fichadas (solo admin+) - verificar módulo */}
          {hasModulo('fichadas') && (user.rol === 'sysowner' || user.rol === 'admin' || user.rol === 'owner') && (
            <div 
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/fichadas')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Control Fichadas
              </h2>
              <p className="text-gray-600">
                Ver fichadas del equipo
              </p>
            </div>
          )}

          {/* Card: Mis Fichadas (para usuarios normales) - verificar módulo */}
          {hasModulo('fichadas') && user.rol === 'user' && (
            <div 
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/fichadas')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Mis Fichadas
              </h2>
              <p className="text-gray-600">
                Ver y gestionar mis piezas fichadas
              </p>
            </div>
          )}

          {/* Card: Cruce de Referencias - verificar módulo */}
          {hasModulo('referencias') && (
            <div 
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/referencias')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Cruce Referencias
              </h2>
              <p className="text-gray-600">
                OEM → IAM equivalentes
              </p>
            </div>
          )}

          {/* Card: Gestion Piezas Nuevas - verificar módulo */}
          {hasModulo('piezas_nuevas') && (
            <div
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/piezas-nuevas')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Gestion Piezas Nuevas
              </h2>
              <p className="text-gray-600">
                Comprobar piezas desde CSV
              </p>
            </div>
          )}

          {/* Card 2: Control de Precios - verificar módulo */}
          {hasModulo('stock_masivo') && (
            <div
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/stock-masivo')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-green-50 text-green-600 group-hover:bg-green-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Control de Precios
              </h2>
              <p className="text-gray-600">
                Verifica precios de tu inventario
              </p>
            </div>
          )}

          {/* Card 3: Usuarios (Solo Owner/Admin/Sysowner) */}
          {(user.rol === 'sysowner' || user.rol === 'admin' || user.rol === 'owner') && (
            <div
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/admin/users')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Gestionar Usuarios
              </h2>
              <p className="text-gray-600">
                Crea y gestiona usuarios
              </p>
            </div>
          )}

          {/* Card 4: Entornos/Empresas (Solo Sysowner) */}
          {user.rol === 'sysowner' && (
            <div
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/admin/environments')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-orange-50 text-orange-600 group-hover:bg-orange-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Empresas
              </h2>
              <p className="text-gray-600">
                Crea y gestiona empresas
              </p>
            </div>
          )}

          {/* Card: Stockeo Automatico (Solo Sysowner) */}
          {user.rol === 'sysowner' && (
            <div
              className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border-2 border-amber-200 group"
              onClick={() => router.push('/admin/stockeo-automatico')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-amber-100 text-amber-600 group-hover:bg-amber-200 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Stockeo Automático
              </h2>
              <p className="text-gray-600">
                Importación CSV por empresa
              </p>
            </div>
          )}

          {/* Card: Logs de Auditoria (Solo Sysowner) */}
          {user.rol === 'sysowner' && (
            <div
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/admin/logs')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-red-50 text-red-600 group-hover:bg-red-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Logs de Auditoría
              </h2>
              <p className="text-gray-600">
                Registro de actividad del sistema
              </p>
            </div>
          )}

          {/* Card 5: Base de Datos Desguace (Admin, Owner, Sysowner) */}
          {(user.rol === 'sysowner' || user.rol === 'owner' || user.rol === 'admin') && (
            <div
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/admin/base-desguace')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Base Datos Desguace
              </h2>
              <p className="text-gray-600">
                Gestiona el inventario de piezas
              </p>
            </div>
          )}

          {/* Card: Estudio Coches (Solo Admin, Owner, Sysowner) - verificar módulo */}
          {hasModulo('estudio_coches') && (user.rol === 'sysowner' || user.rol === 'admin' || user.rol === 'owner') && (
            <div
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/estudio-coches')}
            >
              <div className="w-10 h-10 mb-2 text-cyan-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121L16.5 9.879a2.999 2.999 0 0 0-2.121-.879H5.25A2.25 2.25 0 0 0 3 11.25v6.375c0 .621.504 1.125 1.125 1.125H5.25m13.5 0H12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Estudio Coches
              </h2>
              <p className="text-gray-600">
                Análisis por marca y modelo
              </p>
            </div>
          )}

          {/* Card: Precio/Familia (Todos los usuarios) */}
          <div
            className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
            onClick={() => router.push('/configuracion-precios')}
          >
            <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Precio/Familia
            </h2>
            <p className="text-gray-600">
              Configurar precios por familia
            </p>
          </div>

          {/* Card 6: Historial de Ventas - verificar módulo */}
          {hasModulo('ventas') && (
            <div
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/admin/ventas')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-green-50 text-green-600 group-hover:bg-green-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Historial Ventas
              </h2>
              <p className="text-gray-600">
                Piezas vendidas y estadísticas
              </p>
            </div>
          )}

          {/* Card 7: Inventario de Piezas (Todos los usuarios) - verificar módulo */}
          {hasModulo('inventario_piezas') && (
            <div
              className="bg-white rounded-2xl shadow-md p-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer border border-gray-100 group"
              onClick={() => router.push('/admin/stock')}
            >
              <div className="w-12 h-12 mb-3 p-2.5 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Inventario Piezas
              </h2>
              <p className="text-gray-600">
                Piezas en stock disponibles
              </p>
            </div>
          )}
        </div>

        {/* Info section - Solo visible para sysowner */}
        {user.rol === 'sysowner' && (
          <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Información del Sistema
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">
                  <strong>Usuario:</strong> {user.email}
                </p>
                <p className="text-gray-600 mt-2">
                  <strong>Rol:</strong> Propietario de Sistema
                </p>
              </div>
              <div>
                <p className="text-gray-600">
                  <strong>API:</strong> http://localhost:8000
                </p>
                <p className="text-gray-600 mt-2">
                  <strong>Docs:</strong> http://localhost:8000/docs
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

