import importlib.util
import math
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from .data import MAX_BYTES, MAX_VALUES, from_csv, from_project, from_wfdb

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("ecg_dsp", ROOT / "public/python/dsp.py")
dsp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dsp)
app = FastAPI(title="ECG Workbench 本地接口", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.get("/api/health")
def health():
    return {"mode": "local", "version": "0.1.0"}


class FilterRequest(BaseModel):
    samples: list[float]
    fs: float
    settings: dict


@app.post("/api/filter")
def filter_channel(request: FilterRequest):
    if len(request.samples) > MAX_VALUES:
        raise HTTPException(413, "记录超过 500 万个采样值。")
    try:
        return {"samples": dsp.filter_signal(request.samples, request.fs, request.settings)}
    except (ValueError, TypeError, OverflowError) as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/import")
async def import_record(files: list[UploadFile] = File(...), fs: float = Form(360), unit: str = Form("mV")):
    try:
        if not 1 <= len(files) <= 3:
            raise ValueError("请选择一个 CSV、项目包，或同一条记录的 .hea/.dat/.atr 文件（最多三个）。")
        contents = {}
        total = 0
        for f in files:
            name = f.filename or ""
            if not name or Path(name).name != name or "/" in name or "\\" in name or name in contents:
                raise ValueError("文件名无效或重复。")
            b = await f.read(MAX_BYTES + 1)
            total += len(b)
            if total > MAX_BYTES:
                raise HTTPException(413, "文件合计不能超过 50 MiB。")
            contents[name] = b
        name = next(iter(contents))
        if len(contents) == 1 and name.lower().endswith(".csv"):
            return {"record": from_csv(contents[name], fs, unit, Path(name).stem)}
        if len(contents) == 1 and name.lower().endswith((".ecgwork", ".zip")):
            restored = from_project(contents[name])
            settings = restored["settings"]
            dsp.filter_signal(restored["record"]["channels"][0]["data"], restored["record"]["fs"], settings)
            return restored
        headers = [n for n in contents if n.lower().endswith(".hea")]
        if len(headers) != 1 or any(Path(n).suffix.lower() not in (".hea", ".dat", ".atr") for n in contents):
            raise ValueError("请选择同一条 WFDB 记录的 .hea、.dat 和可选的 .atr。")
        stem = Path(headers[0]).stem
        if any(Path(n).stem != stem for n in contents):
            raise ValueError("WFDB 文件必须属于同一条记录。")
        with tempfile.TemporaryDirectory(prefix="ecg-import-") as temp:
            for n, b in contents.items():
                (Path(temp) / n).write_bytes(b)
            return {"record": from_wfdb(temp, headers[0])}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, str(exc) or "无法读取记录。") from exc


if (ROOT / "dist").exists():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
