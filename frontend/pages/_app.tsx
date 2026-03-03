import type { AppProps } from 'next/app';
import Head from 'next/head';
import { Toaster } from 'react-hot-toast';
import '../styles/globals.css';
import { useEffect } from 'react';
import { useThemeStore } from '@/lib/theme-store';
import ThemeToggle from '@/components/ThemeToggle';

export default function App({ Component, pageProps }: AppProps) {
  const loadTheme = useThemeStore((s) => s.load);

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);
  // Limpiar cualquier Service Worker residual
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
          console.log('Service Worker eliminado:', registration.scope);
        }
      });
      // También limpiar caches
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            caches.delete(name);
            console.log('Cache eliminado:', name);
          }
        });
      }
    }
  }, []);
  return (
    <>
      <Head>
        <title>DesguaPro</title>
        <meta name="description" content="DesguaPro - Gestión de piezas de desguace" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#1e40af" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icono.png" />
      </Head>
      <Component {...pageProps} />
      <div className="fixed bottom-4 left-4 z-[9999]">
        <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center">
          <ThemeToggle />
        </div>
      </div>
      <Toaster
        position="bottom-right"
        reverseOrder={false}
        gutter={8}
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
        }}
      />
    </>
  );
}

