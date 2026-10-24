// Only trusted, bundled Python is executed. User input consists of numeric data.
let ready;
let chain = Promise.resolve();
self.onmessage = ({ data }) => { chain = chain.then(() => run(data)).catch(() => {}); };
async function run({ id, samples, fs, settings, coreUrl }) {
  try {
    if (!ready) ready = (async () => {
      self.postMessage({ id, progress: '首次加载计算环境，波形仍可浏览…' });
      const { loadPyodide } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs');
      const py = await loadPyodide();
      self.postMessage({ id, progress: '加载 NumPy / SciPy…' });
      await py.loadPackage(['numpy', 'scipy']);
      const response = await fetch(coreUrl);
      if (!response.ok) throw new Error('共享滤波代码加载失败。');
      await py.runPythonAsync(await response.text());
      return py;
    })().catch(e => { ready = undefined; throw e; });
    const py = await ready;
    self.postMessage({ id, progress: '正在对完整通道计算…' });
    py.globals.set('input_json', JSON.stringify({ samples, fs, settings }));
    const output = await py.runPythonAsync('import json\n_request = json.loads(input_json)\njson.dumps(filter_signal(_request["samples"], _request["fs"], _request["settings"]))');
    py.globals.delete('input_json');
    self.postMessage({ id, samples: JSON.parse(output) });
  } catch (e) { self.postMessage({ id, error: String(e.message || e) }); }
}
