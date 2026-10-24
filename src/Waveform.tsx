import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { envelope } from './project';
import type { Annotation, ECGRecord, Mode } from './types';

interface Props { record: ECGRecord; channel: number; processed: number[] | null; view: [number,number]; mode: Mode; annotations: Annotation[]; selected: string | null; showReference: boolean; filterDescription?: string; onView: (v:[number,number])=>void; onAdd:(start:number,end?:number)=>void; onMove:(id:string,start:number,end?:number)=>void; onSelect:(id:string)=>void; onExportReady:(fn:()=>void)=>void }
export default function Waveform(props: Props) {
  const root = useRef<HTMLDivElement>(null), plot = useRef<uPlot | null>(null);
  const latest = useRef(props); latest.current = props;
  const [box, setBox] = useState({ left: 54, top: 20, width: 600, height: 310 });
  const [preview, setPreview] = useState<[number,number] | null>(null);
  const drag = useRef<{x:number; sample:number; view:[number,number]; id?:string; edge?:string; original?:Annotation} | undefined>(undefined);
  const [cursor, setCursor] = useState<number | null>(null);
  const raw = props.record.channels[props.channel].data;
  useEffect(() => {
    if (!root.current) return;
    const updateBox = (u:uPlot) => { const ratio = window.devicePixelRatio || 1; setBox({ left:u.bbox.left/ratio, top:u.bbox.top/ratio, width:u.bbox.width/ratio, height:u.bbox.height/ratio }); };
    const u = new uPlot({ width: root.current.clientWidth, height: 364, padding:[18,18,0,0],
      cursor:{ show:false }, legend:{show:false}, select:{show:false,left:0,top:0,width:0,height:0},
      scales:{x:{time:false},y:{auto:true,range:(_u,min,max)=>{const pad=Math.max(.08,(max-min)*.15);return[min-pad,max+pad];}}},
      series:[{},{label:'原始信号',stroke:'#58cfca',width:1.4},{label:'处理后',stroke:'#ad9cff',width:1.65}],
      axes:[{stroke:'#7f91ac',grid:{stroke:'#20304a',width:1},ticks:{show:false},size:38,gap:10,values:(_u,values)=>values.map(v=>`${v.toFixed(v<10?1:0)} s`),font:'11px Arial'},
            {stroke:'#7f91ac',grid:{stroke:'#20304a',width:1},ticks:{show:false},size:56,gap:10,font:'11px Arial',values:(_u,values)=>values.map(v=>v.toFixed(2))}],
      hooks:{ready:[updateBox],setSize:[updateBox]} }, [[],[],[]], root.current);
    plot.current=u;
    const resize=new ResizeObserver(()=>{if(root.current && root.current.clientWidth>0)u.setSize({width:root.current.clientWidth,height:364});}); resize.observe(root.current);
    return()=>{resize.disconnect();u.destroy();plot.current=null;};
  },[]);
  useEffect(()=>{
    const u=plot.current; if(!u)return;
    const [start,end]=props.view;
    const indices=envelope(raw,props.processed,start,end,Math.max(600,Math.round(box.width)*2));
    u.batch(()=>{u.setData([indices.map(i=>i/props.record.fs),indices.map(i=>raw[i]),props.processed?indices.map(i=>props.processed![i]):indices.map(()=>null)],true);u.setScale('x',{min:start/props.record.fs,max:(end-1)/props.record.fs});});
  },[raw,props.processed,props.view,props.record.fs,box.width]);
  const toX=(sample:number)=>(sample-props.view[0])/Math.max(1,props.view[1]-props.view[0]-1)*box.width;
  const fromX=(x:number)=>Math.max(0,Math.min(props.record.sampleCount-1,Math.round(props.view[0]+x/box.width*(props.view[1]-props.view[0]-1))));
  const samples=props.view[1]-props.view[0];
  useEffect(()=>{
    const svg=root.current?.parentElement?.querySelector('svg.wave-overlay');if(!svg)return;
    const wheel=(e:Event)=>{const w=e as WheelEvent;w.preventDefault();const p=latest.current;const rect=svg.getBoundingClientRect();const ratio=Math.max(0,Math.min(1,(w.clientX-rect.left)/rect.width));const span=p.view[1]-p.view[0];const size=span*(w.deltaY>0?1.25:.8);const anchor=p.view[0]+span*ratio;p.onView([anchor-size*ratio,anchor+size*(1-ratio)]);};
    svg.addEventListener('wheel',wheel,{passive:false});return()=>svg.removeEventListener('wheel',wheel);
  },[box.width]);
  useEffect(()=>{
    props.onExportReady(()=>{
      const u=plot.current;if(!u)return;
      const p=latest.current;const scale=2;const canvas=document.createElement('canvas');canvas.width=u.width*scale;canvas.height=(u.height+102)*scale;const ctx=canvas.getContext('2d')!;ctx.scale(scale,scale);ctx.fillStyle='#101c31';ctx.fillRect(0,0,u.width,u.height+102);ctx.fillStyle='#e7edf7';ctx.font='600 15px sans-serif';ctx.fillText(`ECG Workbench · ${p.record.name} · ${p.record.channels[p.channel].name}`,24,27);ctx.fillStyle='#93a5be';ctx.font='11px sans-serif';ctx.fillText(`${p.record.fs} Hz | ${p.record.channels[p.channel].unit} | ${ (p.view[0]/p.record.fs).toFixed(3)}–${(p.view[1]/p.record.fs).toFixed(3)} s | 来源 ${p.record.provenance.record}`,24,48);ctx.fillText(p.processed?`处理参数：${p.filterDescription??'自定义滤波'} | 青色原始 / 紫色处理后 / 橙色个人标注`:'原始信号 | 青色波形 / 橙色个人标注',24,69);
      ctx.drawImage(u.ctx.canvas,0,88,u.width,u.height);
      const rect=u.bbox,ratio=window.devicePixelRatio||1;const left=rect.left/ratio,top=rect.top/ratio+88,width=rect.width/ratio,height=rect.height/ratio;
      const x=(s:number)=>left+(s-p.view[0])/(p.view[1]-p.view[0]-1)*width;
      ctx.save();ctx.beginPath();ctx.rect(left,top,width,height);ctx.clip();
      if(p.showReference)for(const a of p.record.reference){if(a.sample<p.view[0]||a.sample>=p.view[1])continue;ctx.fillStyle='#8ca7ba';ctx.font='10px sans-serif';ctx.fillText(a.symbol,x(a.sample)-3,top+height-9);}
      for(const a of p.annotations.filter(a=>a.channel===p.channel)){ctx.strokeStyle='#f5b86b';ctx.fillStyle='#f5b86b';ctx.lineWidth=1;const sx=x(a.start);if(a.kind==='interval'){ctx.fillStyle='rgba(245,184,107,.12)';ctx.fillRect(sx,top,x(a.end!)-sx,height);ctx.strokeRect(sx,top,x(a.end!)-sx,height);}else{ctx.beginPath();ctx.moveTo(sx,top);ctx.lineTo(sx,top+height);ctx.stroke();}ctx.fillStyle='#ffd29a';ctx.font='11px sans-serif';ctx.fillText(a.label,sx+4,top+15);}
      ctx.restore();
      canvas.toBlob(blob=>{if(blob){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${p.record.id}-waveform.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}},'image/png');
    });
  },[props.record,props.channel,props.annotations,props.showReference]);
  const visible=props.annotations.filter(a=>a.channel===props.channel && (a.end??a.start)>=props.view[0] && a.start<props.view[1]);
  return <div className="wave-chart" data-testid="wave-chart">
    <div ref={root} className="uplot-host"/>
    <svg className={`wave-overlay ${props.mode}`} style={{left:box.left,top:box.top,width:box.width,height:box.height}} viewBox={`0 0 ${box.width} ${box.height}`}
      aria-label="交互心电波形：滚轮缩放，浏览模式拖动平移；标注模式点击或拖选" role="img"
      onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);const x=e.clientX-e.currentTarget.getBoundingClientRect().left;const target=(e.target as Element).closest('[data-annotation]');const id=target?.getAttribute('data-annotation')??undefined;const a=props.annotations.find(a=>a.id===id);drag.current={x,sample:fromX(x),view:[...props.view],id,edge:target?.getAttribute('data-edge')??undefined,original:a};if(id)props.onSelect(id);}}
      onPointerMove={e=>{const x=e.clientX-e.currentTarget.getBoundingClientRect().left;setCursor(fromX(x));const d=drag.current;if(!d)return;if(d.id){const a=d.original!;const delta=fromX(x)-d.sample;setPreview(a.kind==='interval'?[d.edge==='end'?a.start:Math.max(0,a.start+delta),d.edge==='start'?a.end!:Math.min(props.record.sampleCount,a.end!+delta)]:[Math.max(0,Math.min(props.record.sampleCount-1,a.start+delta)),Math.max(0,Math.min(props.record.sampleCount-1,a.start+delta))]);}else if(props.mode==='interval')setPreview([Math.min(d.sample,fromX(x)),Math.max(d.sample,fromX(x))+1]);else if(props.mode==='inspect'){const delta=Math.round((d.x-x)/box.width*samples);props.onView([d.view[0]+delta,d.view[1]+delta]);}}}
      onPointerUp={e=>{const d=drag.current;if(!d)return;const x=e.clientX-e.currentTarget.getBoundingClientRect().left;const s=fromX(x);if(d.id&&preview){const [start,end]=preview;if(d.original!.kind==='point'||end>start)props.onMove(d.id,start,d.original!.kind==='interval'?end:undefined);}else if(!d.id&&props.mode==='point'&&Math.abs(x-d.x)<6)props.onAdd(s);else if(!d.id&&props.mode==='interval'&&Math.abs(x-d.x)>=3)props.onAdd(Math.min(s,d.sample),Math.min(props.record.sampleCount,Math.max(s,d.sample)+1));drag.current=undefined;setPreview(null);}}
      onPointerCancel={()=>{drag.current=undefined;setPreview(null);}} onPointerLeave={()=>{if(!drag.current)setCursor(null);}}>
      {props.showReference&&props.record.reference.filter(a=>a.sample>=props.view[0]&&a.sample<props.view[1]).map(a=><g key={a.id} className="reference-mark"><line x1={toX(a.sample)} x2={toX(a.sample)} y1={box.height-31} y2={box.height-21}/><text x={toX(a.sample)} y={box.height-7} textAnchor="middle">{a.symbol}</text></g>)}
      {visible.map(a=><g key={a.id} data-annotation={a.id} className={`annotation-mark ${props.selected===a.id?'selected':''}`}>
        {a.kind==='interval'?<><rect x={toX(a.start)} y={2} width={Math.max(1,toX(a.end!)-toX(a.start))} height={box.height-4}/><line data-annotation={a.id} data-edge="start" className="drag-line" x1={toX(a.start)} x2={toX(a.start)} y1={0} y2={box.height}/><line data-annotation={a.id} data-edge="end" className="drag-line" x1={toX(a.end!)} x2={toX(a.end!)} y1={0} y2={box.height}/></>:<><line x1={toX(a.start)} x2={toX(a.start)} y1={30} y2={box.height-34}/><circle cx={toX(a.start)} cy={16} r={7}/><line className="drag-line" x1={toX(a.start)} x2={toX(a.start)} y1={0} y2={box.height}/></>}
        <text x={toX(a.start)+10} y={20}>{a.label}</text>
      </g>)}
      {preview&&<rect className="selection-preview" x={toX(preview[0])} y={0} width={Math.max(2,toX(preview[1])-toX(preview[0]))} height={box.height}/>}
      {cursor!==null&&!drag.current&&<line className="cursor-line" x1={toX(cursor)} x2={toX(cursor)} y1={0} y2={box.height}/>}
    </svg>
    <div className="cursor-readout">{cursor===null?'移动鼠标查看采样值':`${(cursor/props.record.fs).toFixed(3)} s · ${raw[cursor]?.toFixed(3)} ${props.record.channels[props.channel].unit} · #${cursor}`}</div>
  </div>;
}
