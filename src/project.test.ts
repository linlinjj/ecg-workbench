import { describe, it, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { amplitudeRange, formatAmplitude, csvAnnotations, envelope, limitView, projectBlob } from './project';
import { RAW, type ECGRecord, type Annotation } from './types';

const record:ECGRecord=JSON.parse(readFileSync('public/samples/100.json','utf8'));
const annotations:Annotation[]=[{id:'point-one',kind:'point',channel:0,start:360,label:'待确认',note:'=SUM(A1:A2)'},{id:'interval-one',kind:'interval',channel:1,start:720,end:1440,label:'待复看',note:'中文,逗号与"引号"'}];
describe('display and portable data integrity',()=>{
  it('keeps volt-scale traces visible and tiny axis values distinguishable',()=>{
    const [min,max]=amplitudeRange(-.0005,.001);
    expect(max-min).toBeLessThan(.003);expect(min).toBeLessThan(-.0005);expect(max).toBeGreaterThan(.001);
    expect(formatAmplitude(.000001)).toBe('1.00e-6');expect(formatAmplitude(.000002)).not.toBe(formatAmplitude(.000001));
    expect(amplitudeRange(0,0).every(Number.isFinite)).toBe(true);
  });
  it('clips views without moving their span or crossing record bounds',()=>{
    expect(limitView([-300,600],1000)).toEqual([0,900]);
    expect(limitView([800,1400],1000)).toEqual([400,1000]);
    expect(limitView([0,9999],1000)).toEqual([0,1000]);
    expect(limitView([30,31],1000)).toEqual([30,50]);
  });
  it('display decimation retains positive and negative peaks of both signals',()=>{
    const raw=Array(10000).fill(0),filtered=raw.slice();raw[1234]=17;raw[9876]=-13;filtered[4321]=11;filtered[6789]=-9;
    const points=envelope(raw,filtered,0,raw.length,100);
    for(const index of [1234,9876,4321,6789,9999])expect(points).toContain(index);
    expect(raw[1234]).toBe(17);expect(points.length).toBeLessThan(601);
  });
  it('portable package retains exact waveforms, provenance, half-open annotations and settings',async()=>{
    const settings={...RAW,highpassEnabled:true,lowpassEnabled:true,notch:50};
    const blob=await projectBlob(record,annotations,settings,1,[360,3960]);
    const bytes=new Uint8Array(await blob.arrayBuffer()),files=unzipSync(bytes);
    const manifest=JSON.parse(strFromU8(files['manifest.json']));
    expect(JSON.parse(strFromU8(files['record.json']))).toEqual(record);
    expect(manifest.annotations).toEqual(annotations);expect(manifest.settings).toEqual(settings);expect(manifest.view).toEqual([360,3960]);
    expect(manifest.recordSha256).toMatch(/^[a-f0-9]{64}$/);
    mkdirSync('.verification',{recursive:true});writeFileSync('.verification/roundtrip.ecgwork',bytes);
  });
  it('CSV keeps reference labels separate, quotes text and neutralizes spreadsheet formulas',()=>{
    const csv=csvAnnotations(record,annotations);
    expect(csv).toContain('"user","interval","V5","720","1440","2","4"');
    expect(csv).toContain('"reference","point","all"');expect(csv).toContain("'=SUM(A1:A2)");
    expect(csv).toContain('中文,逗号与""引号""');
  });
  it('demo clips have valid channel metadata and reference bounds',()=>{
    for(const file of ['100','119','noisy']){
      const r:ECGRecord=JSON.parse(readFileSync(`public/samples/${file}.json`,'utf8'));
      expect(r.sampleCount).toBe(21600);expect(r.fs).toBe(360);expect(r.provenance.license).toBe('ODC-By-1.0');
      for(const c of r.channels){expect(c.data.length).toBe(r.sampleCount);expect(c.data.every(Number.isFinite)).toBe(true);expect(c.unit).toBe('mV');}
      expect(r.reference.every(a=>a.sample>=0&&a.sample<r.sampleCount)).toBe(true);
    }
  });
});
