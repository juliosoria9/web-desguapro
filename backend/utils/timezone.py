"""
Utilidades para manejo de zona horaria de España
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

# Zona horaria de España (maneja CET/CEST automáticamente)
SPAIN_TZ = ZoneInfo("Europe/Madrid")

# Mantener para compatibilidad con código que importe SPAIN_OFFSET
SPAIN_OFFSET = timedelta(hours=1)  # DEPRECATED: usar SPAIN_TZ


def now_spain() -> datetime:
    """Obtener la hora actual en España (con timezone)"""
    return datetime.now(SPAIN_TZ)


def now_spain_naive() -> datetime:
    """Obtener la hora actual en España (sin timezone, para SQLite)"""
    return datetime.now(SPAIN_TZ).replace(tzinfo=None)


def to_spain(dt: datetime) -> datetime:
    """Convertir un datetime a hora de España (devuelve naive para compatibilidad SQLite)"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Asumir que es UTC si no tiene timezone
        dt = dt.replace(tzinfo=timezone.utc)
    spain_dt = dt.astimezone(SPAIN_TZ)
    return spain_dt.replace(tzinfo=None)


def format_spain_time(dt: datetime, fmt: str = "%H:%M") -> str:
    """Formatear datetime a string en hora de España"""
    if dt is None:
        return ""
    spain_dt = to_spain(dt)
    return spain_dt.strftime(fmt)


def format_spain_datetime(dt: datetime, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """Formatear datetime completo en hora de España"""
    if dt is None:
        return ""
    spain_dt = to_spain(dt)
    return spain_dt.strftime(fmt)
