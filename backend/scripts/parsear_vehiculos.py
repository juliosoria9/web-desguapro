"""
Parser del Excel visual "AÑOS VEHICULOS - MODERNOS" a JSON estructurado.
Lee el CSV exportado del Excel y genera un JSON limpio con todos los vehículos,
sus rangos de años, precios por estado de pieza, observaciones de facelifts, etc.
"""
import csv
import json
import re
import sys
import os


def limpiar_precio(valor: str) -> float | None:
    """Intenta extraer un número de un campo de precio que puede tener texto mixto."""
    if not valor or not valor.strip():
        return None
    val = valor.strip().replace(",", ".")
    # Buscar el primer número (entero o decimal)
    m = re.search(r"(\d+\.?\d*)", val)
    return float(m.group(1)) if m else None


def es_fila_vacia(row: list[str]) -> bool:
    """Comprueba si la fila está completamente vacía."""
    return all(not c.strip() for c in row)


def es_fila_marca(row: list[str]) -> bool:
    """Detecta filas que solo son cabecera de marca (col A tiene texto, resto vacío)."""
    if not row[0].strip():
        return False
    # Si col A tiene texto pero cols de precio están vacías
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
        # Asegurar al menos 21 columnas
        while len(fila) < 21:
            fila.append("")

        col_a = fila[0].strip()   # Marca / Modelo principal
        col_b = fila[1].strip()   # Modelo específico
        col_c = fila[2].strip()   # Años de producción
        col_d = fila[3].strip()   # (a veces enlace o vacío)
        col_e = fila[4].strip()   # Rango de años (ej: 16-19, 23>)
        col_f = fila[5].strip()   # Serie (S)
        col_g = fila[6].strip()   # Deportiva (D)
        col_h = fila[7].strip()   # Observaciones / cambios facelift
        col_i = fila[8].strip()   # Rango años (repetido)
        col_j = fila[9].strip()   # Serie 1G
        col_k = fila[10].strip()  # Serie 2G
        col_l = fila[11].strip()  # Serie 3G / solo motor
        col_m = fila[12].strip()  # FATAL/10%
        col_n = fila[13].strip()  # MAL/13%
        col_o = fila[14].strip()  # REGU/17%
        col_p = fila[15].strip()  # BIEN/23%
        col_q = fila[16].strip()  # vida (versión deportiva)
        col_r = fila[17].strip()  # Valor mínimo usado
        col_s = fila[18].strip()  # 15%
        col_t = fila[19].strip()  # 20%
        col_u = fila[20].strip()  # 23%

        # Fila vacía → saltar
        if es_fila_vacia(fila):
            continue

        # Detectar marca (fila donde solo col A tiene texto y no hay datos de precio)
        if col_a and not col_b and not col_e and es_fila_marca(fila):
            marca_actual = col_a.strip().upper()
            modelo_actual = ""
            anios_produccion_actual = ""
            continue

        # Actualizar modelo si col A o col B tienen valor
        if col_a and col_a.upper() != marca_actual:
            # Col A puede tener el nombre del grupo de modelos
            # (ej: "GIULIA", "A1", "SERIE 1")
            pass  # Se maneja abajo con col_b

        if col_b:
            modelo_actual = col_b.strip()
        if col_c:
            anios_produccion_actual = col_c.strip()

        # Si col A tiene un modelo (no marca) y col B está vacío
        if col_a and not col_b and col_e:
            # col_a es el modelo en este caso (primera fila del modelo)
            modelo_actual = col_a.strip()

        # Necesitamos al menos un rango de años para considerarlo un registro válido
        if not col_e:
            # Puede ser una fila de observaciones puras o nota → intentar capturar
            if col_h and registros:
                # Añadir observación al último registro
                obs_existente = registros[-1].get("observaciones", "")
                if obs_existente:
                    registros[-1]["observaciones"] = obs_existente + " | " + col_h
                else:
                    registros[-1]["observaciones"] = col_h

                # Verificar compatibilidades
                compat = registros[-1].get("compatibilidad", "")
                texto_lower = col_h.lower()
                if "marcar validez" in texto_lower or "comparte" in texto_lower or "compartida" in texto_lower:
                    if compat:
                        registros[-1]["compatibilidad"] = compat + " | " + col_h
                    else:
                        registros[-1]["compatibilidad"] = col_h
            continue

        # --- Construir registro ---
        registro = {
            "marca": marca_actual,
            "modelo": modelo_actual,
            "anios_produccion": anios_produccion_actual,
            "rango_anios": col_e,
            "tiene_serie": col_f.upper() == "S",
            "tiene_deportiva": col_g.upper() == "D",
            "observaciones_facelift": col_h if col_h else None,
            "serie_1g": col_j if col_j else None,
            "serie_2g": col_k if col_k else None,
            "serie_3g": col_l if col_l else None,
            "precio_fatal_10": limpiar_precio(col_m),
            "precio_mal_13": limpiar_precio(col_n),
            "precio_regular_17": limpiar_precio(col_o),
            "precio_bien_23": limpiar_precio(col_p),
            "precio_vida_deportiva": limpiar_precio(col_q),
            "valor_minimo_usado": limpiar_precio(col_r),
            "porcentaje_15": limpiar_precio(col_s),
            "porcentaje_20": limpiar_precio(col_t),
            "porcentaje_23": limpiar_precio(col_u),
        }

        # Extraer compatibilidad de observaciones si la hay
        if col_h:
            texto_lower = col_h.lower()
            if "marcar validez" in texto_lower or "comparte" in texto_lower or "compartida" in texto_lower:
                registro["compatibilidad"] = col_h

        registros.append(registro)

    return registros


