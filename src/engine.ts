import type { Filters } from './types';
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve: (data: number[]) => void; reject: (e: Error) => void; progress?: (s: string) => void }>();
export async function compute(samples: number[], fs: number, settings: Filters, local: boolean, progress?: (s: string) => void): Promise<number[]> {
  if (!settings.highpassEnabled && !settings.lowpassEnabled && !settings.notch) return samples.slice();
  if (local) {
    const r = await fetch('/api/filter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ samples, fs, settings }) });
    const body = await r.json();
    if (!r.ok) throw new Error(typeof body.detail === 'string' ? body.detail : '本地计算失败，请检查参数。');
    return body.samples;
  }
  if (!worker) {
    worker = new Worker(new URL('./filter.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id); if (!p) return;
      if (data.progress) { p.progress?.(data.progress); return; }
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error)); else p.resolve(data.samples);
    };
    worker.onerror = () => { pending.forEach(p => p.reject(new Error('浏览器计算环境加载失败，请检查网络后重试。'))); pending.clear(); worker?.terminate(); worker = undefined; };
  }
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    worker!.postMessage({ id, samples, fs, settings, coreUrl: new URL(`${import.meta.env.BASE_URL}python/dsp.py`, location.href).href });
  });
}
