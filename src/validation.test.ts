import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseImported, parseRecord } from './validation';
const sample=()=>JSON.parse(readFileSync('public/samples/100.json','utf8'));
describe('record boundary validation',()=>{
  it.each([
    (r:any)=>delete r.provenance,
    (r:any)=>r.channels[0].name={invalid:true},
    (r:any)=>r.channels[0].unit={invalid:true},
    (r:any)=>r.reference[0].symbol={invalid:true},
    (r:any)=>r.provenance.offsetSamples=true,
  ])('rejects malformed metadata before committing UI state',change=>{const r=sample();change(r);expect(()=>parseRecord(r)).toThrow();});
  it('normalizes omitted reference annotations without altering waveforms',()=>{
    const r=sample();delete r.reference;const result=parseRecord(r);
    expect(result.reference).toEqual([]);expect(result.channels).toEqual(r.channels);
  });
  it('restores a valid v1 payload while rejecting invalid annotations and view state',()=>{
    const r=sample();expect(parseImported({record:r}).channel).toBe(0);
    expect(()=>parseImported({record:r,annotations:[{id:'a',kind:'point',channel:true,start:1,label:'N'}]})).toThrow();
    expect(()=>parseImported({record:r,view:[0,Infinity]})).toThrow();
  });
});
