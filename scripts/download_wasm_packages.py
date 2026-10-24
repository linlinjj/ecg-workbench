"""Fetch numerical test wheels from the official Pyodide CDN, with hash verification."""
import hashlib
import json
from pathlib import Path
import requests

root = Path(__file__).resolve().parents[1]
lock = json.loads((root/'node_modules/pyodide/pyodide-lock.json').read_text())
target = root/'.cache/pyodide'
target.mkdir(parents=True, exist_ok=True)
for name in ['numpy','scipy']:
    pkg=lock['packages'][name]
    dest=target/pkg['file_name']
    if not dest.exists() or hashlib.sha256(dest.read_bytes()).hexdigest()!=pkg['sha256']:
        response=requests.get('https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'+pkg['file_name'],timeout=120)
        response.raise_for_status()
        if hashlib.sha256(response.content).hexdigest()!=pkg['sha256']:
            raise RuntimeError('WASM dependency hash mismatch: '+name)
        dest.write_bytes(response.content)
    print(name, 'verified', dest.stat().st_size)
