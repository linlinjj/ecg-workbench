// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { unzipSync, strFromU8 } from 'fflate';
import App from './App';

vi.mock('./Waveform',()=>({default:(p:any)=><div><button onClick={()=>p.onAdd(360)}>test-add-point</button><button onClick={()=>p.onAdd(720,1440)}>test-add-interval</button><output data-testid="test-view">{p.view.join(',')}</output></div>}));
vi.mock('./engine',()=>({compute:vi.fn(async(samples:number[])=>samples.map(v=>v/2))}));
const record=JSON.parse(readFileSync('public/samples/100.json','utf8'));
let fetchMock:ReturnType<typeof vi.fn>,downloaded:Blob|undefined;
beforeEach(()=>{
  localStorage.clear();downloaded=undefined;
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
  Object.defineProperty(globalThis,'Blob',{configurable:true,value:NodeBlob});
  fetchMock=vi.fn(async(url:string)=>({ok:true,json:async()=>String(url).includes('/api/health')?{mode:'local'}:String(url).includes('repository.json')?{url:'https://github.com/linlinjj/ecg-workbench'}:record}));
  vi.stubGlobal('fetch',fetchMock);vi.spyOn(window,'confirm').mockReturnValue(true);
  URL.createObjectURL=vi.fn(blob=>{downloaded=blob;return 'blob:test';});URL.revokeObjectURL=vi.fn();vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function ready(){render(<App/>);await screen.findByText('本地完整版');await screen.findByRole('button',{name:'test-add-point'});}
describe('workbench state workflows (simulated DOM)',()=>{
  it('creates both annotation types, edits notes, and restores edits with undo/redo',async()=>{
    await ready();fireEvent.click(screen.getByRole('button',{name:'test-add-point'}));
    fireEvent.change(screen.getByLabelText('观察备注'),{target:{value:'检查这一搏'}});
    expect(screen.getByLabelText('观察备注').getAttribute('maxlength')).toBe('4000');
    fireEvent.click(screen.getByRole('button',{name:/^撤销$/}));
    expect(within(screen.getByRole('table')).queryByText('检查这一搏')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:/^重做$/}));
    expect(within(screen.getByRole('table')).getByText('检查这一搏')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'test-add-interval'}));
    expect(within(screen.getByRole('table')).getByText('2.000–4.000')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'删除这条标注'}));
    expect(within(screen.getByRole('table')).queryByText('2.000–4.000')).toBeNull();
  });
  it('zoom does not change saved sampling indices; package includes applied settings',async()=>{
    await ready();fireEvent.click(screen.getByRole('button',{name:'test-add-point'}));
    fireEvent.click(screen.getByRole('button',{name:'放大波形'}));
    expect(screen.getByTestId('test-view').textContent).not.toBe('0,3600');
    fireEvent.click(screen.getByRole('button',{name:'基线漂移 高通 0.5 Hz'}));
    await waitFor(()=>expect(screen.getByText('已应用 · 与原始信号同步对比')).toBeTruthy());
    fireEvent.click(screen.getByRole('button',{name:'保存项目'}));
    await waitFor(()=>expect(downloaded).toBeTruthy());
    const data=unzipSync(new Uint8Array(await downloaded!.arrayBuffer()));
    const manifest=JSON.parse(strFromU8(data['manifest.json']));
    expect(manifest.annotations[0].start).toBe(360);expect(manifest.settings.highpassEnabled).toBe(true);
    expect(JSON.parse(strFromU8(data['record.json'])).channels[0].data).toEqual(record.channels[0].data);
  });
  it('rejects invalid custom frequencies without replacing valid applied settings',async()=>{
    await ready();fireEvent.click(screen.getByRole('button',{name:'自定义参数'}));
    fireEvent.click(screen.getByLabelText('启用高通滤波'));
    fireEvent.change(screen.getByLabelText('高通截止频率'),{target:{value:'999'}});
    fireEvent.click(screen.getByRole('button',{name:'应用参数'}));
    expect(screen.getByRole('alert').textContent).toContain('频率设置无效');
    expect(screen.getByText('当前显示原始信号')).toBeTruthy();
  });
});
