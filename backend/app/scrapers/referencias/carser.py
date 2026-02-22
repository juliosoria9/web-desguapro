import requests
from bs4 import BeautifulSoup
import json
import sys
import re

class CarserScraper:
    BASE_URL = "https://www.carser.fr"
    SEARCH_URL = "https://www.carser.fr/resultats/-/{}//"

    def search(self, oem_ref):
        url = self.SEARCH_URL.format(oem_ref)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,es;q=0.8,en;q=0.7"
        }
        
        try:
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
        except requests.RequestException as e:
            return []

        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        
        # La tabla principal de resultados
        table = soup.find("table", id="compairTbl")
        if not table:
            return results
        
        # Buscar todas las celdas que contengan productos
        cells = table.find_all("td")
        
        for cell in cells:
            # Verificar que la celda contiene info de producto
            h5_tags = cell.find_all("h5")
            if len(h5_tags) < 2:
                continue
            
            # Descripción: primer h5
            description = ""
            if h5_tags[0]:
                description = h5_tags[0].get_text(strip=True)
            
            # Referencia IAM: segundo h5 contiene "REF. CARSER: XXXXX"
            iam_ref = "N/A"
            for h5 in h5_tags:
                text = h5.get_text(strip=True)
                if "REF. CARSER:" in text or "REF.CARSER:" in text:
                    # Extraer la referencia
                    match = re.search(r'REF\.?\s*CARSER:\s*(\S+)', text, re.IGNORECASE)
                    if match:
                        iam_ref = match.group(1).strip()
                    else:
                        # Fallback: buscar en elementos hijos
                        u_tag = h5.find("u")
                        if u_tag:
                            iam_ref = u_tag.get_text(strip=True)
                        else:
                            b_tag = h5.find("b")
                            if b_tag:
                                iam_ref = b_tag.get_text(strip=True)
                    break
            
            # Si no encontramos referencia, saltar
            if iam_ref == "N/A":
                continue
            
            # Precio: buscar en font con color específico o h4/span
            price = "Consultar"
            price_font = cell.find("font", attrs={"color": "#004682"})
            if price_font:
                price_text = price_font.get_text(strip=True)
                # Limpiar "Notre prix:" si existe
                price = re.sub(r'Notre\s*prix\s*:\s*', '', price_text, flags=re.IGNORECASE).strip()
            else:
                # Fallback: buscar h4 con span de color
                h4 = cell.find("h4")
                if h4:
                    span = h4.find("span", style=lambda s: s and "color" in s.lower())
                    if span:
                        price_text = span.get_text(strip=True)
                        price = re.sub(r'Notre\s*prix\s*:\s*', '', price_text, flags=re.IGNORECASE).strip()
            
            # Imagen
            img_url = ""
            img = cell.find("img")
            if img:
                src = img.get("src", "")
                if src:
                    if src.startswith("/"):
                        img_url = self.BASE_URL + src
                    elif src.startswith("http"):
                        img_url = src
                    else:
                        img_url = self.BASE_URL + "/" + src
            
            results.append({
                "source": "Autocarser",
                "iam_ref": iam_ref,
                "brand": "CARSER",
                "description": description,
                "price": price,
                "image_url": img_url
            })

        return results


if __name__ == "__main__":
    ref = "7701045718"
    if len(sys.argv) > 1:
        ref = sys.argv[1]
    
    scraper = CarserScraper()
    items = scraper.search(ref)
    
    print(json.dumps(items, indent=4, ensure_ascii=False))
