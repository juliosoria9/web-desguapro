"""
Clase base abstracta para scrapers de desguaces competidores.
Cada desguace implementa esta interfaz.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional


class DesguaceScraper(ABC):
    """Interfaz que deben implementar todos los scrapers de desguaces."""

    @property
    @abstractmethod
    def id(self) -> str:
        """Identificador único (ej: 'delfincar')."""

    @property
    @abstractmethod
    def nombre(self) -> str:
        """Nombre legible (ej: 'Delfincar')."""

    @property
    @abstractmethod
    def url_base(self) -> str:
        """URL raíz del desguace."""

    @abstractmethod
    def buscar(self, referencia: str) -> List[Dict]:
        """
        Busca piezas por referencia OEM.
        Retorna lista de dicts con campos estandarizados:
          - id: str
          - titulo: str
          - oem: str
          - vehiculo: str
          - precio: float | None
          - precio_texto: str
          - url: str
          - imagen: str
          - desguace: str        (self.nombre)
          - desguace_id: str     (self.id)
        """
