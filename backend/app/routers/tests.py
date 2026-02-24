"""
Router para ejecutar tests del sistema desde el panel de administración.
Solo accesible por sysowner.
Incluye SSE streaming para progreso en tiempo real.
"""
import ast
import subprocess
import sys
import json
import os
import re
import logging
import asyncio
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from app.dependencies import get_current_sysowner
from app.models.busqueda import Usuario

logger = logging.getLogger(__name__)
router = APIRouter()

TESTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "tests")
PYTHON_EXE = sys.executable

TEST_SUITES = {
    "smoke_tests": {
        "archivo": "test_smoke.py",
        "nombre": "Smoke Tests",
        "descripcion": "Verifica que TODOS los endpoints responden sin errores 500 (150 APIs)",
    },
    "apis_precios": {
        "archivo": "test_apis_precios.py",
        "nombre": "APIs de Precios",
        "descripcion": "Scrapers de precios, detección de outliers, factory, endpoints",
    },
    "scrapers_iam": {
        "archivo": "test_scrapers_iam.py",
        "nombre": "Scrapers IAM",
        "descripcion": "Scrapers de referencias IAM, CSV locales, búsqueda paralela",
    },
    "funcionalidades_web": {
        "archivo": "test_funcionalidades_web.py",
        "nombre": "Funcionalidades Web",
        "descripcion": "BD, auth, roles, tickets, anuncios, paquetería, fichadas, config",
    },
}


def _sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _count_tests_in_file(archivo: str) -> tuple[int, str | None]:
    """Cuenta tests rápido con collect-only. Retorna (count, error_msg)."""
    test_path = os.path.join(TESTS_DIR, archivo)
    backend_dir = os.path.dirname(TESTS_DIR)

    if not os.path.isfile(test_path):
        return 0, f"Archivo no encontrado: {test_path}"

    try:
        proc = subprocess.run(
            [PYTHON_EXE, "-m", "pytest", test_path, "--collect-only", "-q", "-W", "ignore"],
            capture_output=True, text=True, timeout=30, cwd=backend_dir,
        )
        for line in proc.stdout.split("\n"):
            m = re.match(r"(\d+) tests? collected", line.strip())
            if m:
                return int(m.group(1)), None
        # No tests collected — capture stderr for diagnostics
        err = (proc.stderr or "").strip()
        out = (proc.stdout or "").strip()
        detail = err or out or f"pytest exit code {proc.returncode}"
        return 0, f"0 tests recolectados: {detail[:500]}"
    except FileNotFoundError:
        return 0, f"pytest no encontrado (python: {PYTHON_EXE})"
    except subprocess.TimeoutExpired:
        return 0, "Timeout al recolectar tests (30s)"
    except Exception as e:
        return 0, f"Error: {e}"


def _extract_test_descriptions(archivo: str) -> dict[str, str]:
    """Extrae docstrings de los tests usando AST. Retorna {ClassName.test_name: docstring}."""
    test_path = os.path.join(TESTS_DIR, archivo)
    descriptions: dict[str, str] = {}
    try:
        with open(test_path, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read(), filename=archivo)
        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            class_name = node.name
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name.startswith("test_"):
                    doc = ast.get_docstring(item)
                    if doc:
                        descriptions[f"{class_name}.{item.name}"] = doc.strip()
    except Exception as e:
        logger.warning(f"No se pudieron extraer descripciones de {archivo}: {e}")
    return descriptions


