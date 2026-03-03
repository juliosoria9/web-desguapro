"""
Script para recuperar fichadas perdidas desde datos extraídos con strings del DB corrupto.
Ejecutar en VPS: cd /var/www/motocoche/backend && source venv/bin/activate && python3 scripts/recuperar_fichadas_strings.py
"""
import sqlite3
import sys
from datetime import datetime

DB_PATH = "desguapro.db"

# =============================================================================
# DATOS RECUPERADOS del strings del archivo corrupto (binario)
# Formato: (id_pieza, fecha_fichada)
# Rango perdido: 2026-03-03 08:44 ~ 12:18 (IDs originales ~6468-6622)
# Fuentes: registros piezas_desguace con fecha_fichaje + logs "Fichada creada:"
# Total: 108 fichadas únicas recuperadas (~70% del total perdido)
# =============================================================================

FICHADAS_RECUPERADAS = [
    # --- 08:44 ---
    ("1470268", "2026-03-03 08:44:14.802274"),
    # --- 09:xx ---
    ("1521058", "2026-03-03 09:45:04.185252"),
    ("1524310", "2026-03-03 09:47:02.706231"),
    ("1523985", "2026-03-03 09:49:43.622183"),
    ("1826589", "2026-03-03 09:51:55.736010"),
    ("1524620", "2026-03-03 09:53:59.024670"),
    ("1835580", "2026-03-03 09:54:23.984490"),
    ("1521048", "2026-03-03 09:55:14.378639"),
    ("1524312", "2026-03-03 09:55:43.094932"),
    # --- 10:0x ---
    ("1520909", "2026-03-03 10:05:38.570171"),
    ("1524313", "2026-03-03 10:06:00.824631"),
    ("1835059", "2026-03-03 10:06:59.591349"),
    ("1462657", "2026-03-03 10:07:44.368727"),
    # --- 10:1x ---
    ("1515089", "2026-03-03 10:11:39.701881"),
    ("1524308", "2026-03-03 10:12:38.835167"),
    ("1500993", "2026-03-03 10:16:57.532979"),
    ("1524320", "2026-03-03 10:19:23.088366"),
    ("1515342", "2026-03-03 10:19:56.282585"),
    # --- 10:2x ---
    ("1520908", "2026-03-03 10:20:19.780850"),
    ("1365030", "2026-03-03 10:20:21.665856"),
    ("1515140", "2026-03-03 10:23:29.225079"),
    ("1835132", "2026-03-03 10:23:59.764988"),
    ("1515335", "2026-03-03 10:26:29.327943"),
    ("1522957", "2026-03-03 10:26:50.464508"),
    ("1522599", "2026-03-03 10:26:53.407088"),
    ("1500667", "2026-03-03 10:29:20.023185"),
    ("1835077", "2026-03-03 10:29:41.166538"),
    ("1524585", "2026-03-03 10:29:50.928246"),
    # --- 10:3x ---
    ("992631",  "2026-03-03 10:33:00.987935"),
    ("1515215", "2026-03-03 10:33:36.332792"),
    ("1523937", "2026-03-03 10:35:34.920899"),
    ("1524586", "2026-03-03 10:35:35.058970"),
    ("1524583", "2026-03-03 10:38:42.839662"),
    ("1523978", "2026-03-03 10:39:58.479395"),
    ("1515254", "2026-03-03 10:40:01.616452"),
    ("1835084", "2026-03-03 10:40:31.355699"),
    ("1835045", "2026-03-03 10:40:35.638898"),
    ("1524589", "2026-03-03 10:40:59.634108"),
    # --- 10:4x ---
    ("1489399", "2026-03-03 10:41:26.660380"),
    ("1524296", "2026-03-03 10:44:32.118671"),
    ("1840109", "2026-03-03 10:44:47.543511"),
    ("992765",  "2026-03-03 10:45:12.120683"),
    ("1515228", "2026-03-03 10:45:14.125602"),
    ("1524621", "2026-03-03 10:45:48.914349"),
    ("1840110", "2026-03-03 10:47:41.471545"),
    ("1524622", "2026-03-03 10:48:04.458075"),
    ("1524591", "2026-03-03 10:48:10.368684"),
    ("992761",  "2026-03-03 10:49:30.194893"),
    # --- 10:5x ---
    ("1517191", "2026-03-03 10:50:03.014651"),
    ("1524623", "2026-03-03 10:51:03.179628"),
    ("1524624", "2026-03-03 10:51:08.254539"),
    ("1521069", "2026-03-03 10:51:10.449186"),
    ("1524322", "2026-03-03 10:53:29.071727"),
    ("1515244", "2026-03-03 10:55:37.634266"),
    ("992750",  "2026-03-03 10:55:53.759717"),
    ("1524625", "2026-03-03 10:56:02.480532"),
    ("1524626", "2026-03-03 10:56:08.252550"),
    ("1524584", "2026-03-03 10:56:47.767000"),
    ("1835018", "2026-03-03 10:58:12.723943"),
    ("1524627", "2026-03-03 10:58:13.992153"),
    # --- 11:0x ---
    ("992774",  "2026-03-03 11:00:29.161120"),
    ("1524628", "2026-03-03 11:01:17.464402"),
    ("1835050", "2026-03-03 11:01:56.981193"),
    ("992766",  "2026-03-03 11:03:48.228095"),
    ("1523992", "2026-03-03 11:06:20.779083"),
    ("1517520", "2026-03-03 11:07:12.688983"),
    ("1835097", "2026-03-03 11:07:28.258876"),
    ("1365007", "2026-03-03 11:07:46.943135"),
    # --- 11:1x ---
    ("1522626", "2026-03-03 11:10:59.167622"),
    ("1515256", "2026-03-03 11:11:09.977268"),
    ("1524000", "2026-03-03 11:11:44.766854"),
    ("992752",  "2026-03-03 11:13:12.556721"),
    ("1523528", "2026-03-03 11:13:42.296790"),
    ("1523940", "2026-03-03 11:16:07.062699"),
    ("1523529", "2026-03-03 11:19:21.434437"),
    ("1822199", "2026-03-03 11:19:35.448265"),
    ("1835129", "2026-03-03 11:19:38.389129"),
    ("1515217", "2026-03-03 11:19:56.626479"),
    ("1491192", "2026-03-03 11:20:11.551241"),
    ("992755",  "2026-03-03 11:20:11.666455"),
    ("1523995", "2026-03-03 11:20:36.303876"),
    # --- 11:2x ---
    ("1835130", "2026-03-03 11:25:00.181896"),
    ("992747",  "2026-03-03 11:26:28.524949"),
    ("1523531", "2026-03-03 11:27:30.936375"),
    ("1515303", "2026-03-03 11:29:28.425713"),
    # --- 11:3x ---
    ("1835047", "2026-03-03 11:30:11.283764"),
    ("1835046", "2026-03-03 11:33:45.678113"),
    ("1524601", "2026-03-03 11:34:57.874388"),
    ("992738",  "2026-03-03 11:35:06.329158"),
    ("992737",  "2026-03-03 11:37:25.618700"),
    ("1825458", "2026-03-03 11:38:58.557405"),
    # --- 11:4x ---
    ("1473035", "2026-03-03 11:40:52.091325"),
    ("992739",  "2026-03-03 11:45:40.465982"),
    ("1438567", "2026-03-03 11:46:58.368618"),
    ("1524595", "2026-03-03 11:47:17.719506"),
    ("1524602", "2026-03-03 11:47:47.115670"),
    # --- 11:5x ---
    ("1524599", "2026-03-03 11:50:34.516318"),
    ("1835113", "2026-03-03 11:52:15.548144"),
    ("1835112", "2026-03-03 11:53:44.220522"),
    ("1523974", "2026-03-03 11:57:42.191091"),
    # --- 11:59-12:xx ---
    ("1835068", "2026-03-03 11:59:38.590316"),
    ("992732",  "2026-03-03 11:59:48.459718"),
    ("1476262", "2026-03-03 12:02:03.810746"),
    ("1524889", "2026-03-03 12:05:20.514432"),
    ("1835067", "2026-03-03 12:06:05.136979"),
    ("1524890", "2026-03-03 12:09:34.980203"),
    ("992730",  "2026-03-03 12:14:24.671559"),
    ("1414108", "2026-03-03 12:17:48.726993"),
]

