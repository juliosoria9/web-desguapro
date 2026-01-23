import requests
from bs4 import BeautifulSoup
import json
import sys

class NRFScraper:
    BASE_URL = "https://webshop.nrf.eu"
    SEARCH_URL = "https://webshop.nrf.eu/catalogsearch/advanced/result/?sku=&p_oen={}&p_cross=&license_plate=&timestamp="

    def search(self, oem_ref):
        url = self.SEARCH_URL.format(oem_ref)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        }
        
        try:
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
        except requests.RequestException as e:
            return []

        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        
        products_list = soup.find_all("div", class_="product-wrapper")
        
        for product in products_list:
            sku_div = product.find("div", class_="product-sku")
            iam_ref = sku_div.get_text(strip=True) if sku_div else "N/A"

            title_div = product.find("div", class_="product-title")
            full_title = "Desconocido"
            if title_div:
                full_title = title_div.get_text(" ", strip=True)

            price_box = product.find("div", class_="price-box")
            price = "Consultar"
            if price_box:
                visible_price = price_box.find("span", class_="price")
                if visible_price:
                    price = visible_price.get_text(strip=True)
                else:
                    info = price_box.find("div", class_="prices-visibility-info")
                    if info:
                        price = ""

            img = product.find("img", class_="product-image-photo")
            img_url = ""
            if img:
                src = img.get("src")
                if src:
                    img_url = src

            results.append({
                "source": "NRF",
                "iam_ref": iam_ref,
                "brand": full_title,
                "description": "",
                "price": price,
                "image_url": img_url
            })

        return results


if __name__ == "__main__":
    ref = "JX618005BD"
    if len(sys.argv) > 1:
        ref = sys.argv[1]
    
    scraper = NRFScraper()
    items = scraper.search(ref)
    print(json.dumps(items, indent=4, ensure_ascii=False))
