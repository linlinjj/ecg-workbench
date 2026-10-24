"""Shared offline ECG teaching filters, used unchanged in CPython and Pyodide.

Filtering runs on the full channel, never on a display/downsampled window.
These are exploration filters, not diagnostic signal specifications.
"""
import numpy as np
from scipy.signal import butter, iirnotch, tf2sos, sosfiltfilt


def filter_signal(samples, fs, settings):
    fs = float(fs)
    if not np.isfinite(fs) or fs <= 0:
        raise ValueError("采样率必须是正数。")
    x = np.asarray(samples, dtype=np.float64)
    if x.ndim != 1 or x.size < 2 or not np.isfinite(x).all():
        raise ValueError("信号应包含至少两个有限数值，不能包含缺失值。")
    sections = []
    nyquist = fs / 2
    hp = float(settings.get("highpass", 0)) if settings.get("highpassEnabled") else 0
    lp = float(settings.get("lowpass", 0)) if settings.get("lowpassEnabled") else 0
    for name, value, enabled in [("高通", hp, settings.get("highpassEnabled")), ("低通", lp, settings.get("lowpassEnabled"))]:
        if enabled and (not np.isfinite(value) or not 0 < value < nyquist):
            raise ValueError(f"{name}频率必须大于 0 且小于采样率的一半（{nyquist:g} Hz）。")
    if hp and lp and hp >= lp:
        raise ValueError("高通截止频率必须小于低通截止频率。")
    if hp:
        sections.append(butter(2, hp, btype="highpass", fs=fs, output="sos"))
    if lp:
        sections.append(butter(4, lp, btype="lowpass", fs=fs, output="sos"))
    notch = float(settings.get("notch", 0))
    if notch:
        if notch not in (50, 60) or notch >= nyquist:
            raise ValueError("陷波应为 50 或 60 Hz，且必须小于采样率的一半。")
        b, a = iirnotch(notch, Q=30, fs=fs)
        sections.append(tf2sos(b, a))
    if not sections:
        return x.copy().tolist()
    if x.size < max(int(fs * 3), 64):
        raise ValueError("滤波需要至少 3 秒且不少于 64 个采样点；请使用更长的记录。")
    sos = np.vstack(sections)
    y = sosfiltfilt(sos, x)
    if not np.isfinite(y).all():
        raise ValueError("滤波结果无效，请检查参数或数据。")
    return y.tolist()
