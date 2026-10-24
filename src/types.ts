export interface Reference { id: string; sample: number; symbol: string; note?: string }
export interface ECGRecord {
  id: string; name: string; fs: number; sampleCount: number;
  channels: { name: string; unit: string; data: number[] }[];
  reference: Reference[];
  provenance: { dataset: string; record: string; offsetSamples: number; url?: string; license?: string; transformations?: string; [key: string]: unknown };
}
export interface Annotation { id: string; kind: 'point' | 'interval'; channel: number; start: number; end?: number; label: string; note: string }
export interface Filters { highpassEnabled: boolean; highpass: number; lowpassEnabled: boolean; lowpass: number; notch: number }
export const RAW: Filters = { highpassEnabled: false, highpass: .5, lowpassEnabled: false, lowpass: 40, notch: 0 };
export type Mode = 'inspect' | 'point' | 'interval';
