'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore, Modulos } from '@/lib/auth-store';
import toast from 'react-hot-toast';

interface ModuloProtegidoProps {
  modulo: keyof Modulos;
  children: React.ReactNode;
}

/**
 * Componente que protege una página basándose en si el módulo está activo para el entorno del usuario.
 * Si el módulo no está activo, redirige al dashboard y muestra un mensaje.
 */
export default function ModuloProtegido({ modulo, children }: ModuloProtegidoProps) {
  const router = useRouter();
  const { user, hasModulo, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (!mounted) return;

    // Si no hay usuario, se redirigirá al login
    if (!user) {
      setChecking(false);
      return;
    }

    // Verificar si tiene acceso al módulo
    if (!hasModulo(modulo)) {
      toast.error('No tienes el paquete contratado', {
        duration: 4000,
        position: 'bottom-right',
        style: {
          background: '#ef4444',
          color: '#fff',
          fontWeight: 'bold',
        },
        icon: '🔒',
      });
      router.push('/dashboard');
      return;
    }

    setChecking(false);
  }, [mounted, user, modulo, hasModulo, router]);

  // Mientras se verifica, mostrar loading
  if (!mounted || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Si el usuario no tiene el módulo, no renderizar nada (se está redirigiendo)
  if (user && !hasModulo(modulo)) {
    return null;
  }

  return <>{children}</>;
}
