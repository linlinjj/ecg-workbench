import type { Annotation } from './types';

export function sampleX(sample:number,view:[number,number],width:number){
  return (sample-view[0])/Math.max(1,view[1]-view[0])*width;
}
export function boundarySample(x:number,view:[number,number],width:number,count:number){
  return Math.max(0,Math.min(count,Math.round(view[0]+x/Math.max(1,width)*(view[1]-view[0]))));
}
export function translatedAnnotation(a:Annotation,delta:number,count:number,edge?:string):[number,number|undefined]{
  if(a.kind==='point')return [Math.max(0,Math.min(count-1,a.start+delta)),undefined];
  const end=a.end!;
  if(edge==='start')return [Math.max(0,Math.min(end-1,a.start+delta)),end];
  if(edge==='end')return [a.start,Math.max(a.start+1,Math.min(count,end+delta))];
  const shift=Math.max(-a.start,Math.min(count-end,delta));
  return [a.start+shift,end+shift];
}
