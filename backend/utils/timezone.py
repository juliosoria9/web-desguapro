"""
Utilidades para manejo de zona horaria de España
"""
from datetime import datetime, timezone, timedelta

# Offset de España (CET = UTC+1, CEST = UTC+2)
# Usamos UTC+1 como base (horario de invierno)
# Para verano habría que ajustar a UTC+2
SPAIN_OFFSET = timedelta(hours=1)


def now_spain() -> datetime:
    """Obtener la hora actual en España (con timezone)"""
    utc_now = datetime.now(timezone.utc)
    return utc_now + SPAIN_OFFSET


def now_spain_naive() -> datetime:
    """Obtener la hora actual en España (sin timezone, para SQLite)"""
    utc_now = datetime.utcnow()
    spain_time = utc_now + SPAIN_OFFSET
    return spain_time


def to_spain(dt: datetime) -> datetime:
    """Convertir un datetime UTC a hora de España"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Asumir que es UTC si no tiene timezone
        return dt + SPAIN_OFFSET
    return dt.astimezone(timezone.utc) + SPAIN_OFFSET


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
