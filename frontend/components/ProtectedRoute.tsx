import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/auth-store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'OWNER' | 'ADMIN' | 'USER';
}

export default function ProtectedRoute({
  children,
  requiredRole,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, user, loadFromStorage } = useAuthStore();

  useEffect(() => {
    // Cargar desde storage al montar
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    // Verificar autenticación
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Verificar rol si se requiere (comparar en minúsculas)
    if (requiredRole && user && user.rol !== requiredRole.toLowerCase() && user.rol !== 'owner' && user.rol !== 'sysowner') {
      router.push('/dashboard');
    }
  }, [isAuthenticated, user, requiredRole, router]);

  // Mostrar loading mientras se verifica
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

