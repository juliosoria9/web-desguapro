import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../lib/auth-store';

interface Mensaje {
  id: number;
  mensaje: string;
  es_soporte: boolean;
  usuario_nombre: string;
  usuario_email: string;
  fecha_creacion: string;
}

interface Ticket {
  id: number;
  tipo: string;
  asunto: string;
  descripcion: string;
  estado: string;
  prioridad: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  usuario_email: string;
  usuario_nombre: string | null;
  empresa_nombre: string;
  mensajes: Mensaje[];
}

interface TicketListItem {
  id: number;
  tipo: string;
  asunto: string;
  estado: string;
  prioridad: string;
  fecha_creacion: string;
  usuario_email: string;
  usuario_nombre: string | null;
  empresa_nombre: string;
  tiene_respuesta: boolean;
  ultimo_mensaje_fecha: string | null;
}

interface Estadisticas {
  total: number;
  por_estado: {
    abiertos: number;
    en_proceso: number;
    resueltos: number;
    cerrados: number;
  };
  urgentes_pendientes: number;
}

export default function TicketsPage() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [ticketDetalle, setTicketDetalle] = useState<Ticket | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    tipo: 'duda',
    asunto: '',
    descripcion: '',
    prioridad: 'normal'
  });
  
  const isSysowner = user?.rol === 'sysowner';

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    cargarTickets();
    if (isSysowner) {
      cargarEstadisticas();
    }
  }, [token, filtroEstado]);

  useEffect(() => {
    if (selectedTicketId) {
      cargarTicketDetalle(selectedTicketId);
    }
  }, [selectedTicketId]);

  // Scroll al final del chat cuando hay nuevos mensajes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticketDetalle?.mensajes]);

  const cargarTickets = async () => {
    try {
      const endpoint = isSysowner ? '/api/v1/tickets/todos' : '/api/v1/tickets/mis-tickets';
      const params = filtroEstado ? `?estado=${filtroEstado}` : '';
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTickets(data);
      }
    } catch (error) {
      console.error('Error cargando tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const cargarEstadisticas = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/tickets/estadisticas/resumen`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setEstadisticas(await response.json());
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  const cargarTicketDetalle = async (ticketId: number) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/tickets/${ticketId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setTicketDetalle(await response.json());
      }
    } catch (error) {
      console.error('Error cargando ticket:', error);
    }
  };

  const crearTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/tickets/crear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        const nuevoTicket = await response.json();
        setShowForm(false);
        setFormData({ tipo: 'duda', asunto: '', descripcion: '', prioridad: 'normal' });
        cargarTickets();
        if (isSysowner) cargarEstadisticas();
        // Abrir el ticket recién creado
        setSelectedTicketId(nuevoTicket.id);
      } else {
        const error = await response.json();
        alert(error.detail || 'Error al crear ticket');
      }
    } catch (error) {
      console.error('Error creando ticket:', error);
      alert('Error de conexión');
    }
  };

  const enviarMensaje = async () => {
    if (!nuevoMensaje.trim() || !selectedTicketId || enviando) return;
    
    setEnviando(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/tickets/${selectedTicketId}/mensaje`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mensaje: nuevoMensaje })
      });
      
      if (response.ok) {
        setNuevoMensaje('');
        // Recargar el ticket para ver el nuevo mensaje
        await cargarTicketDetalle(selectedTicketId);
        cargarTickets();
        if (isSysowner) cargarEstadisticas();
      } else {
        const error = await response.json();
        alert(error.detail || 'Error al enviar mensaje');
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
    } finally {
      setEnviando(false);
    }
  };

  const cambiarEstado = async (estado: string) => {
    if (!selectedTicketId) return;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/tickets/${selectedTicketId}/estado`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estado })
      });
      
      if (response.ok) {
        await cargarTicketDetalle(selectedTicketId);
        cargarTickets();
        cargarEstadisticas();
      }
    } catch (error) {
      console.error('Error cambiando estado:', error);
    }
  };

  const eliminarTicket = async (ticketId: number) => {
    if (!confirm('¿Estás seguro de eliminar este ticket?')) return;
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        if (selectedTicketId === ticketId) {
          setSelectedTicketId(null);
          setTicketDetalle(null);
        }
        cargarTickets();
        if (isSysowner) cargarEstadisticas();
      }
    } catch (error) {
      console.error('Error eliminando:', error);
    }
  };

  const getTipoIcon = (tipo: string) => {
    const iconClass = "w-5 h-5";
    switch(tipo) {
      case 'reporte':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`${iconClass} text-red-500`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 0 1 .4-2.253M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0 1 15.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 0 0-.575-1.752M4.921 6a24.048 24.048 0 0 0-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 0 1-5.223 1.082" />
          </svg>
        );
      case 'sugerencia':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`${iconClass} text-yellow-500`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
        );
      case 'duda':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`${iconClass} text-blue-500`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`${iconClass} text-gray-500`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        );
    }
  };

  const getEstadoBadge = (estado: string) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      'abierto': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Abierto' },
      'en_proceso': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'En Proceso' },
      'resuelto': { bg: 'bg-green-100', text: 'text-green-800', label: 'Resuelto' },
      'cerrado': { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Cerrado' }
    };
    const c = config[estado] || config['abierto'];
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-100 flex-shrink-0">
        <div className="max-w-full mx-auto px-4 py-3 flex justify-between items-center">
          <div 
            className="flex items-center space-x-4 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => router.push('/dashboard')}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-white border border-gray-200 shadow-sm">
              <img src="/logo.png" alt="DesguaPro" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                DesguaPro
              </h1>
              <p className="text-xs text-gray-500">{isSysowner ? 'Gestión de Tickets' : 'Soporte'}</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            {/* Estadísticas mini para sysowner */}
            {isSysowner && estadisticas && (
              <div className="hidden md:flex gap-2 mr-4 text-sm">
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                  {estadisticas.por_estado.abiertos} abiertos
                </span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                  {estadisticas.por_estado.en_proceso} en proceso
                </span>
                {estadisticas.urgentes_pendientes > 0 && (
                  <span className="px-2 py-1 bg-red-100 text-red-700 rounded">
                    ⚠️ {estadisticas.urgentes_pendientes} urgentes
                  </span>
                )}
              </div>
            )}
            <button onClick={() => router.push('/dashboard')} className="px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
              ← Volver
            </button>
            <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transition-all">
              + Nuevo Ticket
            </button>
          </div>
        </div>
      </header>

      {/* Main layout - 2 columnas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Lista de tickets (izquierda) */}
        <div className="w-80 md:w-96 bg-white border-r flex flex-col">
          {/* Filtro */}
          <div className="p-3 border-b">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">Todos los tickets</option>
              <option value="abierto">🟡 Abiertos</option>
              <option value="en_proceso">🔵 En Proceso</option>
              <option value="resuelto">🟢 Resueltos</option>
              <option value="cerrado">⚫ Cerrados</option>
            </select>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {tickets.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <div className="flex justify-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-gray-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 0 1-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 0 0 1.183 1.981l6.478 3.488m8.839 2.51-4.66-2.51m0 0-1.023-.55a2.25 2.25 0 0 0-2.134 0l-1.022.55m0 0-4.661 2.51m16.5 1.615a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V8.844a2.25 2.25 0 0 1 1.183-1.981l7.5-4.039a2.25 2.25 0 0 1 2.134 0l7.5 4.039a2.25 2.25 0 0 1 1.183 1.98V19.5Z" />
                  </svg>
                </div>
                No hay tickets
              </div>
            ) : (
              tickets.map(ticket => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`p-3 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedTicketId === ticket.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-shrink-0 mt-0.5">{getTipoIcon(ticket.tipo)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-800 truncate">{ticket.asunto}</span>
                      </div>
                      {isSysowner && (
                        <p className="text-xs text-gray-500 truncate">
                          {ticket.usuario_nombre || ticket.usuario_email} • {ticket.empresa_nombre}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {getEstadoBadge(ticket.estado)}
                        {ticket.tiene_respuesta && (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-green-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatTime(ticket.fecha_creacion)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat/Detalle (derecha) */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {!selectedTicketId || !ticketDetalle ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 text-gray-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                </div>
                <p>Selecciona un ticket para ver la conversación</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header del ticket */}
              <div className="bg-white p-4 border-b shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {getTipoIcon(ticketDetalle.tipo)}
                      <h2 className="font-bold text-lg text-gray-800">{ticketDetalle.asunto}</h2>
                      {getEstadoBadge(ticketDetalle.estado)}
                    </div>
                    <p className="text-sm text-gray-500">
                      {ticketDetalle.usuario_nombre || ticketDetalle.usuario_email} • {ticketDetalle.empresa_nombre} • {formatDate(ticketDetalle.fecha_creacion)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {/* Cambiar estado (solo sysowner) */}
                    {isSysowner && ticketDetalle.estado !== 'cerrado' && (
                      <select
                        value={ticketDetalle.estado}
                        onChange={(e) => cambiarEstado(e.target.value)}
                        className="px-2 py-1 border rounded text-sm"
                      >
                        <option value="abierto">Abierto</option>
                        <option value="en_proceso">En Proceso</option>
                        <option value="resuelto">Resuelto</option>
                        <option value="cerrado">Cerrado</option>
                      </select>
                    )}
                    {(isSysowner || ticketDetalle.estado === 'abierto') && (
                      <button
                        onClick={() => eliminarTicket(ticketDetalle.id)}
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Área de chat */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Mensaje inicial (descripción) */}
                <div className="flex justify-start">
                  <div className="max-w-[75%] bg-white rounded-lg p-3 shadow-sm border overflow-hidden">
                    <p className="text-xs text-gray-500 mb-1 font-medium">
                      {ticketDetalle.usuario_nombre || ticketDetalle.usuario_email}
                    </p>
                    <p className="text-gray-700 whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>{ticketDetalle.descripcion}</p>
                    <p className="text-xs text-gray-400 mt-2 text-right">{formatTime(ticketDetalle.fecha_creacion)}</p>
                  </div>
                </div>

                {/* Mensajes del chat */}
                {ticketDetalle.mensajes.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.es_soporte ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg p-3 shadow-sm overflow-hidden ${
                        msg.es_soporte
                          ? 'bg-blue-500 text-white'
                          : 'bg-white border'
                      }`}
                    >
                      <p className={`text-xs mb-1 font-medium ${msg.es_soporte ? 'text-blue-100' : 'text-gray-500'}`}>
                        {msg.usuario_nombre} {msg.es_soporte && '(Soporte)'}
                      </p>
                      <p className={`whitespace-pre-wrap break-words ${msg.es_soporte ? 'text-white' : 'text-gray-700'}`} style={{ overflowWrap: 'anywhere' }}>
                        {msg.mensaje}
                      </p>
                      <p className={`text-xs mt-2 text-right ${msg.es_soporte ? 'text-blue-100' : 'text-gray-400'}`}>
                        {formatTime(msg.fecha_creacion)}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input de mensaje */}
              {ticketDetalle.estado !== 'cerrado' && (
                <div className="bg-white p-4 border-t">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoMensaje}
                      onChange={(e) => setNuevoMensaje(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && enviarMensaje()}
                      placeholder="Escribe un mensaje..."
                      className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={enviando}
                    />
                    <button
                      onClick={enviarMensaje}
                      disabled={!nuevoMensaje.trim() || enviando}
                      className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {enviando ? '...' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}

              {ticketDetalle.estado === 'cerrado' && (
                <div className="bg-gray-200 p-4 text-center text-gray-500">
                  Este ticket está cerrado. No se pueden enviar más mensajes.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal crear ticket */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Nuevo Ticket de Soporte</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
            </div>
            
            <form onSubmit={crearTicket} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData({...formData, tipo: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="duda">Tengo una duda</option>
                  <option value="reporte">Reportar un error</option>
                  <option value="sugerencia">Sugerencia</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asunto *</label>
                <input
                  type="text"
                  value={formData.asunto}
                  onChange={(e) => setFormData({...formData, asunto: e.target.value})}
                  placeholder="Resumen breve"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  maxLength={200}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                  placeholder="Describe tu problema o duda..."
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={4}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                <select
                  value={formData.prioridad}
                  onChange={(e) => setFormData({...formData, prioridad: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="baja">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  Crear Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
