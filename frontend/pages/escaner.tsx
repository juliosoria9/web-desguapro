import { useEffect, useRef, useState } from 'react';
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [scanning, setScanning] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [ultimasFichadas, setUltimasFichadas] = useState<FichadaResponse[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [usandoCamara, setUsandoCamara] = useState(false);

  // Registrar fichada
  const registrarFichada = async (codigo: string) => {
    if (!codigo.trim()) {
      setMensaje({ tipo: 'error', texto: 'El código no puede estar vacío' });
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/fichadas/registrar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id_pieza: codigo.trim().toUpperCase(),
          descripcion: descripcion || 'Fichada por escáner'
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMensaje({ tipo: 'success', texto: `✓ Fichada: ${data.id_pieza}` });
        setUltimasFichadas(prev => [data, ...prev.slice(0, 9)]);
        setCodigoManual('');
        setDescripcion('');
        
        // Vibrar si está disponible
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }
        
        // Limpiar mensaje después de 3 segundos
        setTimeout(() => setMensaje(null), 3000);
      } else {
        setMensaje({ tipo: 'error', texto: data.detail || 'Error al fichar' });
      }
    } catch (error) {
      setMensaje({ tipo: 'error', texto: 'Error de conexión' });
    }
  };

  // Iniciar cámara para escaneo
  const iniciarCamara = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Cámara trasera
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setUsandoCamara(true);
        setScanning(true);
      }
    } catch (error: any) {
      setCameraError(
        error.name === 'NotAllowedError' 
          ? 'Permiso de cámara denegado. Usa entrada manual.' 
          : 'No se pudo acceder a la cámara'
      );
    }
  };

  // Detener cámara
  const detenerCamara = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setUsandoCamara(false);
    setScanning(false);
  };

  // Escanear frame del video buscando código de barras
  useEffect(() => {
    if (!scanning || !usandoCamara) return;

    let animationId: number;
    let lastScan = 0;

    const scanFrame = async () => {
      if (!videoRef.current || !canvasRef.current) return;
      
      const now = Date.now();
      if (now - lastScan < 500) { // Escanear cada 500ms
        animationId = requestAnimationFrame(scanFrame);
        return;
      }
      lastScan = now;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        
        // Usar BarcodeDetector si está disponible (Chrome, Edge)
        if ('BarcodeDetector' in window) {
          try {
            // @ts-ignore
            const barcodeDetector = new BarcodeDetector({
              formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e']
            });
            const barcodes = await barcodeDetector.detect(canvas);
            
            if (barcodes.length > 0) {
              const codigo = barcodes[0].rawValue;
              detenerCamara();
              setCodigoManual(codigo);
              registrarFichada(codigo);
              return;
            }
          } catch (e) {
            console.log('BarcodeDetector error:', e);
          }
        }
      }
      
      animationId = requestAnimationFrame(scanFrame);
    };

    animationId = requestAnimationFrame(scanFrame);
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [scanning, usandoCamara]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => detenerCamara();
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
                <video
                  ref={videoRef}
                  className="w-full rounded border-2 border-indigo-300"
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-red-500 w-3/4 h-16 rounded opacity-50" />
                </div>
                <button
                  onClick={detenerCamara}
                  className="mt-3 w-full bg-red-500 text-white py-2 rounded hover:bg-red-600"
                >
                  ⏹ Detener cámara
                </button>
                {!('BarcodeDetector' in window) && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Tu navegador no soporta detección automática. Usa Chrome o Edge para escaneo automático.
                  </p>
                )}
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
              disabled={!codigoManual.trim()}
              className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              ✓ Fichar pieza
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
