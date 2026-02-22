import requests
from bs4 import BeautifulSoup
import json
import sys
import re

class FlamarScraper:
    BASE_URL = "https://www.flamarmeridional.com"
    SEARCH_URL = "https://www.flamarmeridional.com/tienda/buscador_productos.jsp?bus_producto={}"

    def search(self, oem_ref):
        url = self.SEARCH_URL.format(oem_ref)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        try:
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
        except requests.RequestException as e:
            return []

        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        
        items = soup.find_all("div", class_="producto")
        
        for item in items:
            titulo_div = item.find("div", class_="titulo")
            iam_ref = "N/A"
            brand = "Desconocida"
            product_name = ""
            
            if titulo_div:
                h2 = titulo_div.find("h2")
                if h2:
                    full_title = h2.get_text(strip=True)
                    match = re.match(r'^(\S+)\s+(\S+)\s*-\s*(.*)$', full_title)
                    if match:
                        brand = match.group(1)
                        iam_ref = match.group(2)
                        product_name = match.group(3).strip()
                    else:
                        parts = full_title.split(" - ", 1)
                        if len(parts) == 2:
                            first_part = parts[0].strip().split()
                            if len(first_part) >= 2:
                                brand = first_part[0]
                                iam_ref = first_part[1]
                            elif len(first_part) == 1:
                                iam_ref = first_part[0]
                            product_name = parts[1].strip()
                        else:
                            product_name = full_title
            
            descripcion_p = item.find("p", class_="descripcion")
            description = ""
            if descripcion_p:
                desc_text = descripcion_p.get_text(separator=" ", strip=True)
                description = " ".join(desc_text.split())
            
            full_description = product_name
            if description:
                full_description = f"{product_name} | {description}" if product_name else description
            
            img_container = item.find("div", class_="imagen")
            img_url = ""
            if img_container:
                img_tag = img_container.find("img")
                if img_tag:
                    src = img_tag.get("data-ima-grande") or img_tag.get("src")
                    if src:
                        if src.startswith("/"):
                            img_url = self.BASE_URL + src
                        elif not src.startswith("http"):
                            img_url = self.BASE_URL + "/" + src
                        else:
                            img_url = src
            
            precio_div = item.find("div", class_="informacion")
            price = "Consultar"
            if precio_div:
                precio_text = precio_div.get_text(strip=True)
                if precio_text:
                    price = precio_text

            results.append({
                "source": "Flamar",
                "iam_ref": iam_ref,
                "brand": brand,
                "description": full_description,
                "price": price,
                "image_url": img_url
            })

        return results


if __name__ == "__main__":
    ref = "4F09598515PR"
    if len(sys.argv) > 1:
        ref = sys.argv[1]
    
    scraper = FlamarScraper()
    items = scraper.search(ref)
    print(json.dumps(items, indent=4, ensure_ascii=False))
