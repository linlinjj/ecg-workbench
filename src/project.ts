import { zipSync, strToU8 } from 'fflate';
import type { Annotation, ECGRecord, Filters } from './types';
export function amplitudeRange(min:number,max:number):[number,number] {
  if(!Number.isFinite(min)||!Number.isFinite(max))return[-1,1];
  const pad=Math.max((max-min)*.15,Math.max(Math.abs(min),Math.abs(max))*.03,min===0&&max===0?.01:1e-12);
  return[min-pad,max+pad];
}
export function formatAmplitude(value:number){
  return value!==0&&(Math.abs(value)<.01||Math.abs(value)>=1000)?value.toExponential(2):value.toFixed(3);
}
export function csvAnnotations(record: ECGRecord, annotations: Annotation[]) {
  const escape = (value: unknown) => {
    let s = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [['source','kind','channel','start_sample','end_sample_exclusive','start_seconds','end_seconds','label','note','source_record','source_offset_samples']];
  for (const a of annotations) rows.push(['user', a.kind, record.channels[a.channel].name, a.start, a.end ?? '', a.start / record.fs, a.end !== undefined ? a.end / record.fs : '', a.label, a.note, record.provenance.record, record.provenance.offsetSamples]);
  for (const a of record.reference) rows.push(['reference','point','all',a.sample,'',a.sample/record.fs,'',a.symbol,a.note,record.provenance.record,record.provenance.offsetSamples]);
  return '\ufeff' + rows.map(row => row.map(escape).join(',')).join('\r\n');
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function projectBlob(record: ECGRecord, annotations: Annotation[], settings: Filters, channel: number, view: [number, number]) {
  const raw = strToU8(JSON.stringify(record));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw.buffer as ArrayBuffer))].map(b => b.toString(16).padStart(2, '0')).join('');
  const manifest = { format: 'ecg-workbench', version: 1, recordSha256: hash, annotations, settings, channel, view, savedAt: new Date().toISOString() };
  const zipped = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'record.json': raw }, { level: 6 });
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}
export function limitView(view: [number, number], count: number): [number, number] {
  const span = Math.min(count, Math.max(Math.min(20, count), Math.round(view[1] - view[0])));
  const start = Math.max(0, Math.min(count - span, Math.round(view[0])));
  return [start, start + span];
}
// Peak-preserving min/max envelope, display only. Annotation indices stay original.
export function envelope(raw: number[], processed: number[] | null, start: number, end: number, budget = 2400) {
  const stride = Math.max(1, Math.ceil((end - start) / budget));
  const indices = new Set<number>();
  for (let i = start; i < end; i += stride) {
    const stop = Math.min(end, i + stride); let lo = i, hi = i, plo = i, phi = i;
    for (let j = i; j < stop; j++) {
      if (raw[j] < raw[lo]) lo = j; if (raw[j] > raw[hi]) hi = j;
      if (processed && processed[j] < processed[plo]) plo = j; if (processed && processed[j] > processed[phi]) phi = j;
    }
    indices.add(i); indices.add(lo); indices.add(hi); if (processed) { indices.add(plo); indices.add(phi); }
  }
  indices.add(end - 1);
  return [...indices].sort((a,b) => a-b);
}
