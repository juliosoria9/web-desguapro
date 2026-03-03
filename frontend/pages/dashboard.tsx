'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';
import ChangelogModal from '@/components/ChangelogModal';
import axios from 'axios';

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout, loadFromStorage, hasModulo } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [alertasCajas, setAlertasCajas] = useState(0);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  // Cargar alertas de stock de cajas para admins con módulo paquetería
  useEffect(() => {
    if (!mounted || !user) return;
    const esAdmin = user.rol && ['admin', 'owner', 'sysowner'].includes(user.rol);
    if (!esAdmin || !hasModulo('paqueteria')) return;

    const cargarAlertas = async () => {
      try {
        const res = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/paqueteria/tipos-caja/resumen`,
          { withCredentials: true }
        );
        const alertas = (res.data || []).filter((r: any) =>
          r.dias_aviso != null && r.dias_restantes != null && r.dias_restantes <= r.dias_aviso
        );
        setAlertasCajas(alertas.length);
      } catch {
        // silenciar errores
      }
    };
    cargarAlertas();
  }, [mounted, user]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const isAdmin = user.rol === 'sysowner' || user.rol === 'admin' || user.rol === 'owner';
  const isSysowner = user.rol === 'sysowner';

  const fechaHoy = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const rolLabel: Record<string, string> = {
    sysowner: 'Propietario de Sistema',
    owner: 'Propietario',
    admin: 'Administrador',
    user: 'Usuario',
  };

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md overflow-hidden flex items-center justify-center bg-white border border-gray-200">
                <img src="/logo.png" alt="DesguaPro" className="w-6 h-6 object-contain" />
              </div>
              <span className="text-base font-semibold text-gray-900">DesguaPro</span>
            </div>
            <div className="flex items-center gap-5">
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">{user.email}</span>
                {user.entorno_nombre && (
                  <span className="text-gray-400">· {user.entorno_nombre}</span>
                )}
              </div>
              <div className="h-5 w-px bg-gray-200 hidden sm:block" />
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {/* Header */}
        <div className="pt-8 pb-2">
          <h1 className="text-xl font-semibold text-gray-900">
            Panel de control
          </h1>
          <p className="text-sm text-gray-400 mt-1 capitalize">{fechaHoy}</p>
        </div>

        {/* === SECCIÓN: Operaciones === */}
        <section className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Operaciones</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* Buscar Precios */}
            <div
              className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
              onClick={() => router.push('/search')}
            >
              <div className="w-9 h-9 shrink-0 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-gray-900">Buscar Precios</h3>
                <p className="text-xs text-gray-500 mt-0.5">Busca piezas y compara precios</p>
              </div>
            </div>

            {/* Control Fichadas (admin+) */}
            {hasModulo('fichadas') && isAdmin && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/fichadas')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-teal-50 text-teal-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Control Fichadas</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Ver fichadas del equipo</p>
                </div>
              </div>
            )}

            {/* Mis Fichadas (user) */}
            {hasModulo('fichadas') && user.rol === 'user' && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/fichadas')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-teal-50 text-teal-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Mis Fichadas</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Ver y gestionar mis piezas fichadas</p>
                </div>
              </div>
            )}

            {/* Control Despiece (admin+) */}
            {hasModulo('despiece') && isAdmin && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/despiece')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Control Despiece</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Ver despiece del equipo</p>
                </div>
              </div>
            )}

            {/* Mis Despieces (user) */}
            {hasModulo('despiece') && user.rol === 'user' && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/despiece')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Mis Despieces</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Ver y gestionar mis piezas despiezadas</p>
                </div>
              </div>
            )}

            {/* Cruce de Referencias */}
            {hasModulo('referencias') && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/referencias')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Cruce Referencias</h3>
                  <p className="text-xs text-gray-500 mt-0.5">OEM &#8594; IAM equivalentes</p>
                </div>
              </div>
            )}

            {/* Gestión Piezas Nuevas */}
            {hasModulo('piezas_nuevas') && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/piezas-nuevas')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Piezas Nuevas</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Comprobar piezas desde CSV</p>
                </div>
              </div>
            )}

          </div>
        </section>

        {/* === SECCIÓN: Inventario y ventas === */}
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Inventario y ventas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* Control de Precios */}
            {hasModulo('stock_masivo') && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/stock-masivo')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-green-50 text-green-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Control de Precios</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Verifica precios de tu inventario</p>
                </div>
              </div>
            )}

            {/* Base Datos Desguace */}
            {isAdmin && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/base-desguace')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-teal-50 text-teal-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Base Datos Desguace</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Gestiona el inventario de piezas</p>
                </div>
              </div>
            )}

            {/* Inventario Piezas */}
            {hasModulo('inventario_piezas') && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/stock')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Inventario Piezas</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Piezas en stock disponibles</p>
                </div>
              </div>
            )}

            {/* Venta */}
            {hasModulo('venta_comercial') && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/venta')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Venta</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Clientes interesados y buscar piezas</p>
                </div>
              </div>
            )}

            {/* Historial Ventas */}
            {hasModulo('ventas') && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/ventas')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-green-50 text-green-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Historial Ventas</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Piezas vendidas y estadísticas</p>
                </div>
              </div>
            )}

            {/* Estudio Coches */}
            {hasModulo('estudio_coches') && isAdmin && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/estudio-coches')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-cyan-50 text-cyan-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 0-.879-2.121L16.5 9.879a2.999 2.999 0 0 0-2.121-.879H5.25A2.25 2.25 0 0 0 3 11.25v6.375c0 .621.504 1.125 1.125 1.125H5.25m13.5 0H12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Estudio Coches</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Análisis por marca y modelo</p>
                </div>
              </div>
            )}

          </div>
        </section>

        {/* === SECCIÓN: Configuración === */}
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Configuración</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* Precio/Familia */}
            <div
              className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
              onClick={() => router.push('/configuracion-precios')}
            >
              <div className="w-9 h-9 shrink-0 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-gray-900">Precio/Familia</h3>
                <p className="text-xs text-gray-500 mt-0.5">Configurar precios por familia</p>
              </div>
            </div>

            {/* Gestionar Usuarios */}
            {isAdmin && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/users')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Usuarios</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Crea y gestiona usuarios</p>
                </div>
              </div>
            )}

            {/* Catálogo Vehículos */}
            {hasModulo('catalogo_vehiculos') && (
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/vehiculos')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-cyan-50 text-cyan-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Catálogo Vehículos</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Marcas, modelos, años y precios</p>
                </div>
              </div>
            )}

            {/* Gestión Paquetería */}
            {hasModulo('paqueteria') && (
              <div
                className={`relative flex items-start gap-3 border rounded-lg p-4 cursor-pointer transition-colors ${
                  alertasCajas > 0
                    ? 'bg-red-50 border-red-200 hover:border-red-300'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => router.push('/paqueteria')}
              >
                {alertasCajas > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {alertasCajas}
                  </span>
                )}
                <div className={`w-9 h-9 shrink-0 rounded-md flex items-center justify-center ${
                  alertasCajas > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className={`text-sm font-medium ${alertasCajas > 0 ? 'text-red-800' : 'text-gray-900'}`}>
                    Paquetería
                  </h3>
                  <p className={`text-xs mt-0.5 ${alertasCajas > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {alertasCajas > 0
                      ? `${alertasCajas} caja${alertasCajas > 1 ? 's' : ''} en riesgo`
                      : 'Control de envíos y paquetes'
                    }
                  </p>
                </div>
              </div>
            )}

          </div>
        </section>

        {/* === SECCIÓN: Soporte === */}
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Soporte</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* Tickets */}
            <div
              className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
              onClick={() => router.push('/tickets')}
            >
              <div className="w-9 h-9 shrink-0 rounded-md bg-pink-50 text-pink-600 flex items-center justify-center">
                <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-gray-900">
                  {isSysowner ? 'Gestión Tickets' : 'Soporte'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isSysowner ? 'Ver todos los tickets' : 'Dudas, sugerencias y reportes'}
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* === SECCIÓN: Sistema (solo sysowner) === */}
        {isSysowner && (
          <section className="mt-8">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Sistema</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

              {/* Empresas */}
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/environments')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Empresas</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Crea y gestiona empresas</p>
                </div>
              </div>

              {/* Stockeo Automático */}
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/stockeo-automatico')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Stockeo Automático</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Importación CSV por empresa</p>
                </div>
              </div>

              {/* Logs de Auditoría */}
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/logs')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Logs de Auditoría</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Registro de actividad del sistema</p>
                </div>
              </div>

              {/* Monitor de API */}
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/api-monitor')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-green-50 text-green-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Monitor API</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Peticiones y estadísticas</p>
                </div>
              </div>

              {/* Anuncios */}
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/anuncios')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Anuncios</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Changelog y avisos a usuarios</p>
                </div>
              </div>

              {/* Tests del Sistema */}
              <div
                className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 cursor-pointer transition-colors"
                onClick={() => router.push('/admin/tests')}
              >
                <div className="w-9 h-9 shrink-0 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                  <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m6 2.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-900">Tests del Sistema</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Probar endpoints y estado del backend</p>
                </div>
              </div>

            </div>
          </section>
        )}

        {/* Info footer (sysowner) */}
        {isSysowner && (
          <div className="mt-10 bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center gap-6 text-xs text-gray-400">
              <span>{user.email} · {rolLabel[user.rol] || user.rol}</span>
              <span className="hidden sm:inline">API: localhost:8000</span>
              <span className="hidden sm:inline">Docs: localhost:8000/docs</span>
            </div>
          </div>
        )}
      </main>

      <ChangelogModal />
    </div>
  );
}