import csv

csv_path = 'StockSeinto.csv'

# Usar utf-8-sig para manejar BOM automáticamente
with open(csv_path, 'r', encoding='utf-8-sig', errors='replace') as f:
    primera_linea = f.readline()
    f.seek(0)
    delimitador = ';' if ';' in primera_linea else ','
    reader = csv.reader(f, delimiter=delimitador)
    cabeceras = next(reader)
    cabeceras = [c.strip().lower().lstrip('\ufeff') for c in cabeceras]
    
    # Contar filas
    count = 0
    refids = []
    for fila in reader:
        if len(fila) >= len(cabeceras) / 2:
            if fila and fila[0]:
                fila[0] = fila[0].lstrip('\ufeff')
            count += 1
            if count <= 3:
                refids.append(fila[0])
    
    print(f"Cabeceras: {cabeceras[:5]}")
    print(f"Total filas: {count}")
    print(f"Primeros ref.id: {refids}")
