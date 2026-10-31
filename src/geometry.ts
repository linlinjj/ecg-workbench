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

/** Put text below the point handles; crowded marks retain their full SVG title. */
export function annotationLabels(annotations:Annotation[],view:[number,number],width:number,selected:string|null){
  const result=new Map<string,{x:number;y:number;text:string}>();
  const lanes=Array.from({length:3},()=>[] as [number,number][]);
  const ordered=[...annotations].sort((a,b)=>Number(b.id===selected)-Number(a.id===selected)||a.start-b.start);
  const capacity=Math.max(1,Math.floor((width-16)/11));
  for(const a of ordered){
    const characters=Array.from(a.label);
    if(!characters.length)continue;
    const text=characters.length>capacity?characters.slice(0,Math.max(0,capacity-1)).join('')+'…':a.label;
    const size=Array.from(text).length*11;
    const x=Math.max(4,Math.min(Math.max(4,width-size-4),sampleX(a.start,view,width)+10));
    const lane=lanes.findIndex(ranges=>ranges.every(([start,end])=>x+size+8<=start||x>=end+8));
    if(lane<0)continue;
    lanes[lane].push([x,x+size]);result.set(a.id,{x,y:38+lane*18,text});
  }
  return result;
}
