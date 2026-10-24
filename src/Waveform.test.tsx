// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import Waveform from './Waveform';
import type { ECGRecord, Annotation } from './types';

vi.mock('uplot',()=>({default:class {
  width=800;height=364;bbox={left:54,top:18,width:700,height:290};ctx={canvas:document.createElement('canvas')};
  constructor(o:any,_d:any,_e:any){o.hooks.ready[0](this);}setSize(){}setData(){}setScale(){}destroy(){}batch(fn:()=>void){fn();}
}}));
const record:ECGRecord={id:'fixture',name:'fixture',fs:100,sampleCount:1000,channels:[{name:'ECG',unit:'mV',data:Array.from({length:1000},(_,i)=>Math.sin(i))}],reference:[],provenance:{dataset:'fixture',record:'fixture',offsetSamples:0}};
beforeEach(()=>{
  vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  vi.stubGlobal('PointerEvent',MouseEvent);
  Element.prototype.setPointerCapture=vi.fn();
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function mount(extra:Record<string,unknown>={}){
  const callbacks={onView:vi.fn(),onAdd:vi.fn(),onMove:vi.fn(),onSelect:vi.fn(),onExportReady:vi.fn()};
  const result=render(<Waveform record={record} channel={0} processed={null} view={[0,1000]} mode="inspect" annotations={[]} selected={null} showReference={true} {...callbacks} {...extra}/>);
  const svg=result.container.querySelector('svg.wave-overlay')!;
  return {svg,...callbacks,...result};
}
describe('waveform pointer logic (simulated DOM, not browser rendering)',()=>{
  it('adds a heart-beat point at the original sample index',()=>{
    const {svg,onAdd}=mount({mode:'point'});fireEvent.pointerDown(svg,{button:0,clientX:350});fireEvent.pointerUp(svg,{button:0,clientX:350});expect(onAdd).toHaveBeenCalledWith(500);
  });
  it('creates a half-open interval and supports reverse drag',()=>{
    const {svg,onAdd}=mount({mode:'interval'});fireEvent.pointerDown(svg,{button:0,clientX:490});fireEvent.pointerMove(svg,{clientX:140});fireEvent.pointerUp(svg,{clientX:140});expect(onAdd).toHaveBeenCalledWith(200,700);
  });
  it('panning updates view without adding annotations',()=>{
    const {svg,onView,onAdd}=mount();fireEvent.pointerDown(svg,{button:0,clientX:350});fireEvent.pointerMove(svg,{clientX:280});fireEvent.pointerUp(svg,{clientX:280});expect(onView).toHaveBeenCalledWith([100,1100]);expect(onAdd).not.toHaveBeenCalled();
  });
  it('moves an existing point without creating a duplicate',()=>{
    const annotation:Annotation={id:'a',kind:'point',channel:0,start:300,label:'待确认',note:''};
    const {svg,onMove,onSelect,onAdd}=mount({mode:'point',annotations:[annotation]});const point=svg.querySelector('circle')!;
    fireEvent.pointerDown(point,{button:0,clientX:210});fireEvent.pointerMove(svg,{clientX:280});fireEvent.pointerUp(svg,{clientX:280});expect(onSelect).toHaveBeenCalledWith('a');expect(onMove).toHaveBeenCalledWith('a',400,undefined);expect(onAdd).not.toHaveBeenCalled();
  });
  it('resizes only the selected interval boundary',()=>{
    const annotation:Annotation={id:'a',kind:'interval',channel:0,start:200,end:600,label:'噪声',note:''};
    const {svg,onMove}=mount({annotations:[annotation]});const end=svg.querySelector('[data-edge="end"]')!;
    fireEvent.pointerDown(end,{button:0,clientX:420});fireEvent.pointerMove(svg,{clientX:490});fireEvent.pointerUp(svg,{clientX:490});expect(onMove).toHaveBeenCalledWith('a',200,700);
  });
  it('pointer cancellation discards a pending interval',()=>{
    const {svg,onAdd}=mount({mode:'interval'});fireEvent.pointerDown(svg,{button:0,clientX:100});fireEvent.pointerMove(svg,{clientX:400});fireEvent.pointerCancel(svg);fireEvent.pointerUp(svg,{clientX:400});expect(onAdd).not.toHaveBeenCalled();
  });
  it('translates an interval to either boundary without changing its length',()=>{
    const annotation:Annotation={id:'a',kind:'interval',channel:0,start:200,end:600,label:'噪声',note:''};
    const {svg,onMove}=mount({annotations:[annotation]});
    fireEvent.pointerDown(svg.querySelector('rect')!,{button:0,clientX:280});
    fireEvent.pointerMove(svg,{clientX:0});fireEvent.pointerUp(svg,{clientX:0});
    expect(onMove).toHaveBeenLastCalledWith('a',0,400);
    fireEvent.pointerDown(svg.querySelector('rect')!,{button:0,clientX:280});
    fireEvent.pointerMove(svg,{clientX:700});fireEvent.pointerUp(svg,{clientX:700});
    expect(onMove).toHaveBeenLastCalledWith('a',600,1000);
  });
  it('commits the final pointer position, including the exclusive record endpoint',()=>{
    const annotation:Annotation={id:'a',kind:'interval',channel:0,start:200,end:600,label:'噪声',note:''};
    const {svg,onMove}=mount({annotations:[annotation]});
    fireEvent.pointerDown(svg.querySelector('[data-edge="end"]')!,{button:0,clientX:420});
    fireEvent.pointerMove(svg,{clientX:490});fireEvent.pointerUp(svg,{clientX:700});
    expect(onMove).toHaveBeenLastCalledWith('a',200,1000);
  });
  it('supports a one-sample interval and clamps the last point to N-1',()=>{
    const annotation:Annotation={id:'a',kind:'interval',channel:0,start:200,end:600,label:'噪声',note:''};
    const first=mount({annotations:[annotation]});
    fireEvent.pointerDown(first.svg.querySelector('[data-edge="start"]')!,{button:0,clientX:140});
    fireEvent.pointerUp(first.svg,{clientX:700});
    expect(first.onMove).toHaveBeenLastCalledWith('a',599,600);
    cleanup();const second=mount({mode:'point'});
    fireEvent.pointerDown(second.svg,{button:0,clientX:700});fireEvent.pointerUp(second.svg,{clientX:700});
    expect(second.onAdd).toHaveBeenCalledWith(999);
  });
  it('reaches the endpoint even when grabbed off-center and dragged beyond the plot',()=>{
    const annotation:Annotation={id:'a',kind:'interval',channel:0,start:200,end:600,label:'噪声',note:''};
    const {svg,onMove}=mount({annotations:[annotation]});
    fireEvent.pointerDown(svg.querySelector('[data-edge="end"]')!,{button:0,clientX:421});
    fireEvent.pointerUp(svg,{clientX:730});
    expect(onMove).toHaveBeenLastCalledWith('a',200,1000);
  });
});
