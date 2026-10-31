import { describe,expect,it } from 'vitest';
import { annotationLabels } from './geometry';
import type { Annotation } from './types';

describe('annotation text layout',()=>{
  it('separates neighbouring point and interval labels without changing sampling indices',()=>{
    const annotations:Annotation[]=[
      {id:'range',kind:'interval',channel:0,start:720,end:1440,label:'形态观察',note:''},
      {id:'beat',kind:'point',channel:0,start:1080,label:'待确认',note:''},
    ];
    const before=structuredClone(annotations);
    const labels=annotationLabels(annotations,[0,3600],427,'range');
    expect(labels.get('beat')!.y).not.toBe(labels.get('range')!.y);
    expect(annotations).toEqual(before);
  });
  it('prioritizes the selected mark and contains long text near the plot edge',()=>{
    const annotations:Annotation[]=Array.from({length:8},(_,i)=>({id:String(i),kind:'point',channel:0,start:995,label:'很长的标注文字'.repeat(8),note:''}));
    const labels=annotationLabels(annotations,[0,1000],250,'7');
    const selected=labels.get('7')!;
    expect(selected).toBeTruthy();expect(selected.text.endsWith('…')).toBe(true);
    expect(selected.x).toBeGreaterThanOrEqual(0);
    expect(selected.x+Array.from(selected.text).length*11).toBeLessThanOrEqual(250);
    expect(labels.size).toBeLessThan(annotations.length);
  });
});
