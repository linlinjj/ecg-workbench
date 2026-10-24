import csv
import hashlib
import io
import json
import math
import zipfile
from pathlib import Path

import numpy as np
import wfdb

MAX_BYTES = 50 * 1024 * 1024
MAX_VALUES = 5_000_000


def validate_record(record):
    fs = record.get("fs")
    if isinstance(fs, bool) or not isinstance(fs, (float, int)) or not math.isfinite(fs) or fs <= 0:
        raise ValueError("项目采样率无效。")
    channels = record.get("channels", [])
    if not 1 <= len(channels) <= 12:
        raise ValueError("首版支持 1—12 个通道。")
    count = len(channels[0].get("data", []))
    if count < 2 or count * len(channels) > MAX_VALUES:
        raise ValueError("记录过短或超过 500 万个采样值。")
    for c in channels:
        data = c.get("data", [])
        if len(data) != count or not c.get("name") or not c.get("unit"):
            raise ValueError("通道长度必须一致，通道名和单位不能为空。")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in data):
            raise ValueError("波形包含空值、非数字或无效值。")
    for a in record.get("reference", []):
        if not isinstance(a.get("sample"), int) or not 0 <= a["sample"] < count:
            raise ValueError("参考标注越界。")
    record["sampleCount"] = count
    return record


def from_csv(content, fs, unit, name="导入的 CSV"):
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("请使用 UTF-8 编码的 CSV 文件。") from exc
    if not unit or unit not in ("mV", "uV", "V", "a.u."):
        raise ValueError("请选择数据的真实单位。")
    rows = csv.reader(io.StringIO(text))
    names = next(rows, [])
    names = [s.strip() for s in names]
    if not names or any(not s for s in names) or len(names) != len(set(names)):
        raise ValueError("CSV 第一行应为不重复且非空的通道名。")
    if any(s.lower() in ("time", "timestamp", "time_s", "sample", "index") for s in names):
        raise ValueError("CSV 模板每列只放一个波形通道；请移除时间或索引列，采样率在导入面板填写。")
    if len(names) > 12:
        raise ValueError("首版支持最多 12 个通道。")
    values = [[] for _ in names]
    for line, row in enumerate(rows, 2):
        if len(row) != len(names):
            raise ValueError(f"CSV 第 {line} 行的列数不正确。")
        try:
            numbers = [float(v) for v in row]
        except ValueError as exc:
            raise ValueError(f"CSV 第 {line} 行包含空值或非数字。") from exc
        if not all(math.isfinite(v) for v in numbers):
            raise ValueError(f"CSV 第 {line} 行存在无效数值。")
        for c, v in zip(values, numbers):
            c.append(v)
        if len(values[0]) * len(names) > MAX_VALUES:
            raise ValueError("记录超过 500 万个采样值。")
    digest = hashlib.sha256(content).hexdigest()
    return validate_record({"id": digest[:16], "name": name, "fs": fs,
        "channels": [{"name": n, "unit": unit, "data": c} for n, c in zip(names, values)],
        "reference": [], "provenance": {"dataset": "本地 CSV", "record": name, "offsetSamples": 0, "sha256": digest}})


def from_wfdb(folder, header_name):
    path = str(Path(folder) / Path(header_name).stem)
    header = wfdb.rdheader(path)
    if isinstance(header, wfdb.MultiRecord) or header.n_sig > 12 or header.sig_len * header.n_sig > MAX_VALUES:
        raise ValueError("首版支持单段、最多 12 通道、合计不超过 500 万个采样值的 WFDB 记录。")
    if any(n != 1 for n in (header.samps_per_frame or [])) or len(set(header.file_name)) != 1:
        raise ValueError("首版支持等采样、单个数据文件的 WFDB 记录。")
    for filename in header.file_name:
        if Path(filename).name != filename or not (Path(folder) / filename).is_file():
            raise ValueError("波形文件缺失或头文件引用了目录外的路径。")
    raw = wfdb.rdrecord(path)
    anns = []
    atr = Path(path + ".atr")
    if atr.exists():
        a = wfdb.rdann(path, "atr")
        anns = [{"id": f"ref-{i}", "sample": int(s), "symbol": symbol, "note": note or ""}
                for i, (s, symbol, note) in enumerate(zip(a.sample, a.symbol, a.aux_note)) if 0 <= s < raw.sig_len]
    record = {"id": hashlib.sha256(Path(path + ".hea").read_bytes()).hexdigest()[:16],
        "name": Path(header_name).stem, "fs": float(raw.fs), "reference": anns,
        "channels": [{"name": n, "unit": u or "a.u.", "data": raw.p_signal[:, i].tolist()}
                     for i, (n, u) in enumerate(zip(raw.sig_name, raw.units))],
        "provenance": {"dataset": "本地 WFDB", "record": Path(header_name).stem, "offsetSamples": 0,
                       "sha256": hashlib.sha256(Path(path + ".dat").read_bytes()).hexdigest() if Path(path + ".dat").exists() else ""}}
    return validate_record(record)


