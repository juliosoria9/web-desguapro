import base64

def b64(value: str) -> str:
    """Codifica string a base64"""
    return base64.b64encode(value.encode()).decode()