# Fichada eliminada (no insertar): 1523529 a las 11:19:29 (fue borrada y recreada a las 11:19:21)


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Obtener info del entorno y usuario
    print("=" * 60)
    print("RECUPERACIÓN DE FICHADAS DESDE STRINGS")
    print("=" * 60)

    # Verificar entorno_trabajo_id = 7 (Motocoche)
    cur.execute("SELECT id, nombre FROM entornos_trabajo WHERE id = 7")
    entorno = cur.fetchone()
    if entorno:
        print(f"\nEntorno: {entorno[0]} - {entorno[1]}")
    else:
        print("ERROR: No se encontró entorno_trabajo_id=7")
        return

    # Ver qué usuarios hicieron fichadas hoy
    print("\nUsuarios que ficharon hoy (2026-03-03):")
    cur.execute("""
        SELECT DISTINCT f.usuario_id, u.email, COUNT(*) as total
        FROM fichadas_piezas f
        JOIN usuarios u ON u.id = f.usuario_id
        WHERE DATE(f.fecha_fichada) = '2026-03-03'
        GROUP BY f.usuario_id
        ORDER BY total DESC
    """)
    usuarios_hoy = cur.fetchall()
    for uid, email, total in usuarios_hoy:
        print(f"  usuario_id={uid} ({email}): {total} fichadas")

    if not usuarios_hoy:
        print("  No se encontraron fichadas hoy. Necesitamos el usuario_id manualmente.")
        usuario_id = int(input("  Introduce el usuario_id para las fichadas: "))
    elif len(usuarios_hoy) == 1:
        usuario_id = usuarios_hoy[0][0]
        print(f"\n  -> Usando usuario_id={usuario_id} ({usuarios_hoy[0][1]})")
    else:
        print(f"\n  Hay {len(usuarios_hoy)} usuarios. ¿Cuál usamos para las fichadas recuperadas?")
        usuario_id = int(input("  Introduce el usuario_id: "))

    # 2. Ver fichadas existentes en la ventana perdida
    print(f"\nFichadas existentes entre 08:44 y 12:18:")
    cur.execute("""
        SELECT id, id_pieza, fecha_fichada
        FROM fichadas_piezas
        WHERE DATE(fecha_fichada) = '2026-03-03'
        AND TIME(fecha_fichada) >= '08:44:00'
        AND TIME(fecha_fichada) <= '12:18:00'
        ORDER BY fecha_fichada
    """)
    existentes = cur.fetchall()
    print(f"  {len(existentes)} fichadas ya existen en ese rango")
    existing_piezas = set()
    for fid, fpieza, ffecha in existentes:
        existing_piezas.add(fpieza)
        print(f"    ID={fid} pieza={fpieza} fecha={ffecha}")

    # 3. Filtrar las que ya existen
    nuevas = []
    duplicadas = []
    for id_pieza, fecha in FICHADAS_RECUPERADAS:
        # Verificar si ya existe exacta
        cur.execute("""
            SELECT id FROM fichadas_piezas
            WHERE id_pieza = ? AND entorno_trabajo_id = 7
            AND fecha_fichada BETWEEN ? AND datetime(?, '+2 minutes')
        """, (id_pieza, fecha[:19], fecha[:19]))
        if cur.fetchone():
            duplicadas.append((id_pieza, fecha))
        else:
            nuevas.append((id_pieza, fecha))

    print(f"\n--- RESUMEN ---")
    print(f"Total fichadas recuperadas del strings: {len(FICHADAS_RECUPERADAS)}")
    print(f"Ya existen en BD: {len(duplicadas)}")
    print(f"Nuevas a insertar: {len(nuevas)}")

    if not nuevas:
        print("\n¡Todas las fichadas recuperadas ya existen! No hay nada que insertar.")
        conn.close()
        return

    # 4. Mostrar las que se van a insertar
    print(f"\nFichadas a insertar (usuario_id={usuario_id}, entorno=7):")
    for i, (id_pieza, fecha) in enumerate(sorted(nuevas, key=lambda x: x[1]), 1):
        print(f"  {i:3d}. pieza={id_pieza:>8s}  fecha={fecha[:19]}")

    # 5. Confirmar
    print(f"\n¿Insertar {len(nuevas)} fichadas? (s/n)")
    resp = input("> ").strip().lower()
    if resp != 's':
        print("Cancelado.")
        conn.close()
        return

    # 6. Insertar
    insertadas = 0
    errores = 0
    for id_pieza, fecha in sorted(nuevas, key=lambda x: x[1]):
        try:
            cur.execute("""
                INSERT INTO fichadas_piezas (usuario_id, entorno_trabajo_id, id_pieza, descripcion, comentario, fecha_fichada)
                VALUES (?, 7, ?, NULL, '[Recuperada de DB corrupta]', ?)
            """, (usuario_id, id_pieza, fecha))
            insertadas += 1
        except Exception as e:
            print(f"  ERROR insertando pieza {id_pieza}: {e}")
            errores += 1

    conn.commit()

    # 7. Verificar
    cur.execute("""
        SELECT COUNT(*) FROM fichadas_piezas
        WHERE DATE(fecha_fichada) = '2026-03-03'
        AND entorno_trabajo_id = 7
    """)
    total_hoy = cur.fetchone()[0]

    print(f"\n--- RESULTADO ---")
    print(f"Insertadas: {insertadas}")
    print(f"Errores: {errores}")
    print(f"Total fichadas hoy: {total_hoy}")

    # 8. También actualizar fecha_fichaje en piezas_desguace si aplica
    print(f"\n¿Actualizar también fecha_fichaje en piezas_desguace para estas piezas? (s/n)")
    resp2 = input("> ").strip().lower()
    if resp2 == 's':
        actualizadas = 0
        for id_pieza, fecha in sorted(nuevas, key=lambda x: x[1]):
            cur.execute("""
                UPDATE piezas_desguace
                SET fecha_fichaje = ?, usuario_fichaje_id = ?
                WHERE refid = ? AND base_desguace_id IN (
                    SELECT id FROM bases_desguace WHERE entorno_trabajo_id = 7
                )
                AND fecha_fichaje IS NULL
            """, (fecha, usuario_id, id_pieza))
            if cur.rowcount > 0:
                actualizadas += 1
        conn.commit()
        print(f"Piezas actualizadas con fecha_fichaje: {actualizadas}")

    conn.close()
    print("\n¡Recuperación completada!")


if __name__ == "__main__":
    main()
