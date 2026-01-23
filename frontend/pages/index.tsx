import React from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirigir a login
    router.push('/login');
  }, [router]);

  return null;
}
