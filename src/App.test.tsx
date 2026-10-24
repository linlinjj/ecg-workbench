// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi, type Mock } from 'vitest';
import { act, render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { unzipSync, strFromU8 } from 'fflate';
import App from './App';

vi.mock('./Waveform',()=>({default:(p:any)=><div><button onClick={()=>p.onAdd(360)}>test-add-point</button><button onClick={()=>p.onAdd(720,1440)}>test-add-interval</button><output data-testid="test-view">{p.view.join(',')}</output></div>}));
vi.mock('./engine',()=>({compute:vi.fn(async(samples:number[])=>samples.map(v=>v/2))}));
const record=JSON.parse(readFileSync('public/samples/100.json','utf8'));
let fetchMock:Mock<(url:string)=>Promise<{ok:boolean;json:()=>Promise<any>}>>,downloaded:Blob|undefined;
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
function deferred<T>(){let resolve!:(v:T)=>void;let reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function slowHash(){const gate=deferred<void>(),original=webcrypto.subtle.digest.bind(webcrypto.subtle);vi.spyOn(webcrypto.subtle,'digest').mockImplementation(async(algorithm,data)=>{await gate.promise;return original(algorithm,data);});return gate;}
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
  it('keeps edits made while an older snapshot is being saved dirty',async()=>{
    await ready();fireEvent.click(screen.getByRole('button',{name:'test-add-point'}));
    const gate=slowHash();fireEvent.click(screen.getByRole('button',{name:'保存项目'}));
    fireEvent.change(screen.getByLabelText('观察备注'),{target:{value:'保存过程中新增的备注'}});
    await act(async()=>gate.resolve());await waitFor(()=>expect(downloaded).toBeTruthy());
    expect(screen.getByText('有未保存改动')).toBeTruthy();
    const m=JSON.parse(strFromU8(unzipSync(new Uint8Array(await downloaded!.arrayBuffer()))['manifest.json']));
    expect(m.annotations[0].note).toBe('');
  });
  it('an old project save cannot clear the new document dirty flag',async()=>{
    await ready();fireEvent.click(screen.getByRole('button',{name:'test-add-point'}));
    const gate=slowHash();fireEvent.click(screen.getByRole('button',{name:'保存项目'}));
    const normal=fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async(url:string)=>String(url).includes('samples/119')?{ok:true,json:async()=>({...record,id:'mitdb-119',name:'切换后的记录'})}:normal(url));
    fireEvent.click(screen.getByRole('button',{name:'02 心搏形态对比 MIT-BIH / 119'}));
    await screen.findByText('切换后的记录');fireEvent.click(screen.getByRole('button',{name:'test-add-point'}));
    await act(async()=>gate.resolve());await waitFor(()=>expect(downloaded).toBeTruthy());
    expect(screen.getByText('有未保存改动')).toBeTruthy();
  });
  it('a failed export never clears unsaved annotations',async()=>{
    await ready();fireEvent.click(screen.getByRole('button',{name:'test-add-point'}));
    vi.spyOn(webcrypto.subtle,'digest').mockRejectedValue(new Error('模拟导出失败'));
    fireEvent.click(screen.getByRole('button',{name:'保存项目'}));
    await screen.findByText('模拟导出失败');expect(screen.getByText('有未保存改动')).toBeTruthy();
  });
  it('first load failure offers a working retry instead of an endless spinner',async()=>{
    const normal=fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async(url:string)=>{if(String(url).includes('samples/100'))throw new Error('模拟网络失败');return normal(url);});
    render(<App/>);await screen.findByText('模拟网络失败');
    expect(screen.queryByText('正在读取公开示例…')).toBeNull();
    fetchMock.mockImplementation(normal);fireEvent.click(screen.getByRole('button',{name:/^重试加载$/}));
    await screen.findByRole('button',{name:'test-add-point'});
  });
  it('ignores stale errors after a newer example has loaded',async()=>{
    await ready();const stale=deferred<any>(),normal=fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async(url:string)=>String(url).includes('samples/119')?stale.promise:normal(url));
    fireEvent.click(screen.getByRole('button',{name:'02 心搏形态对比 MIT-BIH / 119'}));
    fireEvent.click(screen.getByRole('button',{name:'01 节律观察 MIT-BIH / 100'}));
    await waitFor(()=>expect(screen.queryByText('正在读取公开示例…')).toBeNull());
    await act(async()=>stale.reject(new Error('过期请求失败')));
    expect(screen.queryByText('过期请求失败')).toBeNull();
  });
  it('an import can supersede initial loading and cannot be overwritten by its late response',async()=>{
    const initial=deferred<any>(),normal=fetchMock.getMockImplementation()!;
    const imported={...record,id:'csv-new',name:'导入的新记录'};
    fetchMock.mockImplementation(async(url:string)=>String(url).includes('samples/100')?initial.promise:String(url)==='/api/import'?{ok:true,json:async()=>({record:imported})}:normal(url));
    render(<App/>);await screen.findByText('本地完整版');
    fireEvent.click(screen.getByRole('button',{name:'导入与恢复'}));
    fireEvent.change(screen.getByLabelText('选择导入文件'),{target:{files:[new File(['ECG\n1\n2'],'a.csv')]}});
    fireEvent.click(screen.getByRole('button',{name:'导入并打开'}));
    await screen.findByRole('button',{name:'test-add-point'});
    expect(screen.queryByText('正在读取公开示例…')).toBeNull();
    await act(async()=>initial.resolve({ok:true,json:async()=>record}));
    expect(screen.getAllByText('导入的新记录').length).toBeGreaterThan(0);
  });
  it('invalid import metadata preserves the current document and its annotations',async()=>{
    await ready();fireEvent.click(screen.getByRole('button',{name:'test-add-point'}));
    const normal=fetchMock.getMockImplementation()!,bad={...record,provenance:undefined};
    fetchMock.mockImplementation(async(url:string)=>String(url)==='/api/import'?{ok:true,json:async()=>({record:bad})}:normal(url));
    fireEvent.click(screen.getByRole('button',{name:'导入与恢复'}));
    fireEvent.change(screen.getByLabelText('选择导入文件'),{target:{files:[new File(['x'],'bad.ecgwork')]}});
    fireEvent.click(screen.getByRole('button',{name:'导入并打开'}));
    await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('数据来源'));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'关闭对话框'}));
    expect(within(screen.getByRole('table')).getByText('1.000')).toBeTruthy();
  });
});
