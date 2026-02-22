"""
Parsear CSV de ANTIGUOS Y DESCATALOGADOS y añadirlo a la tabla vehiculos_referencia.
Reutiliza la lógica del parser de MODERNOS (misma estructura de columnas).
Ejecutar: cd backend && python scripts/importar_antiguos.py
"""
import csv
import json
import re
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "desguapro.db"
CSV_PATH = Path(r"c:\Users\julio\Downloads\08- AÑOS VEHICULOS.xlsx - ANTIGUOS Y DESCATALOGADOS.csv")


def limpiar_precio(valor: str) -> float | None:
    if not valor or not valor.strip():
        return None
    val = valor.strip().replace(",", ".").replace("€", "").replace("#REF!", "")
    m = re.search(r"(\d+\.?\d*)", val)
    return float(m.group(1)) if m else None


def es_fila_vacia(row: list[str]) -> bool:
    return all(not c.strip() for c in row)


def es_fila_marca(row: list[str]) -> bool:
    if not row[0].strip():
        return False
    tiene_datos = any(row[i].strip() for i in range(3, min(len(row), 18)) if i < len(row))
    return not tiene_datos


def parsear_csv(ruta_csv: str) -> list[dict]:
    registros = []

    with open(ruta_csv, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        filas = list(reader)

    # Saltar las 2 primeras filas (cabeceras)
    filas = filas[2:]

    marca_actual = ""
    modelo_actual = ""
    anios_produccion_actual = ""

    for fila in filas:
        while len(fila) < 26:
            fila.append("")

        col_a = fila[0].strip()
        col_b = fila[1].strip()
        col_c = fila[2].strip()
        col_d = fila[3].strip()
        col_e = fila[4].strip()
        col_f = fila[5].strip()
        col_g = fila[6].strip()
        col_h = fila[7].strip()
        col_i = fila[8].strip()
        col_j = fila[9].strip()   # FATAL 10% / Serie 1G
        col_k = fila[10].strip()  # MAL 13% / Serie 2G
        col_l = fila[11].strip()  # REGU 17% / Serie 3G
        col_m = fila[12].strip()  # BIEN 23%
        col_n = fila[13].strip()  # Diesel / Valor
        col_o = fila[14].strip()  # Gasolina
        col_p = fila[15].strip()  # 15%
        col_q = fila[16].strip()  # 20%
        col_r = fila[17].strip()  # 23%

        if es_fila_vacia(fila):
            continue

        # Detectar marca
        if col_a and not col_b and not col_e and es_fila_marca(fila):
            marca_actual = col_a.strip().upper()
            modelo_actual = ""
            anios_produccion_actual = ""
            continue

        if col_b:
            modelo_actual = col_b.strip()
        if col_c and not col_c.startswith("http"):
            anios_produccion_actual = col_c.strip()

        if col_a and not col_b and col_e:
            modelo_actual = col_a.strip()

        # Sin rango de años → puede ser observación
        if not col_e:
            if col_h and registros:
                obs_existente = registros[-1].get("observaciones_facelift", "") or ""
                if obs_existente:
                    registros[-1]["observaciones_facelift"] = obs_existente + " | " + col_h
                else:
                    registros[-1]["observaciones_facelift"] = col_h

                texto_lower = col_h.lower()
                if "marcar validez" in texto_lower or "comparte" in texto_lower or "compartida" in texto_lower:
                    compat = registros[-1].get("compatibilidad", "") or ""
                    if compat:
                        registros[-1]["compatibilidad"] = compat + " | " + col_h
                    else:
                        registros[-1]["compatibilidad"] = col_h
            continue

        # Construir registro
        registro = {
            "marca": marca_actual,
            "modelo": modelo_actual,
            "anios_produccion": anios_produccion_actual,
            "rango_anios": col_e,
            "tiene_serie": col_f.upper() == "S",
            "tiene_deportiva": col_g.upper() == "D",
            "observaciones_facelift": col_h if col_h else None,
            "serie_1g": None,
            "serie_2g": None,
            "serie_3g": None,
            "precio_fatal_10": limpiar_precio(col_j),
            "precio_mal_13": limpiar_precio(col_k),
            "precio_regular_17": limpiar_precio(col_l),
            "precio_bien_23": limpiar_precio(col_m),
            "precio_vida_deportiva": limpiar_precio(col_n),
            "valor_minimo_usado": limpiar_precio(col_o),
            "porcentaje_15": limpiar_precio(col_p),
            "porcentaje_20": limpiar_precio(col_q),
            "porcentaje_23": limpiar_precio(col_r),
            "compatibilidad": None,
        }

        if col_h:
            texto_lower = col_h.lower()
            if "marcar validez" in texto_lower or "comparte" in texto_lower or "compartida" in texto_lower:
                registro["compatibilidad"] = col_h

        registros.append(registro)

    return registros


def main():
    if not CSV_PATH.exists():
        print(f"[ERROR] No se encontró: {CSV_PATH}")
        return

    print(f"[INFO] Leyendo: {CSV_PATH}")
    registros = parsear_csv(str(CSV_PATH))

    marcas = set(r["marca"] for r in registros)
    modelos = set(f"{r['marca']} {r['modelo']}" for r in registros)
    print(f"[OK] {len(registros)} registros parseados")
    print(f"     {len(marcas)} marcas: {', '.join(sorted(marcas)[:15])}...")
    print(f"     {len(modelos)} modelos únicos")

    # Guardar JSON
    json_path = Path(__file__).resolve().parents[1] / "data" / "vehiculos_antiguos.json"
    json_path.parent.mkdir(exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False, indent=2)
    print(f"[OK] JSON guardado en: {json_path}")

    # Importar a BD (AÑADIR, no borrar los existentes)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    count_antes = cur.execute("SELECT COUNT(*) FROM vehiculos_referencia").fetchone()[0]
    print(f"[INFO] Registros existentes en BD: {count_antes}")

    cols = [
        "marca", "modelo", "anios_produccion", "rango_anios",
        "tiene_serie", "tiene_deportiva", "observaciones_facelift",
        "serie_1g", "serie_2g", "serie_3g",
        "precio_fatal_10", "precio_mal_13", "precio_regular_17", "precio_bien_23",
        "precio_vida_deportiva", "valor_minimo_usado",
        "porcentaje_15", "porcentaje_20", "porcentaje_23", "compatibilidad",
    ]

    placeholders = ", ".join(["?"] * len(cols))
    sql = f"INSERT INTO vehiculos_referencia ({', '.join(cols)}) VALUES ({placeholders})"

    rows = []
    for v in registros:
        row = tuple(v.get(c) for c in cols)
        rows.append(row)

    cur.executemany(sql, rows)
    conn.commit()

    count_despues = cur.execute("SELECT COUNT(*) FROM vehiculos_referencia").fetchone()[0]
    marcas_total = cur.execute("SELECT COUNT(DISTINCT marca) FROM vehiculos_referencia").fetchone()[0]
    print(f"[OK] Añadidos {count_despues - count_antes} registros")
    print(f"[OK] Total en BD: {count_despues} registros, {marcas_total} marcas")

    # Muestra
    print("\n── Muestra (3 primeros registros nuevos) ──")
    for r in registros[:3]:
        print(f"  {r['marca']} {r['modelo']} {r['rango_anios']} - {r.get('observaciones_facelift', '')}")

    conn.close()


if __name__ == "__main__":
    main()
