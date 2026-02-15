'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '@/lib/auth-store';

interface Anuncio {
  id: number;
  titulo: string;
  contenido: string;
  version: string | null;
  tipo: string;
  fecha_creacion: string;
  leido: boolean;
}

interface ChangelogModalProps {
  onClose?: () => void;
  showButton?: boolean;  // Si mostrar el botón flotante
}

// SVG Icons como componentes separados
const IconChangelog = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
  </svg>
);

const IconAnuncio = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
  </svg>
);

const IconMantenimiento = ({ className = "w-7 h-7" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
  </svg>
);

const TIPOS_CONFIG: { [key: string]: { bg: string; text: string; Icon: React.FC<{ className?: string }> } } = {
  changelog: { bg: 'bg-blue-500', text: 'text-blue-600', Icon: IconChangelog },
  anuncio: { bg: 'bg-green-500', text: 'text-green-600', Icon: IconAnuncio },
  mantenimiento: { bg: 'bg-orange-500', text: 'text-orange-600', Icon: IconMantenimiento },
};

export default function ChangelogModal({ onClose, showButton = true }: ChangelogModalProps) {
  const { token, user } = useAuthStore();
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [anunciosNoLeidos, setAnunciosNoLeidos] = useState<Anuncio[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (token) {
      checkAnunciosNoLeidos();
    }
  }, [token]);

  const checkAnunciosNoLeidos = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/anuncios/no-leidos`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const noLeidos = response.data;
      setAnunciosNoLeidos(noLeidos);
      if (noLeidos.length > 0) {
        setShowPopup(true);
      }
    } catch (error) {
      console.error('Error checking anuncios:', error);
    }
  };

  const fetchChangelog = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/anuncios/changelog`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAnuncios(response.data);
    } catch (error) {
      console.error('Error fetching changelog:', error);
    } finally {
      setLoading(false);
    }
  };

  const marcarComoLeido = async (anuncioId: number) => {
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/anuncios/${anuncioId}/marcar-leido`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleClosePopup = async () => {
    // Marcar todos los anuncios mostrados como leídos
    for (const anuncio of anunciosNoLeidos) {
      await marcarComoLeido(anuncio.id);
    }
    setShowPopup(false);
    setAnunciosNoLeidos([]);
    if (onClose) onClose();
  };

  const handleNextAnuncio = async () => {
    // Marcar el actual como leído
    if (anunciosNoLeidos[currentIndex]) {
      await marcarComoLeido(anunciosNoLeidos[currentIndex].id);
    }
    
    if (currentIndex < anunciosNoLeidos.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleClosePopup();
    }
  };

  const handleOpenHistorial = () => {
    fetchChangelog();
    setShowHistorial(true);
  };

  const handleCloseHistorial = () => {
    setShowHistorial(false);
  };

  const getTipoConfig = (tipo: string) => {
    return TIPOS_CONFIG[tipo] || TIPOS_CONFIG.changelog;
  };

  const sanitizeHtml = (html: string): string => {
    // Eliminar tags peligrosos y su contenido
    let clean = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed[^>]*>/gi, '')
      .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
      .replace(/<input[^>]*>/gi, '')
      .replace(/<textarea[^>]*>[\s\S]*?<\/textarea>/gi, '')
      .replace(/<link[^>]*>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    // Eliminar event handlers (on*="...")
    clean = clean.replace(/\s+on\w+\s*=\s*(["'])[^"']*\1/gi, '');
    clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
    // Eliminar href/src con javascript:
    clean = clean.replace(/href\s*=\s*(["'])\s*javascript:[^"']*\1/gi, 'href=$1#$1');
    clean = clean.replace(/src\s*=\s*(["'])\s*javascript:[^"']*\1/gi, 'src=$1$1');
    return clean;
  };

  const formatMarkdown = (text: string) => {
    // Convertir markdown básico a HTML y sanitizar
    const html = text
      .replace(/^### (.*)$/gm, '<h3 class="text-lg font-bold text-gray-800 mt-4 mb-2">$1</h3>')
      .replace(/^## (.*)$/gm, '<h2 class="text-xl font-bold text-gray-900 mt-4 mb-2">$1</h2>')
      .replace(/^# (.*)$/gm, '<h1 class="text-2xl font-bold text-gray-900 mt-4 mb-2">$1</h1>')
      .replace(/^\- (.*)$/gm, '<li class="ml-4 text-gray-700">• $1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>')
      .replace(/\n\n/g, '<br/><br/>');
    return sanitizeHtml(html);
  };

  const currentAnuncio = anunciosNoLeidos[currentIndex];

  return (
    <>
      {/* Modal de anuncios no leídos (popup automático) */}
      {showPopup && currentAnuncio && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden animate-in fade-in zoom-in duration-300">
            {/* Header con gradiente */}
            <div className={`${getTipoConfig(currentAnuncio.tipo).bg} px-6 py-5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 text-white">
                    {React.createElement(getTipoConfig(currentAnuncio.tipo).Icon, { className: "w-7 h-7" })}
                  </span>
                  <div>
                    <span className="text-white/80 text-xs font-medium uppercase tracking-wider">
                      {currentAnuncio.tipo === 'changelog' ? 'Novedades' : currentAnuncio.tipo}
                    </span>
                    {currentAnuncio.version && (
                      <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-white text-xs">
                        v{currentAnuncio.version}
                      </span>
                    )}
                  </div>
                </div>
                {anunciosNoLeidos.length > 1 && (
                  <span className="text-white/80 text-sm">
                    {currentIndex + 1} / {anunciosNoLeidos.length}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-white mt-2">{currentAnuncio.titulo}</h2>
            </div>

            {/* Contenido */}
            <div className="p-6 max-h-[50vh] overflow-y-auto">
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(currentAnuncio.contenido) }}
              />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {new Date(currentAnuncio.fecha_creacion).toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
              <button
                onClick={handleNextAnuncio}
                className={`px-6 py-2.5 ${getTipoConfig(currentAnuncio.tipo).bg} hover:opacity-90 text-white font-medium rounded-xl transition-all shadow-lg hover:shadow-xl`}
              >
                {currentIndex < anunciosNoLeidos.length - 1 ? (
                  <span className="flex items-center gap-2">
                    Siguiente
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Entendido
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de historial completo */}
      {showHistorial && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 text-white">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                    </svg>
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-white">Historial de Cambios</h2>
                    <p className="text-indigo-100 text-sm">Todas las actualizaciones de DesguaPro</p>
                  </div>
                </div>
                <button
                  onClick={handleCloseHistorial}
                  className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Lista de anuncios */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="text-gray-500 mt-2">Cargando...</p>
                </div>
              ) : anuncios.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 mx-auto mb-2 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
                    </svg>
                  </div>
                  <p className="text-gray-500">No hay anuncios publicados</p>
                </div>
              ) : (
                anuncios.map((anuncio) => (
                  <div
                    key={anuncio.id}
                    className={`border rounded-xl overflow-hidden ${anuncio.leido ? 'border-gray-200' : 'border-blue-300 bg-blue-50/30'}`}
                  >
                    <div className={`px-4 py-2 ${getTipoConfig(anuncio.tipo).bg}/10 border-b flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 flex items-center justify-center ${getTipoConfig(anuncio.tipo).text}`}>
                          {React.createElement(getTipoConfig(anuncio.tipo).Icon, { className: "w-5 h-5" })}
                        </span>
                        <span className={`text-sm font-medium ${getTipoConfig(anuncio.tipo).text}`}>
                          {anuncio.tipo.charAt(0).toUpperCase() + anuncio.tipo.slice(1)}
                        </span>
                        {anuncio.version && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                            v{anuncio.version}
                          </span>
                        )}
                        {!anuncio.leido && (
                          <span className="px-2 py-0.5 bg-blue-500 text-white rounded-full text-xs">
                            Nuevo
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(anuncio.fecha_creacion).toLocaleDateString('es-ES')}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 mb-2">{anuncio.titulo}</h3>
                      <div 
                        className="prose prose-sm max-w-none text-gray-600"
                        dangerouslySetInnerHTML={{ __html: formatMarkdown(anuncio.contenido) }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Botón flotante para ver historial */}
      {showButton && !showPopup && !showHistorial && (
        <button
          onClick={handleOpenHistorial}
          className="fixed bottom-6 right-6 w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40 group"
          title="Ver changelog"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" />
          </svg>
          {/* Indicador de no leídos */}
          {anunciosNoLeidos.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {anunciosNoLeidos.length}
            </span>
          )}
          {/* Tooltip */}
          <span className="absolute right-full mr-3 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Ver novedades
          </span>
        </button>
      )}
    </>
  );
}
