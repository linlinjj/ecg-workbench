"""Create a clean portable source release, with a SHA-256 manifest."""
import hashlib
import json
import os
import zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text(encoding='utf8'))['version']
output=root/'artifacts';output.mkdir(exist_ok=True)
skip_dirs={'.git','.venv','node_modules','.cache','.verification','artifacts','__pycache__','.pytest_cache','dist'}
files=[]
for folder,dirs,names in os.walk(root):
    dirs[:]=[d for d in dirs if d not in skip_dirs]
    for name in names:
        if name.endswith(('.log','.tsbuildinfo','.pyc','.ecgwork')) or name.startswith('.env'):continue
        files.append(Path(folder)/name)
manifest={str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
archive=output/f'ecg-workbench-v{version}-source.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(files):z.write(p,str(Path('ecg-workbench')/p.relative_to(root)))
    z.writestr('ecg-workbench/SHA256SUMS.json',json.dumps(manifest,ensure_ascii=False,indent=2))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    extracted=root/'.verification'/f'extracted-{version}'
    extracted.mkdir(parents=True,exist_ok=True)
    z.extractall(extracted)
    for name,digest in manifest.items():
        assert hashlib.sha256((extracted/'ecg-workbench'/name).read_bytes()).hexdigest()==digest
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(archive.with_suffix('.zip.sha256')).write_text(digest+'  '+archive.name+'\n',encoding='utf8')
print(json.dumps({'archive':str(archive),'files':len(files)+1,'sha256':digest,'extracted':str(extracted/'ecg-workbench')},ensure_ascii=False,indent=2))