def main():
    ruta_csv = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "..", "..",
        "08- AÑOS VEHICULOS.xlsx - MODERNOS LANZADOS A PARTIR DE 2008.csv"
    )

    # Usar la ruta de Downloads si no se pasa argumento
    if not os.path.exists(ruta_csv):
        ruta_csv = r"c:\Users\julio\Downloads\08- AÑOS VEHICULOS.xlsx - MODERNOS LANZADOS A PARTIR DE 2008.csv"

    if not os.path.exists(ruta_csv):
        print(f"[ERROR] No se encontró: {ruta_csv}")
        sys.exit(1)

    print(f"[INFO] Leyendo: {ruta_csv}")
    registros = parsear_csv(ruta_csv)

    # Estadísticas
    marcas = set(r["marca"] for r in registros)
    modelos = set(f"{r['marca']} {r['modelo']}" for r in registros)

    print(f"[OK] {len(registros)} registros parseados")
    print(f"     {len(marcas)} marcas: {', '.join(sorted(marcas)[:15])}...")
    print(f"     {len(modelos)} modelos únicos")

    # Guardar JSON
    ruta_salida = os.path.join(os.path.dirname(__file__), "..", "data", "vehiculos_modernos.json")
    os.makedirs(os.path.dirname(ruta_salida), exist_ok=True)
    with open(ruta_salida, "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False, indent=2)
    print(f"[OK] JSON guardado en: {ruta_salida}")

    # También guardar un CSV limpio
    ruta_csv_out = os.path.join(os.path.dirname(__file__), "..", "data", "vehiculos_modernos.csv")
    campos = [
        "marca", "modelo", "anios_produccion", "rango_anios",
        "tiene_serie", "tiene_deportiva", "observaciones_facelift",
        "serie_1g", "serie_2g", "serie_3g",
        "precio_fatal_10", "precio_mal_13", "precio_regular_17", "precio_bien_23",
        "precio_vida_deportiva", "valor_minimo_usado",
        "porcentaje_15", "porcentaje_20", "porcentaje_23",
    ]
    with open(ruta_csv_out, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=campos, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(registros)
    print(f"[OK] CSV limpio guardado en: {ruta_csv_out}")

    # Mostrar muestra
    print("\n── Muestra (3 primeros registros) ──")
    for r in registros[:3]:
        print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
