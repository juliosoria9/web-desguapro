import requests
from bs4 import BeautifulSoup
import json
import sys
import re

class NtyScraper:
    BASE_URL = "https://www.distri-auto.es"
    SEARCH_URL = "https://www.distri-auto.es/piezas-automovil/busqueda?q={}"

    def clean_ref(self, ref):
        """Limpia y normaliza referencia - solo letras y números"""
        return re.sub(r'[^A-Za-z0-9]', '', ref.strip().upper())

    def search(self, oem_ref):
        clean_oem = self.clean_ref(oem_ref)
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
        
        # Nueva estructura: product-list-item row
        items = soup.find_all("div", class_="product-list-item")
        
        for item in items:
            # Verificar si es NTY - buscar en el texto o imagen de marca
            item_text = item.get_text().upper()
            if "NTY" not in item_text:
                continue
            
            # Extraer referencia IAM
            iam_ref = "N/A"
            ref_span = item.find("span", class_="product__reference")
            if ref_span:
                mark = ref_span.find("mark")
                if mark:
                    iam_ref = self.clean_ref(mark.get_text(strip=True))
                else:
                    # Buscar después de "Ref."
                    ref_text = ref_span.get_text(strip=True)
                    ref_match = re.search(r'Ref\.?\s*(.+)', ref_text)
                    if ref_match:
                        iam_ref = self.clean_ref(ref_match.group(1).strip())
            
            # Extraer descripción (product-name)
            description = ""
            name_span = item.find("span", class_="product-name")
            if name_span:
                description = name_span.get_text(strip=True)
            
            # Extraer precio
            price = "Consultar"
            price_div = item.find("div", class_="product-price")
            if price_div:
                price_text = price_div.get_text(strip=True)
                if price_text and "€" in price_text:
                    price = price_text
            
            # Extraer imagen
            img_url = ""
            img_tag = item.find("img", class_="img-fluid")
            if img_tag:
                src = img_tag.get("src") or img_tag.get("data-src")
                if src:
                    if src.startswith("http"):
                        img_url = src
                    elif src.startswith("/"):
                        img_url = self.BASE_URL + src
                    else:
                        img_url = self.BASE_URL + "/" + src

            results.append({
                "source": "NTY (distri-auto.es)",
                "iam_ref": iam_ref,
                "brand": "NTY",
                "description": description,
                "price": price,
                "image_url": img_url
            })

        return results


if __name__ == "__main__":
    ref = "038103601AQ"
    if len(sys.argv) > 1:
        ref = sys.argv[1]
    
    scraper = NtyScraper()
    items = scraper.search(ref)
    print(json.dumps(items, indent=4, ensure_ascii=False))
