# ECG Workbench

**Explore the signal. Compare processing. Annotate what you observe.**

[中文](README.md) · [Online demo](https://linlinjj.github.io/ecg-workbench/) · [Source](https://github.com/linlinjj/ecg-workbench)

A Chinese-first ECG exploration workbench for learners and early-stage researchers. The browser demo works with attributed public clips; the local edition imports your own data. See the Chinese acceptance report for the actual deployment and verification status.

## Features

- Interactive waveforms, overview navigation, zoom, pan and channel switching.
- Original/filtered comparison with configurable high-pass, low-pass and 50/60 Hz notch filters.
- Editable beat points and half-open intervals, notes, undo and redo.
- Dataset reference annotations remain separate from personal annotations.
- Export annotation CSV, waveform PNG, or a self-contained `.ecgwork` project.
- Local CSV, single-segment WFDB, and complete project import.

There is no automatic beat detection, AI classification or clinical diagnosis in this release.

## Windows quick start

Install Node.js 24 LTS and Python 3.12, then:

```powershell
git clone https://github.com/linlinjj/ecg-workbench.git
cd ecg-workbench
.\setup.ps1
.\start.ps1
```

The local server binds only to `127.0.0.1`. Keep the launcher running; Ctrl+C stops its process. If scripts cannot run, use the manual commands in the Chinese README. On Unix-like systems replace `.venv\Scripts\python.exe` with `.venv/bin/python`; independent cross-platform acceptance is still required.

CSV files use UTF-8, unique channel names in the first row and waveform-only numeric columns. Provide the correct sample rate and amplitude unit in the import dialog. Limits: 12 channels, 5 million total values, 50 MiB total input files. WFDB support covers equal-rate, single-segment records with one waveform file and optional `.atr` references.

Save before closing: working data are not automatically persisted. Exported projects contain original signals, provenance, annotations, filter parameters, view state and an integrity hash.

## Validation

```powershell
npm ci
npm test
python -m pip install -r requirements-lock.txt
python -m pytest -q
npm run build
# Optional numerical parity check; create .venv first for the CPython side:
python scripts/download_wasm_packages.py
npm run test:wasm
```

The frontend tests generate a fixture for the Python project-restoration test, so run them first. WASM parity uses the same version of Pyodide and the exact shared Python source as the web worker; it does not automate an existing browser.

The online demo is a static Vite build, deployed by GitHub Actions to Pages. Enable **Settings → Pages → GitHub Actions**. Its first filtering operation downloads the pinned Pyodide scientific runtime from jsDelivr; subsequent computations reuse it. The local edition uses SciPy and WFDB behind FastAPI. Raw signals are never replaced by filtered or display-decimated arrays.

## Attribution and license

Original code is MIT licensed. Demo clips derive from Moody & Mark's **MIT-BIH Arrhythmia Database v1.0.0**, DOI [10.13026/C2F305](https://doi.org/10.13026/C2F305), under ODC-By-1.0. The noisy demo is explicitly synthetic and preserves the source annotation provenance. See [data attribution](DATA_LICENSE.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

This is an educational and research-exploration tool. Its filters and manual labels are not diagnostic output. Please do not post private ECG records in public issues.