def from_project(content):
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            infos = z.infolist()
            if sum(i.file_size for i in infos) > 250 * 1024 * 1024 or len(infos) > 8:
                raise ValueError("项目解压体积过大。")
            if len({i.filename for i in infos}) != len(infos) or set(z.namelist()) != {"manifest.json", "record.json"}:
                raise ValueError("项目包应包含 manifest.json 和 record.json。")
            manifest = json.loads(z.read("manifest.json"))
            raw = z.read("record.json")
            if manifest.get("format") != "ecg-workbench" or manifest.get("version") != 1:
                raise ValueError("不支持此项目格式版本。")
            if hashlib.sha256(raw).hexdigest() != manifest.get("recordSha256"):
                raise ValueError("项目波形校验失败，文件可能已损坏。")
            record = validate_record(json.loads(raw))
            annotations = manifest.get("annotations", [])
            if not isinstance(annotations, list) or len(annotations) > 100_000:
                raise ValueError("项目标注列表无效。")
            ids = set()
            for a in annotations:
                if a.get("kind") not in ("point", "interval") or not isinstance(a.get("id"), str) or a["id"] in ids:
                    raise ValueError("项目标注类型或编号无效。")
                ids.add(a["id"])
                if not isinstance(a.get("channel"), int) or not 0 <= a["channel"] < len(record["channels"]):
                    raise ValueError("标注通道无效。")
                if not isinstance(a.get("start"), int) or not 0 <= a["start"] < record["sampleCount"]:
                    raise ValueError("标注起点越界。")
                if a["kind"] == "interval" and (not isinstance(a.get("end"), int) or not a["start"] < a["end"] <= record["sampleCount"]):
                    raise ValueError("区间终点无效。")
                if not isinstance(a.get("label"), str) or len(a["label"]) > 80 or not isinstance(a.get("note", ""), str) or len(a.get("note", "")) > 4000:
                    raise ValueError("标注文字无效或过长。")
            settings = manifest.get("settings", {})
            if not isinstance(settings, dict):
                raise ValueError("滤波参数无效。")
            for key in ('highpassEnabled','lowpassEnabled'):
                if key in settings and not isinstance(settings[key], bool):
                    raise ValueError("滤波开关格式无效。")
            for key in ('highpass','lowpass','notch'):
                if key in settings and (isinstance(settings[key], bool) or not isinstance(settings[key], (int,float)) or not math.isfinite(settings[key])):
                    raise ValueError("滤波频率格式无效。")
            channel = manifest.get('channel', 0)
            if isinstance(channel, bool) or not isinstance(channel, int) or not 0 <= channel < len(record['channels']):
                raise ValueError("项目当前通道无效。")
            view = manifest.get('view', [0, min(record['sampleCount'], record['fs'] * 10)])
            if not isinstance(view, list) or len(view) != 2 or not all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) for v in view) or not 0 <= view[0] < view[1] <= record['sampleCount']:
                raise ValueError("项目显示范围无效。")
            return {"record": record, "annotations": annotations, "settings": settings,
                    "channel": channel, "view": view}
    except (zipfile.BadZipFile, KeyError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("无法读取项目包：格式不完整或文件已损坏。") from exc
