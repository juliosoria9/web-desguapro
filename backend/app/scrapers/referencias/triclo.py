import csv
import sys
import json
import os

def search_triclo(oem_ref, csv_path=None):
    if csv_path is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        csv_path = os.path.join(script_dir, "data", "triclo_final_unificado.csv")
    
    if not os.path.exists(csv_path):
        return []

    target = oem_ref.strip().upper().replace(" ", "").replace(".", "").replace("-", "")
    results = []

    try:
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                row_oems_raw = str(row.get("OEM", ""))
                if not row_oems_raw or row_oems_raw.lower() == 'nan':
                    continue
                
                cleaned_oems_str = row_oems_raw.replace("/", ",").replace(";", ",")
                
                oem_codes = []
                for x in cleaned_oems_str.split(","):
                    clean_code = x.strip().upper().replace(" ", "").replace(".", "").replace("-", "")
                    if clean_code:
                        oem_codes.append(clean_code)
                
                found = False
                for code in oem_codes:
                    if target == code:
                        found = True
                        break
                    if len(target) > 5 and len(code) > 5:
                        if target in code or code in target:
                            found = True
                            break
                            
                if found:
                    iam = str(row.get("Triclo_Ref", "")).replace(".0", "")
                    
                    results.append({
                        "source": "Triclo (Local CSV)",
                        "iam_ref": iam,
                        "brand": row.get("Marca", "TRICLO"),
                        "description": f"{row.get('Modelo','')} {row.get('Info','')}".strip(),
                        "price": "",
                        "image_url": ""
                    })
    except Exception as e:
        pass

    return results


if __name__ == "__main__":
    ref = "038103601A"
    data = search_triclo(ref)
    print(json.dumps(data, indent=4, ensure_ascii=False))
