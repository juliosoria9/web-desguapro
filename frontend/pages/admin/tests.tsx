'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Link from 'next/link';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

type TestStatus = 'idle' | 'running' | 'pass' | 'fail';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type TestSpec = {
  id: string;
  nombre: string;
  metodo: HttpMethod;
  endpoint: string;
  run: () => Promise<void>;
};

type TestResult = {
  id: string;
  status: TestStatus;
  ms?: number;
  httpStatus?: number;
  detalle?: string;
};

// Tipos para pytest suites
interface PytestResult {
  nombre: string;
  clase: string;
  resultado: 'passed' | 'failed' | 'skipped' | 'error';
  duracion: number;
  mensaje_error: string | null;
  porcentaje?: number;
  indice?: number;
  descripcion?: string;
}

interface PytestSuiteResult {
  suite: string;
  nombre: string;
  total: number;
  passed: number;
  failed: number;
  errores: number;
  skipped: number;
  duracion: number;
  tests: PytestResult[];
  estado: 'idle' | 'collecting' | 'running' | 'done';
}

interface PytestSuiteInfo {
  id: string;
  nombre: string;
  descripcion: string;
  archivo: string;
}

interface PytestLog {
  timestamp: number;
  tipo: 'info' | 'test' | 'error' | 'done';
  mensaje: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const TEST_SUITES_MAP: Record<string, string> = {
  smoke_tests: 'test_smoke',
  apis_precios: 'test_apis_precios',
  scrapers_iam: 'test_scrapers_iam',
  funcionalidades_web: 'test_funcionalidades_web',
};

const ArrowLeftIcon = () => (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

function Badge({ status }: { status: TestStatus }) {
  const cls =
    status === 'pass'
      ? 'bg-green-100 text-green-800 border-green-200'
      : status === 'fail'
        ? 'bg-red-100 text-red-800 border-red-200'
        : status === 'running'
          ? 'bg-blue-100 text-blue-800 border-blue-200'
          : 'bg-gray-100 text-gray-700 border-gray-200';

  const label =
    status === 'pass' ? 'OK' : status === 'fail' ? 'FALLÓ' : status === 'running' ? 'EJECUTANDO…' : 'PENDIENTE';

  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>{label}</span>;
}

export default function TestsSysownerPage() {
  const router = useRouter();
  const { user, loadFromStorage } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  // Pytest state
  const [pytestSuites, setPytestSuites] = useState<PytestSuiteInfo[]>([]);
  const [pytestResults, setPytestResults] = useState<Record<string, PytestSuiteResult>>({});
  const [pytestRunning, setPytestRunning] = useState<string | null>(null);
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});
  const [expandedTracebacks, setExpandedTracebacks] = useState<Record<string, boolean>>({});
  const [pytestLogs, setPytestLogs] = useState<PytestLog[]>([]);
  const [pytestElapsed, setPytestElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<'smoke' | 'pytest'>('smoke');
  const pytestTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    loadFromStorage();
    setMounted(true);
  }, [loadFromStorage]);

  useEffect(() => {
    if (!mounted) return;
    if (!user) return;
    if (user.rol !== 'sysowner') {
      router.push('/dashboard');
    } else {
      fetchPytestSuites();
    }
  }, [mounted, user, router]);

  async function fetchPytestSuites() {
    try {
      const res = await apiClient.get('/tests/suites', { timeout: 10000 });
      setPytestSuites(res.data);
    } catch { /* suites endpoint may not exist yet */ }
  }

  async function ejecutarPytest(suiteId: string) {
    setPytestRunning(suiteId);
    setPytestLogs([]);
    setPytestElapsed(0);

    // Initialize results for running suites
    if (suiteId === 'todos') {
      const init: Record<string, PytestSuiteResult> = {};
      for (const s of pytestSuites) {
        init[s.id] = { suite: s.id, nombre: s.nombre, total: 0, passed: 0, failed: 0, errores: 0, skipped: 0, duracion: 0, tests: [], estado: 'idle' };
      }
      setPytestResults(init);
    } else {
      const info = pytestSuites.find(s => s.id === suiteId);
      setPytestResults(prev => ({
        ...prev,
        [suiteId]: { suite: suiteId, nombre: info?.nombre || suiteId, total: 0, passed: 0, failed: 0, errores: 0, skipped: 0, duracion: 0, tests: [], estado: 'idle' },
      }));
    }

    // Timer
    const t0 = Date.now();
    pytestTimerRef.current = setInterval(() => setPytestElapsed(Math.floor((Date.now() - t0) / 1000)), 500);

    const addLog = (tipo: PytestLog['tipo'], mensaje: string) => {
      setPytestLogs(prev => [...prev, { timestamp: Date.now(), tipo, mensaje }]);
    };

    addLog('info', `Iniciando ${suiteId === 'todos' ? 'todas las suites' : suiteId}...`);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/v1/tests/ejecutar-stream/${suiteId}`, {
        credentials: 'include',
        signal: abort.signal,
        headers,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.trim().split('\n');
          let eventType = '';
          let eventData = '';
          for (const l of lines) {
            if (l.startsWith('event: ')) eventType = l.slice(7).trim();
            else if (l.startsWith('data: ')) eventData = l.slice(6);
          }
          if (!eventType || !eventData) continue;

          try {
            const data = JSON.parse(eventData);
            handleSSEEvent(eventType, data, addLog);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        addLog('error', `Error: ${err.message}`);
        toast.error('Error ejecutando tests: ' + err.message);
      }
    } finally {
      if (pytestTimerRef.current) clearInterval(pytestTimerRef.current);
      abortRef.current = null;
      setPytestRunning(null);
    }
  }

  function handleSSEEvent(event: string, data: any, addLog: (tipo: PytestLog['tipo'], msg: string) => void) {
    switch (event) {
      case 'run_start':
        addLog('info', `Modo: ${data.modo}, ${data.total_suites} suite(s)`);
        break;

      case 'suite_start':
        addLog('info', `▶ Suite: ${data.nombre} (${data.total_esperado} tests)`);
        setPytestResults(prev => ({
          ...prev,
          [data.suite]: {
            ...prev[data.suite],
            suite: data.suite,
            nombre: data.nombre,
            total: data.total_esperado,
            passed: 0, failed: 0, errores: 0, skipped: 0, duracion: 0,
            tests: [],
            estado: 'running',
          },
        }));
        // Añadir suite a la lista si no existe (fallback si fetchPytestSuites falló)
        setPytestSuites(prev => {
          if (prev.some(s => s.id === data.suite)) return prev;
          return [...prev, { id: data.suite, nombre: data.nombre, descripcion: data.descripcion || '', archivo: data.archivo || '' }];
        });
        break;

      case 'test_result': {
        const { nombre, clase, resultado, porcentaje, indice, total_esperado, resumen_parcial, nodeid, descripcion } = data;
        const testItem: PytestResult = { nombre, clase, resultado, duracion: 0, mensaje_error: null, porcentaje, indice, descripcion: descripcion || undefined };

        // Find which suite this belongs to
        const suiteId = findSuiteForNodeid(nodeid || '');

        setPytestResults(prev => {
          const sid = suiteId || Object.keys(prev).find(k => prev[k]?.estado === 'running') || '';
          if (!sid || !prev[sid]) return prev;
          const existing = prev[sid];
          return {
            ...prev,
            [sid]: {
              ...existing,
              total: total_esperado || existing.total,
              passed: resumen_parcial?.passed ?? existing.passed,
              failed: resumen_parcial?.failed ?? existing.failed,
              skipped: resumen_parcial?.skipped ?? existing.skipped,
              tests: [...existing.tests, testItem],
            },
          };
        });

        if (resultado === 'failed') {
          addLog('error', `✗ ${clase ? clase + '.' : ''}${nombre}`);
          // Auto-expand failed classes
          if (suiteId && clase) {
            setExpandedClasses(prev => ({ ...prev, [`${suiteId}::${clase}`]: true }));
          }
        } else if (resultado === 'passed') {
          addLog('test', `✓ ${nombre}`);
        }
        break;
      }

      case 'failure_detail': {
        const { nombre, clase, traceback, nodeid } = data;
        const suiteId = findSuiteForNodeid(nodeid || '');

        setPytestResults(prev => {
          const sid = suiteId || Object.keys(prev).find(k => prev[k]?.estado === 'running') || '';
          if (!sid || !prev[sid]) return prev;
          const existing = prev[sid];
          const updatedTests = existing.tests.map(t =>
            t.nombre === nombre && t.clase === clase
              ? { ...t, mensaje_error: traceback || t.mensaje_error }
              : t
          );
          return { ...prev, [sid]: { ...existing, tests: updatedTests } };
        });
        // Auto-expand traceback for failed tests
        const tbKey = `${clase}::${nombre}`;
        setExpandedTracebacks(prev => ({ ...prev, [tbKey]: true }));
        break;
      }

      case 'suite_end': {
        addLog('info', `✔ ${data.nombre}: ${data.passed}/${data.total} (${data.duracion}s)`);
        setPytestResults(prev => ({
          ...prev,
          [data.suite]: {
            suite: data.suite,
            nombre: data.nombre,
            total: data.total,
            passed: data.passed,
            failed: data.failed,
            errores: data.errores || 0,
            skipped: data.skipped,
            duracion: data.duracion,
            tests: data.tests?.map((t: any) => ({ ...t, duracion: t.duracion || 0 })) || prev[data.suite]?.tests || [],
            estado: 'done',
          },
        }));
        break;
      }

      case 'done':
        addLog('done', 'Ejecución completada');
        break;

      case 'error':
        addLog('error', data.mensaje || 'Error desconocido');
        toast.error(data.mensaje || 'Error desconocido');
        break;
    }
  }

  function findSuiteForNodeid(nodeid: string): string | null {
    for (const [sid, info] of Object.entries(TEST_SUITES_MAP)) {
      if (nodeid.includes(info)) return sid;
    }
    return null;
  }

  function cancelPytest() {
    if (abortRef.current) {
      abortRef.current.abort();
      setPytestRunning(null);
      if (pytestTimerRef.current) clearInterval(pytestTimerRef.current);
    }
  }

  function toggleClass(key: string) {
    setExpandedClasses(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleTraceback(key: string) {
    setExpandedTracebacks(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function groupByClass(tests: PytestResult[]) {
    const groups: Record<string, PytestResult[]> = {};
    for (const t of tests) {
      const key = t.clase || 'General';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return groups;
  }

  function pytestStatusIcon(r: string) {
    if (r === 'passed') return '✅';
    if (r === 'failed') return '❌';
    if (r === 'skipped') return '⏭️';
    return '⚠️';
  }

  function pytestStatusColor(r: string) {
    if (r === 'passed') return 'text-green-600';
    if (r === 'failed') return 'text-red-600';
    if (r === 'skipped') return 'text-yellow-600';
    return 'text-orange-600';
  }

  function classSummary(tests: PytestResult[]) {
    const p = tests.filter(t => t.resultado === 'passed').length;
    const f = tests.filter(t => t.resultado === 'failed').length;
    return { passed: p, failed: f, total: tests.length };
  }

  const pytestTotals = Object.values(pytestResults).reduce(
    (acc, r) => ({ total: acc.total + (r.total || 0), passed: acc.passed + (r.passed || 0), failed: acc.failed + (r.failed || 0), skipped: acc.skipped + (r.skipped || 0) }),
    { total: 0, passed: 0, failed: 0, skipped: 0 }
  );

  const tests: TestSpec[] = useMemo(() => {
    const expect = (cond: boolean, msg: string) => {
      if (!cond) throw new Error(msg);
    };

    return [
      {
        id: 'health',
        nombre: 'Health check',
        metodo: 'GET',
        endpoint: '/api/v1/health',
        run: async () => {
          const res = await axios.get(`${API_URL}/api/v1/health`, { timeout: 15000, withCredentials: true });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data?.status === 'healthy', 'status != healthy');
        },
      },
      {
        id: 'auth_me',
        nombre: 'Sesión y rol (auth/me)',
        metodo: 'GET',
        endpoint: '/api/v1/auth/me',
        run: async () => {
          const res = await apiClient.get('/auth/me', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(String(res.data?.rol || '').toLowerCase() === 'sysowner', 'El usuario no es sysowner según backend');
        },
      },
      {
        id: 'openapi',
        nombre: 'OpenAPI disponible',
        metodo: 'GET',
        endpoint: '/openapi.json',
        run: async () => {
          const res = await axios.get(`${API_URL}/openapi.json`, { timeout: 15000, withCredentials: true });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(!!res.data?.paths, 'OpenAPI sin paths');
        },
      },
      {
        id: 'plataformas',
        nombre: 'Plataformas (listado)',
        metodo: 'GET',
        endpoint: '/api/v1/plataformas',
        run: async () => {
          const res = await apiClient.get('/plataformas', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && Array.isArray(res.data.plataformas), 'No tiene campo plataformas');
        },
      },
      {
        id: 'anuncios_changelog',
        nombre: 'Anuncios / changelog',
        metodo: 'GET',
        endpoint: '/api/v1/anuncios/changelog',
        run: async () => {
          const res = await apiClient.get('/anuncios/changelog', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'Respuesta no es array');
        },
      },
      {
        id: 'tickets_stats',
        nombre: 'Tickets (estadísticas sysowner)',
        metodo: 'GET',
        endpoint: '/api/v1/tickets/estadisticas/resumen',
        run: async () => {
          const res = await apiClient.get('/tickets/estadisticas/resumen', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(typeof res.data?.total === 'number', 'Falta total');
          expect(!!res.data?.por_estado, 'Falta por_estado');
        },
      },
      {
        id: 'api_stats',
        nombre: 'Admin API stats',
        metodo: 'GET',
        endpoint: '/api/v1/admin/api-stats',
        run: async () => {
          const res = await apiClient.get('/admin/api-stats?horas=24', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(typeof res.data?.total_peticiones === 'number', 'Falta total_peticiones');
        },
      },
      {
        id: 'paqueteria_resumen_cajas',
        nombre: 'Paquetería (resumen stock cajas)',
        metodo: 'GET',
        endpoint: '/api/v1/paqueteria/tipos-caja/resumen',
        run: async () => {
          const res = await apiClient.get('/paqueteria/tipos-caja/resumen', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'Respuesta no es array');
        },
      },
      {
        id: 'desguace_info',
        nombre: 'Desguace (info base)',
        metodo: 'GET',
        endpoint: '/api/v1/desguace/info',
        run: async () => {
          const res = await apiClient.get('/desguace/info', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          // puede que no exista base, pero debe responder con estructura JSON válida
          expect(typeof res.data === 'object' && res.data != null, 'Respuesta no es objeto');
        },
      },

      // ───────── AUTH ─────────
      {
        id: 'auth_usuarios',
        nombre: 'Auth (listar usuarios)',
        metodo: 'GET',
        endpoint: '/api/v1/auth/usuarios',
        run: async () => {
          const res = await apiClient.get('/auth/usuarios', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && Array.isArray(res.data.usuarios), 'No tiene campo usuarios');
        },
      },
      {
        id: 'auth_entornos',
        nombre: 'Auth (listar entornos)',
        metodo: 'GET',
        endpoint: '/api/v1/auth/entornos',
        run: async () => {
          const res = await apiClient.get('/auth/entornos', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },
      {
        id: 'auth_usuarios_admin',
        nombre: 'Auth (usuarios-admin)',
        metodo: 'GET',
        endpoint: '/api/v1/auth/usuarios-admin',
        run: async () => {
          const res = await apiClient.get('/auth/usuarios-admin', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && Array.isArray(res.data.usuarios), 'No tiene campo usuarios');
        },
      },

      // ───────── DESGUACE (extras) ─────────
      {
        id: 'desguace_campos',
        nombre: 'Desguace (campos CSV)',
        metodo: 'GET',
        endpoint: '/api/v1/desguace/campos',
        run: async () => {
          const res = await apiClient.get('/desguace/campos', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && Array.isArray(res.data.campos), 'No tiene campo campos');
        },
      },
      {
        id: 'desguace_ventas',
        nombre: 'Desguace (ventas)',
        metodo: 'GET',
        endpoint: '/api/v1/desguace/ventas',
        run: async () => {
          const res = await apiClient.get('/desguace/ventas?limit=5', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },
      {
        id: 'desguace_ventas_resumen',
        nombre: 'Desguace (resumen ventas)',
        metodo: 'GET',
        endpoint: '/api/v1/desguace/ventas/resumen',
        run: async () => {
          const res = await apiClient.get('/desguace/ventas/resumen', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(typeof res.data === 'object', 'No es objeto');
        },
      },
      {
        id: 'desguace_stock',
        nombre: 'Desguace (stock)',
        metodo: 'GET',
        endpoint: '/api/v1/desguace/stock',
        run: async () => {
          const res = await apiClient.get('/desguace/stock?limit=5', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },
      {
        id: 'desguace_stock_resumen',
        nombre: 'Desguace (resumen stock)',
        metodo: 'GET',
        endpoint: '/api/v1/desguace/stock/resumen',
        run: async () => {
          const res = await apiClient.get('/desguace/stock/resumen', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(typeof res.data === 'object', 'No es objeto');
        },
      },
      {
        id: 'desguace_estudio_marcas',
        nombre: 'Desguace (marcas coches)',
        metodo: 'GET',
        endpoint: '/api/v1/desguace/estudio-coches/marcas',
        run: async () => {
          const res = await apiClient.get('/desguace/estudio-coches/marcas', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && Array.isArray(res.data.marcas), 'No tiene campo marcas');
        },
      },
      {
        id: 'desguace_buscar',
        nombre: 'Desguace (buscar pieza)',
        metodo: 'GET',
        endpoint: '/api/v1/desguace/buscar',
        run: async () => {
          const res = await apiClient.get('/desguace/buscar?q=TEST000', { timeout: 15000, validateStatus: (s: number) => s < 500 });
          expect(res.status < 500, `Server error: HTTP ${res.status}`);
        },
      },

      // ───────── FICHADAS ─────────
      {
        id: 'fichadas_resumen_equipo',
        nombre: 'Fichadas (resumen equipo)',
        metodo: 'GET',
        endpoint: '/api/v1/fichadas/resumen-equipo',
        run: async () => {
          const res = await apiClient.get('/fichadas/resumen-equipo', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },
      {
        id: 'fichadas_resumen_dia',
        nombre: 'Fichadas (resumen día)',
        metodo: 'GET',
        endpoint: '/api/v1/fichadas/resumen-dia',
        run: async () => {
          const res = await apiClient.get('/fichadas/resumen-dia', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },
      {
        id: 'fichadas_mis',
        nombre: 'Fichadas (mis fichadas)',
        metodo: 'GET',
        endpoint: '/api/v1/fichadas/mis-fichadas',
        run: async () => {
          const res = await apiClient.get('/fichadas/mis-fichadas', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },

      // ───────── PRECIOS ─────────
      {
        id: 'precios_plataformas',
        nombre: 'Precios (plataformas dispo)',
        metodo: 'GET',
        endpoint: '/api/v1/precios/plataformas-disponibles',
        run: async () => {
          const res = await apiClient.get('/precios/plataformas-disponibles', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && typeof res.data.plataformas === 'object', 'No tiene campo plataformas');
        },
      },

      // ───────── TOKEN ─────────
      {
        id: 'token_obtener',
        nombre: 'Token (obtener)',
        metodo: 'GET',
        endpoint: '/api/v1/token/obtener',
        run: async () => {
          const res = await apiClient.get('/token/obtener', { timeout: 15000, validateStatus: (s: number) => s < 500 });
          expect(res.status < 500, `Server error: HTTP ${res.status}`);
        },
      },

      // ───────── PRECIOS CONFIG ─────────
      {
        id: 'precios_config_estado',
        nombre: 'Precios Config (estado)',
        metodo: 'GET',
        endpoint: '/api/v1/precios-config/estado',
        run: async () => {
          const res = await apiClient.get('/precios-config/estado', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(typeof res.data === 'object', 'No es objeto');
        },
      },
      {
        id: 'precios_config_piezas',
        nombre: 'Precios Config (piezas-familia)',
        metodo: 'GET',
        endpoint: '/api/v1/precios-config/piezas-familia',
        run: async () => {
          const res = await apiClient.get('/precios-config/piezas-familia', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },
      {
        id: 'precios_config_familias',
        nombre: 'Precios Config (familias)',
        metodo: 'GET',
        endpoint: '/api/v1/precios-config/familias-precios',
        run: async () => {
          const res = await apiClient.get('/precios-config/familias-precios', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },
      {
        id: 'precios_config_entornos',
        nombre: 'Precios Config (entornos)',
        metodo: 'GET',
        endpoint: '/api/v1/precios-config/entornos',
        run: async () => {
          const res = await apiClient.get('/precios-config/entornos', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },

      // ───────── PIEZAS ─────────
      {
        id: 'piezas_recientes',
        nombre: 'Piezas (recientes)',
        metodo: 'GET',
        endpoint: '/api/v1/piezas/recientes',
        run: async () => {
          const res = await apiClient.get('/piezas/recientes', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && Array.isArray(res.data.piezas), 'No tiene campo piezas');
        },
      },
      {
        id: 'piezas_csv_guardados',
        nombre: 'Piezas (CSVs guardados)',
        metodo: 'GET',
        endpoint: '/api/v1/piezas/csv-guardados',
        run: async () => {
          const res = await apiClient.get('/piezas/csv-guardados', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && Array.isArray(res.data.archivos), 'No tiene campo archivos');
        },
      },
      {
        id: 'piezas_pedidas',
        nombre: 'Piezas (pedidas)',
        metodo: 'GET',
        endpoint: '/api/v1/piezas/pedidas',
        run: async () => {
          const res = await apiClient.get('/piezas/pedidas', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && Array.isArray(res.data.piezas), 'No tiene campo piezas');
        },
      },

      // ───────── STOCKEO ─────────
      {
        id: 'stockeo_campos',
        nombre: 'Stockeo (campos disponibles)',
        metodo: 'GET',
        endpoint: '/api/v1/stockeo/campos-disponibles',
        run: async () => {
          const res = await apiClient.get('/stockeo/campos-disponibles', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },
      {
        id: 'stockeo_configuraciones',
        nombre: 'Stockeo (configuraciones)',
        metodo: 'GET',
        endpoint: '/api/v1/stockeo/configuraciones',
        run: async () => {
          const res = await apiClient.get('/stockeo/configuraciones', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },

      // ───────── TICKETS ─────────
      {
        id: 'tickets_mis',
        nombre: 'Tickets (mis tickets)',
        metodo: 'GET',
        endpoint: '/api/v1/tickets/mis-tickets',
        run: async () => {
          const res = await apiClient.get('/tickets/mis-tickets', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },
      {
        id: 'tickets_todos',
        nombre: 'Tickets (todos - admin)',
        metodo: 'GET',
        endpoint: '/api/v1/tickets/todos',
        run: async () => {
          const res = await apiClient.get('/tickets/todos', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },

      // ───────── ANUNCIOS ─────────
      {
        id: 'anuncios_no_leidos',
        nombre: 'Anuncios (no leídos)',
        metodo: 'GET',
        endpoint: '/api/v1/anuncios/no-leidos',
        run: async () => {
          const res = await apiClient.get('/anuncios/no-leidos', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },
      {
        id: 'anuncios_admin_todos',
        nombre: 'Anuncios (todos - admin)',
        metodo: 'GET',
        endpoint: '/api/v1/anuncios/admin/todos',
        run: async () => {
          const res = await apiClient.get('/anuncios/admin/todos', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },

      // ───────── PAQUETERÍA ─────────
      {
        id: 'paqueteria_sucursales',
        nombre: 'Paquetería (sucursales)',
        metodo: 'GET',
        endpoint: '/api/v1/paqueteria/sucursales',
        run: async () => {
          const res = await apiClient.get('/paqueteria/sucursales', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },
      {
        id: 'paqueteria_ranking',
        nombre: 'Paquetería (ranking)',
        metodo: 'GET',
        endpoint: '/api/v1/paqueteria/ranking',
        run: async () => {
          const res = await apiClient.get('/paqueteria/ranking', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(res.data && typeof res.data === 'object' && 'usuarios' in res.data, 'No tiene campo usuarios');
        },
      },
      {
        id: 'paqueteria_mis',
        nombre: 'Paquetería (mis registros)',
        metodo: 'GET',
        endpoint: '/api/v1/paqueteria/mis-registros',
        run: async () => {
          const res = await apiClient.get('/paqueteria/mis-registros', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },
      {
        id: 'paqueteria_todos',
        nombre: 'Paquetería (todos registros)',
        metodo: 'GET',
        endpoint: '/api/v1/paqueteria/todos-registros',
        run: async () => {
          const res = await apiClient.get('/paqueteria/todos-registros', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },
      {
        id: 'paqueteria_tipos_caja',
        nombre: 'Paquetería (tipos caja)',
        metodo: 'GET',
        endpoint: '/api/v1/paqueteria/tipos-caja',
        run: async () => {
          const res = await apiClient.get('/paqueteria/tipos-caja', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },
      {
        id: 'paqueteria_estadisticas',
        nombre: 'Paquetería (estadísticas)',
        metodo: 'GET',
        endpoint: '/api/v1/paqueteria/estadisticas',
        run: async () => {
          const res = await apiClient.get('/paqueteria/estadisticas', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(typeof res.data === 'object', 'No es objeto');
        },
      },

      // ───────── ADMIN ─────────
      {
        id: 'admin_audit_logs',
        nombre: 'Admin (audit logs)',
        metodo: 'GET',
        endpoint: '/api/v1/admin/audit-logs',
        run: async () => {
          const res = await apiClient.get('/admin/audit-logs?limit=5', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },
      {
        id: 'admin_audit_acciones',
        nombre: 'Admin (acciones auditoría)',
        metodo: 'GET',
        endpoint: '/api/v1/admin/audit-logs/acciones',
        run: async () => {
          const res = await apiClient.get('/admin/audit-logs/acciones', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data) || (res.data && typeof res.data === 'object'), 'Respuesta inválida');
        },
      },
      {
        id: 'admin_backups',
        nombre: 'Admin (backups)',
        metodo: 'GET',
        endpoint: '/api/v1/admin/backups',
        run: async () => {
          const res = await apiClient.get('/admin/backups', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },
      {
        id: 'admin_backups_stats',
        nombre: 'Admin (stats backups)',
        metodo: 'GET',
        endpoint: '/api/v1/admin/backups/estadisticas',
        run: async () => {
          const res = await apiClient.get('/admin/backups/estadisticas', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(typeof res.data === 'object', 'No es objeto');
        },
      },
      {
        id: 'admin_scheduler',
        nombre: 'Admin (scheduler estado)',
        metodo: 'GET',
        endpoint: '/api/v1/admin/scheduler/estado',
        run: async () => {
          const res = await apiClient.get('/admin/scheduler/estado', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(typeof res.data === 'object', 'No es objeto');
        },
      },
      {
        id: 'admin_api_logs',
        nombre: 'Admin (API logs)',
        metodo: 'GET',
        endpoint: '/api/v1/admin/api-logs',
        run: async () => {
          const res = await apiClient.get('/admin/api-logs?limit=5', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
        },
      },
      {
        id: 'admin_api_logs_entornos',
        nombre: 'Admin (entornos con logs)',
        metodo: 'GET',
        endpoint: '/api/v1/admin/api-logs/entornos',
        run: async () => {
          const res = await apiClient.get('/admin/api-logs/entornos', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },

      // ───────── TESTS ─────────
      {
        id: 'tests_suites',
        nombre: 'Tests (suites disponibles)',
        metodo: 'GET',
        endpoint: '/api/v1/tests/suites',
        run: async () => {
          const res = await apiClient.get('/tests/suites', { timeout: 15000 });
          expect(res.status === 200, `HTTP ${res.status}`);
          expect(Array.isArray(res.data), 'No es array');
        },
      },

      // ───────── REFERENCIAS (POST seguro) ─────────
      {
        id: 'referencias_buscar',
        nombre: 'Referencias (búsqueda)',
        metodo: 'POST',
        endpoint: '/api/v1/referencias/buscar',
        run: async () => {
          const res = await apiClient.post('/referencias/buscar', { referencia: 'TEST000' }, { timeout: 15000, validateStatus: (s: number) => s < 500 });
          expect(res.status < 500, `Server error: HTTP ${res.status}`);
        },
      },

      // ───────── STOCK (POST seguro) ─────────
      {
        id: 'stock_verificar',
        nombre: 'Stock (verificar pieza)',
        metodo: 'POST',
        endpoint: '/api/v1/stock/verificar',
        run: async () => {
          const res = await apiClient.post('/stock/verificar', { referencia: 'TEST000' }, { timeout: 15000, validateStatus: (s: number) => s < 500 });
          expect(res.status < 500, `Server error: HTTP ${res.status}`);
        },
      },

      // ───────── eBay ─────────
      {
        id: 'ebay_account_deletion',
        nombre: 'eBay (account deletion)',
        metodo: 'GET',
        endpoint: '/api/v1/ebay/account-deletion',
        run: async () => {
          const res = await axios.get(`${API_URL}/api/v1/ebay/account-deletion`, { timeout: 15000, validateStatus: (s: number) => s < 500 });
          expect(res.status < 500, `Server error: HTTP ${res.status}`);
        },
      },
    ];
  }, []);

  const totals = useMemo(() => {
    const all = tests.length;
    const vals = tests.map((t) => results[t.id]?.status || 'idle');
    const pass = vals.filter((s) => s === 'pass').length;
    const fail = vals.filter((s) => s === 'fail').length;
    const runningCount = vals.filter((s) => s === 'running').length;
    const idle = vals.filter((s) => s === 'idle').length;
    return { all, pass, fail, running: runningCount, idle };
  }, [results, tests]);

  const reset = () => {
    setResults({});
    setStartedAt(null);
    setFinishedAt(null);
  };

  const runAll = async () => {
    if (running) return;
    setRunning(true);
    setStartedAt(performance.now());
    setFinishedAt(null);

    try {
      for (const test of tests) {
        setResults((prev) => ({ ...prev, [test.id]: { id: test.id, status: 'running' } }));
        const t0 = performance.now();
        try {
          await test.run();
          const ms = Math.round(performance.now() - t0);
          setResults((prev) => ({ ...prev, [test.id]: { id: test.id, status: 'pass', ms } }));
        } catch (err: unknown) {
          const ms = Math.round(performance.now() - t0);
          let detalle = 'Error desconocido';
          let httpStatus: number | undefined;
          if (axios.isAxiosError(err)) {
            httpStatus = err.response?.status;
            detalle = err.response?.data?.detail || err.message;
          } else if (err instanceof Error) {
            detalle = err.message;
          }
          setResults((prev) => ({
            ...prev,
            [test.id]: { id: test.id, status: 'fail', ms, httpStatus, detalle },
          }));
        }
      }
    } finally {
      setFinishedAt(performance.now());
      setRunning(false);
      if (totals.fail === 0) {
        toast.success('Tests completados: todo OK');
      } else {
        toast.error('Tests completados: hay fallos');
      }
    }
  };

  if (!mounted || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando…</p>
        </div>
      </div>
    );
  }

  if (user.rol !== 'sysowner') return null;

  const totalMs = startedAt != null && finishedAt != null ? Math.round(finishedAt - startedAt) : null;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              <ArrowLeftIcon />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Tests del Sistema</h1>
              <p className="text-sm text-gray-500">Smoke tests de endpoints y contratos básicos (solo sysowner)</p>
            </div>
          </div>
          <span className="text-sm text-gray-500">{user.email}</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-200 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('smoke')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'smoke' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
          >
            🔌 Smoke Tests
          </button>
          <button
            onClick={() => setActiveTab('pytest')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'pytest' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
          >
            🧪 Tests Unitarios ({pytestTotals.total > 0 ? `${pytestTotals.passed}/${pytestTotals.total}` : 'pytest'})
          </button>
        </div>

        {activeTab === 'smoke' && (
          <>
        <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={runAll}
              disabled={running}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {running ? 'Ejecutando…' : 'Probar todo'}
            </button>
            <button
              onClick={reset}
              disabled={running}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Reset
            </button>
            <div className="text-sm text-gray-600">
              <span className="font-medium text-green-700">{totals.pass} OK</span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="font-medium text-red-700">{totals.fail} fallos</span>
              <span className="mx-2 text-gray-300">|</span>
              <span>{totals.all} total</span>
              {totalMs != null && (
                <>
                  <span className="mx-2 text-gray-300">|</span>
                  <span className="font-mono">{totalMs} ms</span>
                </>
              )}
            </div>
          </div>
          <div className="text-xs text-gray-500">
            API: <span className="font-mono">{API_URL}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Test</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Método</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Endpoint</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tiempo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HTTP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Detalle (si falla)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tests.map((t) => {
                  const r = results[t.id];
                  const status: TestStatus = r?.status || 'idle';
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <Badge status={status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium whitespace-nowrap">{t.nombre}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{t.metodo}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono whitespace-nowrap">{t.endpoint}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{r?.ms != null ? `${r.ms} ms` : '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{r?.httpStatus != null ? r.httpStatus : '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-lg truncate" title={r?.detalle || ''}>
                        {status === 'fail' ? r?.detalle || 'Error' : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-4">
          Estos tests son “smoke tests”: validan que la API responde y mantiene estructura básica. No ejecutan flujos destructivos (no crean/borran datos).
        </div>          </>
        )}

        {activeTab === 'pytest' && (
          <div className="space-y-4">
            {/* Resumen global pytest */}
            {pytestTotals.total > 0 && (
              <div className={`rounded-xl p-4 border-2 ${pytestTotals.failed > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{pytestRunning ? '🔄' : pytestTotals.failed > 0 ? '❌' : '✅'}</span>
                    <div>
                      <p className="font-bold text-lg">{pytestTotals.passed}/{pytestTotals.total} tests pasados</p>
                      <p className="text-sm text-gray-600">
                        {pytestTotals.failed > 0 && <span className="text-red-600 font-medium">{pytestTotals.failed} fallidos · </span>}
                        {pytestTotals.skipped > 0 && <span className="text-yellow-600">{pytestTotals.skipped} saltados · </span>}
                        {Object.keys(pytestResults).length} suites
                        {pytestRunning && <span className="text-blue-600 ml-2">⏱ {pytestElapsed}s</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center"><p className="text-2xl font-bold text-green-600">{pytestTotals.passed}</p><p className="text-xs text-gray-500">Pasados</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-red-600">{pytestTotals.failed}</p><p className="text-xs text-gray-500">Fallidos</p></div>
                    <div className="text-center"><p className="text-2xl font-bold text-yellow-600">{pytestTotals.skipped}</p><p className="text-xs text-gray-500">Saltados</p></div>
                  </div>
                </div>
                <div className="mt-3 h-3 bg-gray-200 rounded-full overflow-hidden flex">
                  {pytestTotals.passed > 0 && <div className="bg-green-500 h-full transition-all duration-300" style={{ width: `${(pytestTotals.passed / pytestTotals.total) * 100}%` }} />}
                  {pytestTotals.failed > 0 && <div className="bg-red-500 h-full transition-all duration-300" style={{ width: `${(pytestTotals.failed / pytestTotals.total) * 100}%` }} />}
                  {pytestTotals.skipped > 0 && <div className="bg-yellow-400 h-full transition-all duration-300" style={{ width: `${(pytestTotals.skipped / pytestTotals.total) * 100}%` }} />}
                </div>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 items-center">
              <button
                onClick={() => ejecutarPytest('todos')}
                disabled={pytestRunning !== null}
                className={`px-6 py-3 rounded-xl font-bold text-white transition shadow-lg ${pytestRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'}`}
              >
                {pytestRunning === 'todos' ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Ejecutando todos... ({pytestElapsed}s)
                  </span>
                ) : '▶ Ejecutar Todos los Tests'}
              </button>
              {pytestRunning && (
                <button onClick={cancelPytest} className="px-4 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition shadow">
                  ⏹ Cancelar
                </button>
              )}
            </div>

            {/* Suites */}
            {pytestSuites.map(suite => {
              const result = pytestResults[suite.id];
              const isRunning = pytestRunning === suite.id || (pytestRunning === 'todos' && result?.estado === 'running');
              const isCollecting = result?.estado === 'collecting';
              const isDone = result?.estado === 'done';
              const completedCount = result?.tests?.length || 0;
              const totalExpected = result?.total || 0;

              return (
                <div key={suite.id} className={`bg-white rounded-xl shadow border overflow-hidden transition-all ${isRunning ? 'border-blue-400 ring-2 ring-blue-100' : isDone && result?.failed === 0 ? 'border-green-200' : isDone && result?.failed > 0 ? 'border-red-200' : 'border-gray-200'}`}>
                  <div className="p-4 flex items-center justify-between bg-gray-50 border-b flex-wrap gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h2 className="font-bold text-lg text-gray-800">{suite.nombre}</h2>
                        {result && isDone && (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${result.failed > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {result.passed}/{result.total}
                          </span>
                        )}
                        {isRunning && totalExpected > 0 && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 animate-pulse">
                            {completedCount}/{totalExpected}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-sm">{suite.descripcion}</p>
                      <p className="text-gray-400 text-xs mt-1 font-mono">{suite.archivo}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isDone && <span className="text-xs text-gray-400">{result?.duracion}s</span>}
                      <button
                        onClick={() => ejecutarPytest(suite.id)}
                        disabled={pytestRunning !== null}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${pytestRunning !== null ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      >
                        {isRunning ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            {completedCount}/{totalExpected}
                          </span>
                        ) : '▶ Ejecutar'}
                      </button>
                    </div>
                  </div>

                  {/* Progress bar while running */}
                  {isRunning && totalExpected > 0 && (
                    <div className="h-1.5 bg-gray-100">
                      <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(completedCount / totalExpected) * 100}%` }} />
                    </div>
                  )}

                  {/* Test results grouped by class */}
                  {result && result.tests.length > 0 && (
                    <div className="divide-y divide-gray-100">
                      {Object.entries(groupByClass(result.tests)).map(([clase, tests]) => {
                        const key = `${suite.id}::${clase}`;
                        const expanded = expandedClasses[key] ?? false;
                        const summary = classSummary(tests);
                        const hasFailed = summary.failed > 0;

                        return (
                          <div key={key}>
                            <button onClick={() => toggleClass(key)} className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition text-left ${hasFailed ? 'bg-red-50/50' : ''}`}>
                              <div className="flex items-center gap-3">
                                <span className="text-gray-400 text-sm">{expanded ? '▼' : '▶'}</span>
                                <span className={`font-medium ${hasFailed ? 'text-red-700' : 'text-gray-700'}`}>{clase}</span>
                                <span className={`text-xs font-medium ${hasFailed ? 'text-red-600' : 'text-green-600'}`}>
                                  {summary.passed}/{summary.total}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                {tests.map((t, i) => (
                                  <span key={i} className={`w-2.5 h-2.5 rounded-full ${t.resultado === 'passed' ? 'bg-green-400' : t.resultado === 'failed' ? 'bg-red-400' : t.resultado === 'skipped' ? 'bg-yellow-400' : 'bg-gray-300'}`} title={t.nombre} />
                                ))}
                              </div>
                            </button>

                            {expanded && (
                              <div className="bg-gray-50 px-4 pb-3">
                                {tests.map((t, i) => {
                                  const tbKey = `${t.clase}::${t.nombre}`;
                                  const tbExpanded = expandedTracebacks[tbKey] ?? false;
                                  const hasTrace = t.mensaje_error && t.mensaje_error.length > 80;

                                  return (
                                    <div key={i} className={`py-2 ${i > 0 ? 'border-t border-gray-200' : ''}`}>
                                      <div className="flex items-start gap-3">
                                        <span className="text-sm mt-0.5">{pytestStatusIcon(t.resultado)}</span>
                                        <div className="flex-1 min-w-0">
                                          <p className={`text-sm font-mono ${pytestStatusColor(t.resultado)}`}>{t.nombre}</p>
                                          {t.descripcion && (
                                            <p className="text-xs text-gray-400 italic mt-0.5">{t.descripcion}</p>
                                          )}
                                          {t.mensaje_error && !hasTrace && (
                                            <p className="text-xs text-red-500 mt-1 bg-red-50 p-2 rounded font-mono break-all whitespace-pre-wrap">{t.mensaje_error}</p>
                                          )}
                                          {hasTrace && (
                                            <div className="mt-1">
                                              <button
                                                onClick={() => toggleTraceback(tbKey)}
                                                className="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                                              >
                                                <span>{tbExpanded ? '▼' : '▶'}</span>
                                                <span>{tbExpanded ? 'Ocultar traceback' : 'Ver traceback completo'}</span>
                                              </button>
                                              {tbExpanded && (
                                                <pre className="text-xs text-red-700 mt-2 bg-red-50 border border-red-200 p-3 rounded-lg font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                                                  {t.mensaje_error}
                                                </pre>
                                              )}
                                              {!tbExpanded && (
                                                <p className="text-xs text-red-500 mt-1 bg-red-50 p-2 rounded font-mono truncate">{t.mensaje_error?.split('\n').pop()}</p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        {t.duracion > 0 && <span className="text-xs text-gray-400 whitespace-nowrap">{t.duracion}s</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!result && !isRunning && (
                    <div className="p-6 text-center text-gray-400 text-sm">Pulsa ejecutar para ver los resultados</div>
                  )}

                  {isRunning && result?.tests.length === 0 && (
                    <div className="p-8 text-center">
                      <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      <p className="text-gray-500 text-sm">Recopilando tests...</p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live log */}
            {pytestLogs.length > 0 && (
              <div className="bg-gray-900 rounded-xl overflow-hidden shadow">
                <div className="px-4 py-2 bg-gray-800 flex items-center justify-between">
                  <span className="text-gray-300 text-sm font-medium">📋 Log en tiempo real</span>
                  <span className="text-gray-500 text-xs">{pytestLogs.length} entradas</span>
                </div>
                <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5" ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
                  {pytestLogs.map((log, i) => (
                    <div key={i} className={`${log.tipo === 'error' ? 'text-red-400' : log.tipo === 'done' ? 'text-green-400 font-bold' : log.tipo === 'test' ? 'text-gray-500' : 'text-blue-300'}`}>
                      {log.mensaje}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-gray-600 bg-purple-50 border border-purple-200 rounded-lg p-4">
              Estos son tests unitarios e integración completos ejecutados con <span className="font-mono font-bold">pytest</span>. Los resultados se muestran en tiempo real conforme se ejecutan. Haz clic en las clases fallidas para ver el traceback completo.
            </div>
          </div>
        )}      </main>
    </div>
  );
}

