import requests
from bs4 import BeautifulSoup
import json
import sys

class PrascoScraper:
    BASE_URL = "https://www.prasco.net"
    SEARCH_URL = "https://www.prasco.net/es-es/search?q={}"

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
        
        items = soup.find_all("div", class_="l-products-item")
        
        for item in items:
            iam_ref = item.get("data-id", "N/A")
            
            product_tile = item.find("div", class_="product-tile")
            brand = "Desconocida"
            description = ""
            
            if product_tile and product_tile.has_attr("data-tracking-data"):
                try:
                    tracking_data = json.loads(product_tile["data-tracking-data"])
                    brand = tracking_data.get("category", "Desconocida")
                    description = tracking_data.get("name", "")
                except:
                    pass
            
            if not description:
                desc_span = item.find("span", class_="product-id-value")
                if desc_span:
                    description = desc_span.get_text(strip=True)

            full_brand_info = f"{brand} - {description}" if description else brand

            price_div = item.find("div", class_="product-price")
            price = price_div.get_text(strip=True) if price_div else ""
            if not price or price == "0":
                price = "Consultar"

            img_container = item.find("div", class_="product-img")
            img_url = ""
            if img_container:
                img_tag = img_container.find("img")
                if img_tag:
                    src = img_tag.get("data-src") or img_tag.get("src")
                    if src and not src.startswith("data:"):
                        img_url = self.BASE_URL + src if src.startswith("/") else src
                    elif img_tag.get("src") and not img_tag.get("src").startswith("data:"):
                        src = img_tag.get("src")
                        img_url = self.BASE_URL + src if src.startswith("/") else src

            results.append({
                "source": "Prasco",
                "iam_ref": iam_ref,
                "brand": full_brand_info,
                "description": "",
                "price": price,
                "image_url": img_url
            })

        return results


if __name__ == "__main__":
    ref = "7701068178"
    if len(sys.argv) > 1:
        ref = sys.argv[1]
    
    scraper = PrascoScraper()
    items = scraper.search(ref)
    print(json.dumps(items, indent=4, ensure_ascii=False))
