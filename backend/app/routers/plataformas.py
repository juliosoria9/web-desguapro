"""
Router para información de plataformas
"""
from fastapi import APIRouter
from core.scraper_factory import ScraperFactory

router = APIRouter()


@router.get("/")
async def listar_plataformas():
    """Obtiene lista de todas las plataformas disponibles"""
    scrapers = ScraperFactory.get_available_platforms()
    
    detalles = []
    for platform_id, platform_name in scrapers.items():
        try:
            scraper = ScraperFactory.create_scraper(platform_id)
            detalles.append({
                "id": platform_id,
                "nombre": scraper.name,
                "url": scraper.base_url,
                "disponible": scraper.is_available(),
            })
        except:
            detalles.append({
                "id": platform_id,
                "nombre": platform_name,
                "disponible": False,
            })
    
    return {
        "total": len(detalles),
        "plataformas": detalles,
    }


@router.get("/{platform_id}")
async def obtener_plataforma(platform_id: str):
    """Obtiene información de una plataforma específica"""
    try:
        scraper = ScraperFactory.create_scraper(platform_id)
        return {
            "id": platform_id,
            "nombre": scraper.name,
            "url": scraper.base_url,
            "disponible": scraper.is_available(),
            "info": scraper.get_platform_info(),
        }
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Plataforma {platform_id} no encontrada")
