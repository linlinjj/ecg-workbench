import { RAW, type Annotation, type ECGRecord, type Filters } from './types';

function object(value:unknown, name:string):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error(`${name}格式无效。`);
  return value as Record<string,unknown>;
}
function text(value:unknown,name:string,empty=false):string {
  if(typeof value!=='string'||(!empty&&!value.trim()))throw new Error(`${name}必须是${empty?'':'非空'}文本。`);
  return value;
}
function finite(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value);}
function integer(value:unknown):value is number{return finite(value)&&Number.isInteger(value);}
export function parseRecord(value:unknown):ECGRecord {
  const r=object(value,'记录'),p=object(r.provenance,'数据来源');
  text(r.id,'记录编号');text(r.name,'记录名称');text(p.dataset,'数据集');text(p.record,'来源记录');
  if(!integer(p.offsetSamples)||p.offsetSamples<0)throw new Error('来源采样偏移无效。');
  for(const key of ['url','license','transformations','sha256'])if(key in p)text(p[key],`来源 ${key}`,true);
  if(!finite(r.fs)||r.fs<=0)throw new Error('记录采样率无效。');
  if(!Array.isArray(r.channels)||!r.channels.length||r.channels.length>12)throw new Error('通道列表无效。');
  const channels=r.channels.map(v=>{
    const c=object(v,'通道');text(c.name,'通道名');text(c.unit,'单位');
    if(!Array.isArray(c.data)||!c.data.every(finite))throw new Error('波形包含无效数值。');
    return c as ECGRecord['channels'][number];
  });
  const count=channels[0].data.length;
  if(count<2||count*channels.length>5_000_000||channels.some(c=>c.data.length!==count))throw new Error('波形长度不一致或超过范围。');
  const refs=r.reference===undefined?[]:r.reference;
  if(!Array.isArray(refs))throw new Error('参考标注列表无效。');
  const ids=new Set<string>();
  const reference=refs.map(v=>{
    const a=object(v,'参考标注');const id=text(a.id,'参考标注编号');
    if(ids.has(id)||!integer(a.sample)||a.sample<0||a.sample>=count)throw new Error('参考标注编号重复或位置无效。');
    ids.add(id);text(a.symbol,'参考标注符号');
    return {...a,note:text(a.note??'','参考标注备注',true)} as unknown as ECGRecord['reference'][number];
  });
  return {...r,channels,reference,sampleCount:count} as unknown as ECGRecord;
}
export interface Imported {record:ECGRecord;annotations:Annotation[];settings:Filters;channel:number;view:[number,number]}
export function parseImported(value:unknown):Imported {
  const body=object(value,'导入结果'),record=parseRecord(body.record);
  const annotations=body.annotations??[];
  if(!Array.isArray(annotations)||annotations.length>100_000)throw new Error('个人标注列表无效。');
  const ids=new Set<string>();
  const normalized=annotations.map(v=>{
    const a=object(v,'个人标注'),id=text(a.id,'标注编号');
    if(ids.has(id)||!['point','interval'].includes(a.kind as string)||!integer(a.channel)||a.channel<0||a.channel>=record.channels.length||!integer(a.start)||a.start<0||a.start>=record.sampleCount)throw new Error('个人标注类型、编号或位置无效。');
    if(a.kind==='interval'&&(!integer(a.end)||a.end<=a.start||a.end>record.sampleCount))throw new Error('区间终点无效。');
    ids.add(id);const label=text(a.label,'标注标签',true),note=text(a.note??'','标注备注',true);
    if(label.length>80||note.length>4000)throw new Error('标注文本过长。');
    return {...a,label,note} as unknown as Annotation;
  });
  const supplied=body.settings===undefined?{}:object(body.settings,'滤波设置');
  for(const key of ['highpassEnabled','lowpassEnabled'])if(key in supplied&&typeof supplied[key]!=='boolean')throw new Error('滤波开关无效。');
  for(const key of ['highpass','lowpass','notch'])if(key in supplied&&!finite(supplied[key]))throw new Error('滤波频率无效。');
  const settings={...RAW,...supplied} as Filters;
  const channel=body.channel??0,view=body.view??[0,Math.min(record.sampleCount,record.fs*10)];
  if(!integer(channel)||channel<0||channel>=record.channels.length)throw new Error('当前通道无效。');
  if(!Array.isArray(view)||view.length!==2||!view.every(finite)||view[0]<0||view[1]<=view[0]||view[1]>record.sampleCount)throw new Error('显示范围无效。');
  return {record,annotations:normalized,settings,channel,view:view as [number,number]};
}