def _run_suite_streaming(archivo: str, suite_id: str, suite_nombre: str):
    """
    Generador que ejecuta pytest y yield eventos SSE por cada test.
    Usa --tb=long para máximo detalle en errores.
    """
    test_path = os.path.join(TESTS_DIR, archivo)
    backend_dir = os.path.dirname(TESTS_DIR)

    # Extraer descripciones y contar tests
    descriptions = _extract_test_descriptions(archivo)
    total_expected, collect_error = _count_tests_in_file(archivo)

    suite_start_data = {
        "suite": suite_id,
        "nombre": suite_nombre,
        "archivo": archivo,
        "total_esperado": total_expected,
        "tests_dir": TESTS_DIR,
        "python_exe": PYTHON_EXE,
        "archivo_existe": os.path.isfile(test_path),
    }
    if collect_error:
        suite_start_data["collect_error"] = collect_error

    yield _sse_event("suite_start", suite_start_data)

    cmd = [PYTHON_EXE, "-m", "pytest", test_path, "-v", "--tb=long", "-W", "ignore", "--no-header"]

    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, cwd=backend_dir,
        )
    except Exception as e:
        yield _sse_event("error", {"mensaje": f"No se pudo iniciar pytest: {e}"})
        yield _sse_event("done", {})
        return

    completed = 0
    passed = 0
    failed = 0
    skipped = 0
    errors = 0
    all_tests = []
    current_failure_block: list[str] = []
    capturing_failure = False
    failure_nodeid = ""
    failure_blocks: dict[str, str] = {}  # nodeid -> traceback completo
    duration = 0.0

    def flush_failure():
        nonlocal capturing_failure, failure_nodeid, current_failure_block
        if capturing_failure and failure_nodeid and current_failure_block:
            full_trace = "\n".join(current_failure_block).strip()
            failure_blocks[failure_nodeid] = full_trace
        capturing_failure = False
        failure_nodeid = ""
        current_failure_block = []

    for raw_line in proc.stdout:
        line = raw_line.rstrip("\n\r")

        # Detect failure section headers: "_ _ _ _" or "FAILURES" or "=== FAILURES ==="
        if re.match(r"^=+ FAILURES =+$", line.strip()):
            flush_failure()
            capturing_failure = False
            continue

        # Individual failure header: ___ TestClass.test_name ___
        m_fail_header = re.match(r"^_{3,}\s+(.+?)\s+_{3,}$", line.strip())
        if m_fail_header:
            flush_failure()
            capturing_failure = True
            failure_nodeid = m_fail_header.group(1).strip()
            current_failure_block = []
            continue

        # Short test summary header
        if re.match(r"^=+ short test summary info =+$", line.strip()):
            flush_failure()
            continue

        # Final summary line
        m_summary = re.match(r"^=+\s+(.+)\s+in\s+([\d.]+)s\s+=+$", line.strip())
        if m_summary:
            flush_failure()
            dur_str = m_summary.group(2)
            try:
                duration = float(dur_str)
            except ValueError:
                pass
            continue

        if capturing_failure:
            current_failure_block.append(line)
            continue

        # Forward unmatched non-empty lines as log events (import errors, warnings, etc.)
        stripped = line.strip()
        if stripped and not re.match(r"^[-=]{3,}$", stripped) and not stripped.startswith("FAILED "):
            # Check for collection errors or import errors
            if "ERROR" in stripped or "ImportError" in stripped or "ModuleNotFoundError" in stripped or "No module named" in stripped:
                yield _sse_event("log", {"tipo": "error", "mensaje": stripped})

        # Test result line: path::Class::method PASSED/FAILED/SKIPPED [XX%]
        m_test = re.match(
            r"^(.+?::.+?)\s+(PASSED|FAILED|SKIPPED|ERROR)\s+\[\s*(\d+)%\]",
            line.strip()
        )
        if m_test:
            nodeid = m_test.group(1).strip()
            outcome = m_test.group(2).lower()
            pct = int(m_test.group(3))

            parts = nodeid.split("::")
            clase = parts[1] if len(parts) > 1 else ""
            nombre = parts[-1] if parts else nodeid

            completed += 1
            if outcome == "passed":
                passed += 1
            elif outcome == "failed":
                failed += 1
            elif outcome == "skipped":
                skipped += 1
            else:
                errors += 1

            desc_key = f"{clase}.{nombre}" if clase else nombre
            descripcion = descriptions.get(desc_key, "")

            test_data = {
                "nombre": nombre,
                "clase": clase,
                "resultado": outcome,
                "nodeid": nodeid,
                "porcentaje": pct,
                "indice": completed,
                "total_esperado": total_expected,
                "mensaje_error": None,
                "descripcion": descripcion,
            }
            all_tests.append(test_data)

            yield _sse_event("test_result", {
                **test_data,
                "resumen_parcial": {
                    "completados": completed,
                    "passed": passed,
                    "failed": failed,
                    "skipped": skipped,
                    "total_esperado": total_expected,
                },
            })

    proc.wait()
    flush_failure()

    # Enrich failed tests with traceback
    for t in all_tests:
        if t["resultado"] == "failed":
            nodeid = t["nodeid"]
            short_key = t["clase"] + "." + t["nombre"] if t["clase"] else t["nombre"]
            trace = failure_blocks.get(nodeid) or failure_blocks.get(short_key) or failure_blocks.get(t["nombre"])
            # Try partial match
            if not trace:
                for k, v in failure_blocks.items():
                    if t["nombre"] in k or k in nodeid:
                        trace = v
                        break
            t["mensaje_error"] = trace or "Test falló (sin traceback disponible)"

    # Send failure details
    for t in all_tests:
        if t["resultado"] == "failed" and t["mensaje_error"]:
            yield _sse_event("failure_detail", {
                "nombre": t["nombre"],
                "clase": t["clase"],
                "nodeid": t["nodeid"],
                "traceback": t["mensaje_error"],
            })

    yield _sse_event("suite_end", {
        "suite": suite_id,
        "nombre": suite_nombre,
        "total": completed,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "errores": errors,
        "duracion": round(duration, 2),
        "tests": [{k: v for k, v in t.items() if k != "nodeid"} for t in all_tests],
    })


