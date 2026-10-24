# ECG Workbench · 心电工作台

**观察波形，比较处理效果，记录你的发现。** 面向学习者与初学研究者的开源心电分析与标注工具。

[English](README.en.md) · [在线示例](https://linlinjj.github.io/ecg-workbench/) · [学习路线](docs/学习路线.md) · [格式与算法](docs/格式与算法.md) · [验收记录](docs/验收记录.md)

> 在线地址仅在 GitHub Pages 部署成功后可用；实际发布状态见验收记录。

## 可以做什么

- 浏览真实心电数据，滚轮缩放、拖动平移、概览定位和通道切换。
- 原始信号与高通、低通、工频陷波结果同步对比；预设与可展开参数。
- 人工添加心搏点和区间备注，移动、编辑、删除、撤销和重做。
- 参考标注与个人标注独立显示、独立保留；搜索与列表定位。
- 导出标注 CSV、当前波形 PNG、含波形的完整 `.ecgwork` 项目包。
- 本地导入规范 CSV、单段 WFDB（`.hea` + `.dat` + 可选 `.atr`），恢复完整项目包。

线上使用公开示例；本地版支持自己的数据。当前没有自动心搏检测、模型分类或临床诊断功能。

## 本地开始（Windows）

准备 **Node.js 24 LTS、Python 3.12** 和 Git。首次安装需要访问 npm 与 PyPI。

```powershell
git clone https://github.com/linlinjj/ecg-workbench.git
cd ecg-workbench
.\setup.ps1 -Python python
.\start.ps1
```

`setup.ps1` 创建本项目的 `.venv`、安装锁定依赖并构建前端。若 Python 命令不同，可通过 `-Python 'C:\path\to\python.exe'` 指定。`start.ps1` 打开本机网页，只监听 `127.0.0.1`；保持启动终端开启，按 Ctrl+C 停止。

也可手动运行，不使用 PowerShell 脚本：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
npm ci
npm run build
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
```

打开 [本地工作台](http://127.0.0.1:8765/)。页面右上角显示“本地完整版”后即可导入自己的记录。Linux/macOS 的手动命令将解释器路径替换为 `.venv/bin/python`；当前实际本机验收环境为 Windows，跨系统运行仍需独立确认。

## 第一次体验

1. 默认打开记录 100 的 60 秒片段，先用滚轮、左右箭头或底部概览定位。
2. 切换“滤波教学”，该示例在公开记录上**人工加噪**，右侧选择“教学去噪”。青色是原始信号，紫色是处理后信号。
3. 选择“心搏标注”点击波形，或选择“区间标注”拖选；在右侧编辑标签、采样位置和备注。
4. 点击“保存项目”下载完整项目包；在本地版“导入与恢复”中选中该文件即可继续。

关闭前请保存：当前没有自动持久化工作内容。未保存时离开或切换记录会提示。新手提示的关闭状态保存在浏览器本地。

## 导入约定

- CSV：UTF-8，第一行是唯一通道名，每列都是波形，**不包含时间列**。在导入面板填写真实采样率与单位。下载页面中的模板，使用 360 Hz / mV。
- WFDB：一次选择同一记录的 `.hea`、`.dat`，可同时选择 `.atr`。首版支持单段、等采样、单数据文件记录，不支持多段与外部路径引用。
- 限额：1—12 通道，所有通道合计不超过 500 万采样值；上传文件合计不超过 50 MiB；空值、非有限数和不等长通道会被拒绝。
- 项目包：带格式版本、原始数据校验、参考标注、个人标注、参数和视图；不需要重新找到原始文件。

## 开发与检查

```powershell
# 先启动 Python API，再在另一个终端启动前端热更新
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
npm run dev

# 测试顺序：前端测试生成跨语言恢复测试夹具，然后运行 Python 测试
npm test
.\.venv\Scripts\python.exe -m pytest -q
npm run build

# 可选：下载并校验 WASM 测试依赖，对照全部示例通道的处理值
.\.venv\Scripts\python.exe scripts/download_wasm_packages.py
npm run test:wasm
```

WASM 对照不是额外控制浏览器：它在 Node 中加载与网页同版本的 Pyodide，执行同一份 Python 代码，对比 CPython 输出。首次联网下载运行时依赖；缓存位于 `.cache/`。真实浏览器验收覆盖与限制见[验收记录](docs/验收记录.md)。

## 技术结构

```text
src/                    React 界面、波形交互、标注状态、项目导出
public/python/dsp.py     CPython / Pyodide 共用的滤波核心
public/samples/          带署名与来源信息的三段公开示例
backend/                本机 FastAPI：读取、校验、滤波与项目恢复
tests/                  科学正确性、格式和 API 检查
scripts/                示例生成、WASM 数值对照、发行打包
docs/                   学习路线、格式说明与实际验收记录
```

## GitHub Pages

仓库 `Settings → Pages → Source` 选择 **GitHub Actions**。`pages.yml` 在 main 更新时构建并发布静态示例；`ci.yml` 检查构建、前端测试和 Python 测试。在线版无需自建 Python 服务器，首次滤波会从版本固定的官方 jsDelivr 分发加载 Pyodide / NumPy / SciPy，需要网络。

## 数据与许可

代码：[MIT](LICENSE)。示例数据来自 [MIT-BIH Arrhythmia Database v1.0.0](https://physionet.org/content/mitdb/1.0.0/)，按 **ODC-By-1.0** 署名与使用，详见 [DATA_LICENSE.md](DATA_LICENSE.md)。参考标签来自数据集，人工标签由使用者填写，均不表示软件给出的医疗判断。教学滤波参数不是临床滤波规范。

依赖保留各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。欢迎提交具体复现步骤、功能建议和改进 PR；不要在公开 issue 中上传私人心电或其他敏感记录。
