"""Build attributed 60 s demo clips. Never alters source records."""
import hashlib
import json
import sys
from pathlib import Path
import numpy as np
import wfdb

ROOT = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else None
out = ROOT / "public/samples"
out.mkdir(parents=True, exist_ok=True)
for name, title in [("100", "节律观察"), ("119", "心搏形态对比")]:
    path = str(source / name) if source else name
    opts = {} if source else {"pn_dir": "mitdb"}
    rec = wfdb.rdrecord(path, sampto=21600, **opts)
    ann = wfdb.rdann(path, "atr", sampto=21600, **opts)
    result = {"id": "mitdb-" + name, "name": title, "fs": rec.fs, "sampleCount": len(rec.p_signal),
        "channels": [{"name": n, "unit": u, "data": np.round(rec.p_signal[:, i], 6).tolist()}
                     for i, (n, u) in enumerate(zip(rec.sig_name, rec.units))],
        "reference": [{"id": f"ref-{i}", "sample": int(s), "symbol": symbol, "note": note or ""}
                      for i, (s, symbol, note) in enumerate(zip(ann.sample, ann.symbol, ann.aux_note))],
        "provenance": {"dataset": "MIT-BIH Arrhythmia Database v1.0.0", "record": name, "offsetSamples": 0,
            "url": "https://physionet.org/content/mitdb/1.0.0/", "license": "ODC-By-1.0",
            "sourceSha256": {ext: hashlib.sha256((source / (name + ext)).read_bytes()).hexdigest() for ext in (".hea", ".dat", ".atr")} if source else {}}}
    (out / (name + ".json")).write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if name == "100":
        noisy = json.loads(json.dumps(result))
        noisy["id"] = "mitdb-100-noisy"
        noisy["name"] = "滤波教学 · 人工加噪"
        rng = np.random.default_rng(42)
        t = np.arange(len(rec.p_signal)) / rec.fs
        for i, c in enumerate(noisy["channels"]):
            c["data"] = np.round(rec.p_signal[:, i] + .22 * np.sin(2*np.pi*.2*t) + .08*np.sin(2*np.pi*50*t) + rng.normal(0, .025, len(t)), 6).tolist()
        noisy["provenance"]["transformations"] = "人工加噪：0.2 Hz 正弦 0.22 mV、50 Hz 正弦 0.08 mV、Gaussian σ=0.025 mV，种子 42。参考标注来自原记录，非重新审核。"
        (out / "noisy.json").write_text(json.dumps(noisy, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("Generated three attributed ECG clips.")
