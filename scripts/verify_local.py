"""Live HTTP acceptance against an explicitly started loopback API."""
import json
from pathlib import Path
import requests
import numpy as np

root=Path(__file__).resolve().parents[1]
s=requests.Session();s.trust_env=False
base='http://127.0.0.1:8765'
checks=[]
def check(name,condition):
    if not condition: raise AssertionError(name)
    checks.append(name)
r=s.get(base+'/api/health',timeout=10);check('local API health',r.status_code==200 and r.json()['mode']=='local')
r=s.get(base+'/',timeout=10);check('production frontend served',r.status_code==200 and 'ECG Workbench' in r.text)
for item in ['100','119','noisy']:
    r=s.get(base+f'/samples/{item}.json',timeout=10);check('demo '+item,r.status_code==200 and r.json()['sampleCount']==21600)
csv=(root/'public/templates/ecg-example.csv').read_bytes()
r=s.post(base+'/api/import',files={'files':('sample.csv',csv,'text/csv')},data={'fs':360,'unit':'mV'},timeout=15)
check('live CSV import',r.status_code==200 and r.json()['record']['sampleCount']==1800)
raw=(root/'.verification/roundtrip.ecgwork').read_bytes()
r=s.post(base+'/api/import',files={'files':('roundtrip.ecgwork',raw,'application/zip')},timeout=15)
check('live project restore',r.status_code==200 and r.json()['annotations'][1]['end']==1440 and r.json()['settings']['notch']==50)
record=r.json()['record']
r=s.post(base+'/api/filter',json={'samples':record['channels'][0]['data'],'fs':record['fs'],'settings':r.json()['settings']},timeout=15)
check('live filter finite and length',r.status_code==200 and len(r.json()['samples'])==record['sampleCount'] and np.isfinite(r.json()['samples']).all())
r=s.post(base+'/api/import',files={'files':('bad.csv',b'ECG\nNaN\n2\n','text/csv')},timeout=15)
check('bad CSV rejected',r.status_code==400)
r=s.post(base+'/api/import',files={'files':('bad.ecgwork',b'broken','application/zip')},timeout=15)
check('damaged project rejected',r.status_code==400)
report={'passed':len(checks),'checks':checks}
(root/'.verification/live-api.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
