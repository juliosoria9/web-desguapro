import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../lib/auth-store';
import ProtectedRoute from '../components/ProtectedRoute';

interface FichadaResponse {
  success: boolean;
  fichada_id: number;
  id_pieza: string;
  descripcion: string;
  fecha_fichada: string;
}

export default function EscanerPage() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const scannerRef = useRef<any>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  
  const [codigoManual, setCodigoManual] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [ultimasFichadas, setUltimasFichadas] = useState<FichadaResponse[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [usandoCamara, setUsandoCamara] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [scannerListo, setScannerListo] = useState(false);

  // Registrar fichada
  const registrarFichada = useCallback(async (codigo: string) => {
    if (enviando) return;
    if (!codigo.trim()) {
      setMensaje({ tipo: 'error', texto: 'El código no puede estar vacío' });
      return;
    }

    setEnviando(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/fichadas/registrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          id_pieza: codigo.trim().toUpperCase(),
          descripcion: descripcion.trim() || null
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMensaje({ tipo: 'success', texto: `✓ Fichada: ${data.id_pieza}` });
        setUltimasFichadas(prev => [data, ...prev.slice(0, 9)]);
        setCodigoManual('');
        setDescripcion('');
        
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }
        
        setTimeout(() => setMensaje(null), 3000);
      } else {
        setMensaje({ tipo: 'error', texto: data.detail || 'Error al fichar' });
      }
    } catch (error) {
      setMensaje({ tipo: 'error', texto: 'Error de conexión' });
    } finally {
      setEnviando(false);
    }
  }, [enviando, token, descripcion]);

  // Detener cámara
  const detenerCamara = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        console.log('Error deteniendo scanner:', e);
      }
      scannerRef.current = null;
    }
    setUsandoCamara(false);
    setScannerListo(false);
  }, []);

  // Iniciar cámara con html5-qrcode
  const iniciarCamara = async () => {
    try {
      setCameraError(null);
      setUsandoCamara(true); // Mostrar contenedor primero
      
      // Pequeño delay para que el DOM se actualice
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Importar dinámicamente para evitar SSR issues
      const { Html5Qrcode } = await import('html5-qrcode');
      
      // Crear instancia del scanner
      const html5QrCode = new Html5Qrcode("scanner-container");
      scannerRef.current = html5QrCode;
      
      // Configuración del scanner - mostrar video completo
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 80 },
        aspectRatio: 1.5,
        showTorchButtonIfSupported: true,
        showZoomSliderIfSupported: true,
        defaultZoomValueIfSupported: 2,
      };
      
      // Callback cuando se detecta un código
      const onScanSuccess = (decodedText: string) => {
        console.log('Código detectado:', decodedText);
        
        // Vibrar
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
        
        // Detener scanner y registrar
        detenerCamara();
        setCodigoManual(decodedText.toUpperCase());
        registrarFichada(decodedText);
      };
      
      // Iniciar con cámara trasera
      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        () => {} // Ignorar errores de frames sin código
      );
      
      setScannerListo(true);
      
    } catch (error: any) {
      console.error('Error iniciando cámara:', error);
      setUsandoCamara(false);
      if (error.message?.includes('Permission') || error.name === 'NotAllowedError') {
        setCameraError('Permiso de cámara denegado. Permite el acceso a la cámara o usa entrada manual.');
      } else if (error.message?.includes('NotFound') || error.name === 'NotFoundError') {
        setCameraError('No se encontró cámara en el dispositivo.');
      } else {
        setCameraError(`Error: ${error.message || 'No se pudo acceder a la cámara'}`);
      }
    }
  };

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100">
        {/* Header compacto */}
        <header className="bg-indigo-600 text-white py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="text-white hover:bg-indigo-500 p-1 rounded"
                title="Volver"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-bold">📱 Escáner</h1>
            </div>
            <button
              onClick={() => router.push('/fichadas')}
              className="text-sm bg-indigo-500 px-3 py-1 rounded hover:bg-indigo-400"
            >
              Ver Fichadas
            </button>
          </div>
          <p className="text-indigo-200 text-sm mt-1">
            Escanea o escribe el código de la pieza
          </p>
        </header>

        <main className="p-4 max-w-md mx-auto">
          {/* Mensaje de feedback */}
          {mensaje && (
            <div className={`mb-4 p-3 rounded-lg text-center font-medium ${
              mensaje.tipo === 'success' 
                ? 'bg-green-100 text-green-800 border border-green-300' 
                : 'bg-red-100 text-red-800 border border-red-300'
            }`}>
              {mensaje.texto}
            </div>
          )}

          {/* Área de cámara */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h2 className="font-semibold mb-3 text-gray-700">📷 Escanear con cámara</h2>
            
            {cameraError && (
              <div className="text-amber-600 text-sm mb-3 p-2 bg-amber-50 rounded">
                ⚠️ {cameraError}
              </div>
            )}
            
            {usandoCamara ? (
              <div className="relative">
                <div 
                  id="scanner-container" 
                  ref={scannerContainerRef}
                  className="w-full rounded overflow-hidden bg-black"
                  style={{ minHeight: '300px' }}
                />
                <style jsx global>{`
                  #scanner-container video {
                    width: 100% !important;
                    height: auto !important;
                    border-radius: 8px;
                  }
                  #scanner-container #qr-shaded-region {
                    border-width: 2px !important;
                  }
                `}</style>
                {scannerListo && (
                  <div className="text-center text-sm text-green-600 mt-2 bg-green-50 p-2 rounded">
                    ✅ Cámara activa - Apunta al código de barras
                  </div>
                )}
                <button
                  onClick={detenerCamara}
                  className="mt-3 w-full bg-red-500 text-white py-2 rounded hover:bg-red-600"
                >
                  ⏹ Detener cámara
                </button>
              </div>
            ) : (
              <button
                onClick={iniciarCamara}
                className="w-full bg-indigo-500 text-white py-3 rounded-lg hover:bg-indigo-600 flex items-center justify-center gap-2"
              >
                <span className="text-xl">📸</span>
                Activar cámara
              </button>
            )}
          </div>

          {/* Entrada manual */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h2 className="font-semibold mb-3 text-gray-700">⌨️ Entrada manual</h2>
            
            <input
              type="text"
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') registrarFichada(codigoManual);
              }}
              placeholder="Código de pieza..."
              className="w-full border rounded-lg px-4 py-3 text-lg mb-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              autoComplete="off"
              autoCapitalize="characters"
            />
            
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              className="w-full border rounded px-3 py-2 mb-3 text-sm"
            />
            
            <button
              onClick={() => registrarFichada(codigoManual)}
              disabled={!codigoManual.trim() || enviando}
              className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              {enviando ? 'Fichando...' : '✓ Fichar pieza'}
            </button>
          </div>

          {/* Últimas fichadas */}
          {ultimasFichadas.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="font-semibold mb-3 text-gray-700">🕐 Últimas fichadas</h2>
              <ul className="space-y-2">
                {ultimasFichadas.map((f, idx) => (
                  <li 
                    key={`${f.fichada_id}-${idx}`}
                    className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded"
                  >
                    <span className="font-mono font-medium text-indigo-600">
                      {f.id_pieza}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {new Date(f.fecha_fichada).toLocaleTimeString('es-ES', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Info del usuario */}
          <div className="mt-4 text-center text-gray-500 text-sm">
            👤 {user?.nombre_completo || user?.email}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

