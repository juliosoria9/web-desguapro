import base64

def b64(value: str) -> str:
    """Codifica string a base64"""
    return base64.b64encode(value.encode()).decode()

def b64_decode(value: str) -> str:
    """Decodifica base64 a string"""
    return base64.b64decode(value.encode()).decode()
