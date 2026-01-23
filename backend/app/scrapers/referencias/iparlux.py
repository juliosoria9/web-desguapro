import requests
from bs4 import BeautifulSoup
import json
import sys
import re

class IparluxScraper:
    BASE_URL = "https://iparlux.es/"
    SEARCH_URL = "https://iparlux.es/catalogoi.php?bReferencia={}"

    def _do_search(self, oem_ref):
        """Realiza la búsqueda para una referencia específica."""
        url = self.SEARCH_URL.format(oem_ref)
        try:
            response = requests.get(url, timeout=15)
            response.raise_for_status()
        except requests.RequestException as e:
            return []

        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        
        container = soup.find(id="capaPrincipal")
        if not container:
            return []
        
        # Verificar si dice "no existe"
        text = container.get_text()
        if "no existe" in text.lower():
            return []

        current_brand = "Desconocida"
        
        rows = container.find_all("div", class_="row", recursive=True)
        
        for row in rows:
            classes = row.get("class", [])
            
            if "rowvehiculo" in classes:
                tit_vehiculo = row.find("h4", class_="titvehiculo")
                if tit_vehiculo:
                    raw_brand = tit_vehiculo.get_text(strip=True)
                    current_brand = " ".join(raw_brand.split())
                continue

            desc_box = row.find("div", class_="cuadrodescripcion")
            if desc_box:
                ref_div = desc_box.find("div", class_="cuadroreferencia")
                iam_ref = ref_div.get_text(strip=True) if ref_div else "N/A"
                
                price_divs = desc_box.find_all("div", class_="precios")
                price_list = [p.get_text(strip=True) for p in price_divs if p.get_text(strip=True) not in ["---", ""]]
                price = " / ".join(price_list) if price_list else "Consultar"

                img_box = row.find("div", class_="cuadrofotoancho")
                img_url = ""
                if img_box:
                    img_tag = img_box.find("img")
                    if img_tag and img_tag.get("src"):
                        src = img_tag["src"].strip().replace('\n', '').replace('\r', '').replace(' ', '')
                        if not src.startswith("http"):
                            img_url = self.BASE_URL + src
                        else:
                            img_url = src
                
                results.append({
                    "source": "Iparlux",
                    "iam_ref": iam_ref,
                    "brand": current_brand,
                    "description": "",
                    "price": price,
                    "image_url": img_url
                })

        return results

    def search(self, oem_ref):
        """
        Busca la referencia OEM. Si no encuentra resultados y la referencia
        termina en letra, prueba sin la letra final (Iparlux a veces ignora sufijos).
        """
        # Primero intentar con la referencia original
        results = self._do_search(oem_ref)
        
        if results:
            return results
        
        # Si no hay resultados y termina en letra, probar sin ella
        clean_ref = oem_ref.strip().upper()
        if clean_ref and clean_ref[-1].isalpha() and len(clean_ref) > 3:
            ref_sin_letra = clean_ref[:-1]
            results = self._do_search(ref_sin_letra)
        
        return results


if __name__ == "__main__":
    ref = "7701068178"
    if len(sys.argv) > 1:
        ref = sys.argv[1]
    
    scraper = IparluxScraper()
    items = scraper.search(ref)
    print(json.dumps(items, indent=4, ensure_ascii=False))
