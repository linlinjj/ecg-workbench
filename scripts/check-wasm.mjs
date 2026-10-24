// Numerical acceptance using the same Pyodide runtime as the browser.
// No browser automation or access to an existing browser session is involved.
import { loadPyodide } from 'pyodide';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=process.cwd();
const runtime=path.join(root,'node_modules/pyodide');
const cache=path.join(root,'.cache/pyodide');
await fs.mkdir(cache,{recursive:true});
const lock=JSON.parse(await fs.readFile(path.join(runtime,'pyodide-lock.json'),'utf8'));
for(const name of ['numpy','scipy']){
  const pkg=lock.packages[name];
  const target=path.join(cache,pkg.file_name);
  try{await fs.access(target);}catch{throw new Error(`Missing numerical test dependency: ${target}. Run scripts/download_wasm_packages.py first.`);}
}
const started=performance.now();
const py=await loadPyodide({indexURL:runtime+path.sep,packageCacheDir:cache});
await py.loadPackage(['numpy','scipy']);
await py.runPythonAsync(await fs.readFile('public/python/dsp.py','utf8'));
const python=process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python';
const settings={highpassEnabled:true,highpass:.5,lowpassEnabled:true,lowpass:40,notch:50};
const results=[];
for(const file of ['100','119','noisy']){
  const record=JSON.parse(await fs.readFile(`public/samples/${file}.json`,'utf8'));
  for(let channel=0;channel<record.channels.length;channel++){
    const payload=JSON.stringify({samples:record.channels[channel].data,fs:record.fs,settings});
    const local=spawnSync(python,['-B','-c',`import json,sys;exec(open('public/python/dsp.py',encoding='utf-8').read());r=json.load(sys.stdin);print(json.dumps(filter_signal(r['samples'],r['fs'],r['settings'])))`],{input:payload,encoding:'utf8',maxBuffer:20*1024*1024});
    if(local.status!==0)throw new Error(local.stderr);
    const expected=JSON.parse(local.stdout);
    py.globals.set('payload',payload);
    const t=performance.now();
    const actual=JSON.parse(await py.runPythonAsync(`import json\nr=json.loads(payload)\njson.dumps(filter_signal(r['samples'],r['fs'],r['settings']))`));
    const maximum=Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])));
    if(actual.length!==expected.length||maximum>1e-8)throw new Error(`WASM mismatch ${file}/${channel}: ${maximum}`);
    results.push({file,channel,maximumAbsoluteError:maximum,warmComputeMs:performance.now()-t,samples:actual.length});
  }
}
const report={runtime:py.version,scipy:lock.packages.scipy.version,initializedAndTestedMs:performance.now()-started,results};
await fs.mkdir('.verification',{recursive:true});await fs.writeFile('.verification/wasm-parity.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
