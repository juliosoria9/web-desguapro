"""
Factory de scrapers de desguaces competidores.
Para añadir un nuevo desguace:
  1. Crear clase que herede de DesguaceScraper
  2. Registrarla aquí con register() o añadirla a _REGISTRY
"""

import logging
from typing import Dict, List, Type

from .base import DesguaceScraper
from .delfincar import DelfincarScraper
from .logrono import LogronoScraper
from .valdizarbe import ValdizarbeScraper
from .azor import AzorScraper

logger = logging.getLogger(__name__)

_REGISTRY: Dict[str, Type[DesguaceScraper]] = {
    "delfincar": DelfincarScraper,
    "logrono": LogronoScraper,
    "valdizarbe": ValdizarbeScraper,
    "azor": AzorScraper,
}


class DesguaceFactory:

    @staticmethod
    def get_ids() -> List[str]:
        return list(_REGISTRY.keys())

    @staticmethod
    def get_nombres() -> Dict[str, str]:
        """Retorna {id: nombre_legible}."""
        return {k: v().nombre for k, v in _REGISTRY.items()}

    @staticmethod
    def crear(desguace_id: str) -> DesguaceScraper:
        cls = _REGISTRY.get(desguace_id)
        if not cls:
            raise ValueError(f"Desguace '{desguace_id}' no registrado. Disponibles: {list(_REGISTRY.keys())}")
        return cls()

    @staticmethod
    def crear_todos() -> List[DesguaceScraper]:
        return [cls() for cls in _REGISTRY.values()]

    @staticmethod
    def register(desguace_id: str, cls: Type[DesguaceScraper]):
        _REGISTRY[desguace_id] = cls
        logger.info(f"Desguace registrado: {desguace_id}")
