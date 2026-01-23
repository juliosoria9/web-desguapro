import csv
import os

def buscar_iam_por_oem(oem_ref, csv_path=None):
    """
    Busca en el CSV de Vauner las referencias IAM que corresponden a un OEM dado.
    Retorna lista de tuplas: [(iam_original, iam_limpio), ...]
    """
    if csv_path is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        csv_path = os.path.join(script_dir, "data", "Vauner_Unificado.csv")
    
    if not os.path.exists(csv_path):
        return []

    target = oem_ref.strip().upper().replace(" ", "").replace(".", "").replace("-", "")
    results = []

    try:
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                oem_field = str(row.get("OEM", ""))
                if not oem_field or oem_field.lower() == 'nan':
                    continue
                
                oem_list = [x.strip().upper().replace(" ", "").replace(".", "").replace("-", "") 
                           for x in oem_field.replace("/", ",").split(",")]
                
                if target in oem_list:
                    iam_original = str(row.get("Codigo", "")).strip()
                    iam_limpio = iam_original.replace(".", "").replace("-", "").replace(" ", "")
                    if iam_original:
                        results.append((iam_original, iam_limpio))
    except Exception as e:
        pass

    return results


def search_vauner(oem_ref, csv_path=None):
    """Wrapper que retorna en el formato estándar de los otros scrapers."""
    resultados = buscar_iam_por_oem(oem_ref, csv_path)
    items = []
    for iam_original, iam_limpio in resultados:
        items.append({
            "source": "Vauner (Local CSV)",
            "iam_ref": iam_limpio,
            "iam_original": iam_original,
            "brand": "VAUNER",
            "description": "",
            "price": "",
            "image_url": ""
        })
    return items


if __name__ == "__main__":
    import sys
    import json
    ref = "038103601A"
    if len(sys.argv) > 1:
        ref = sys.argv[1]
    data = search_vauner(ref)
    print(json.dumps(data, indent=4, ensure_ascii=False))