@router.get("/suites")
async def listar_suites(_: Usuario = Depends(get_current_sysowner)):
    """Lista las suites de tests disponibles."""
    return [
        {"id": k, "nombre": v["nombre"], "descripcion": v["descripcion"], "archivo": v["archivo"]}
        for k, v in TEST_SUITES.items()
    ]


@router.get("/ejecutar-stream/{suite_id}")
async def ejecutar_suite_stream(suite_id: str, request: Request, current_user: Usuario = Depends(get_current_sysowner)):
    """Ejecuta tests con SSE streaming para progreso en tiempo real."""

    def generate():
        if suite_id == "todos":
            suites_list = list(TEST_SUITES.items())
            yield _sse_event("run_start", {
                "modo": "todos",
                "total_suites": len(suites_list),
            })
            for sid, suite in suites_list:
                yield from _run_suite_streaming(suite["archivo"], sid, suite["nombre"])
        else:
            suite = TEST_SUITES.get(suite_id)
            if not suite:
                yield _sse_event("error", {"mensaje": f"Suite '{suite_id}' no encontrada"})
                yield _sse_event("done", {})
                return
            yield _sse_event("run_start", {"modo": "single", "total_suites": 1})
            yield from _run_suite_streaming(suite["archivo"], suite_id, suite["nombre"])

        yield _sse_event("done", {})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/ejecutar/{suite_id}")
async def ejecutar_suite(suite_id: str, _: Usuario = Depends(get_current_sysowner)):
    """Ejecuta una suite de tests (respuesta completa, sin streaming)."""

    def run_fallback(archivo: str) -> dict:
        test_path = os.path.join(TESTS_DIR, archivo)
        backend_dir = os.path.dirname(TESTS_DIR)
        cmd = [PYTHON_EXE, "-m", "pytest", test_path, "-v", "--tb=short", "-W", "ignore"]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=backend_dir)
        except subprocess.TimeoutExpired:
            return {"total": 0, "passed": 0, "failed": 0, "errores": 1, "skipped": 0, "duracion": 0, "tests": []}

        output = proc.stdout + "\n" + proc.stderr
        lines = output.split("\n")
        tests = []
        error_lines_map = {}

        for line in lines:
            if line.strip().startswith("FAILED "):
                parts_f = line.strip().split(" - ")
                emsg = parts_f[1].strip() if len(parts_f) > 1 else ""
                nid = parts_f[0].replace("FAILED ", "").strip()
                error_lines_map[nid] = emsg

        for line in lines:
            stripped = line.strip()
            m_test = re.match(r"^(.+?::.+?)\s+(PASSED|FAILED|SKIPPED|ERROR)\s+\[\s*\d+%\]", stripped)
            if not m_test:
                continue
            nodeid = m_test.group(1).strip()
            outcome = m_test.group(2).lower()
            parts = nodeid.split("::")
            clase = parts[1] if len(parts) > 1 else ""
            nombre = parts[-1] if parts else nodeid
            error_msg = None
            if outcome == "failed":
                error_msg = error_lines_map.get(nodeid, "Test falló")
                if not error_msg or error_msg == "Test falló":
                    for k, v in error_lines_map.items():
                        if nombre in k:
                            error_msg = v
                            break
            tests.append({"nombre": nombre, "clase": clase, "resultado": outcome, "duracion": 0, "mensaje_error": error_msg})

        p = sum(1 for t in tests if t["resultado"] == "passed")
        f = sum(1 for t in tests if t["resultado"] == "failed")
        s = sum(1 for t in tests if t["resultado"] == "skipped")
        dur = 0.0
        for line in lines:
            m = re.search(r"in ([\d.]+)s\s*=", line)
            if m:
                dur = float(m.group(1))
        return {"total": len(tests), "passed": p, "failed": f, "errores": 0, "skipped": s, "duracion": round(dur, 2), "tests": tests}

    if suite_id == "todos":
        resultados = {}
        tg, pg, fg, sg, dg = 0, 0, 0, 0, 0.0
        for sid, suite in TEST_SUITES.items():
            r = run_fallback(suite["archivo"])
            resultados[sid] = r
            tg += r["total"]; pg += r["passed"]; fg += r["failed"]; sg += r["skipped"]; dg += r["duracion"]
        return {"suite": "todos", "nombre": "Todas las suites", "resumen": {"total": tg, "passed": pg, "failed": fg, "skipped": sg, "duracion": round(dg, 2)}, "suites": resultados}

    suite = TEST_SUITES.get(suite_id)
    if not suite:
        raise HTTPException(status_code=404, detail="Suite no encontrada")
    result = run_fallback(suite["archivo"])
    return {"suite": suite_id, "nombre": suite["nombre"], **result}

