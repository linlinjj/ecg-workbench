# Demo data attribution

The clips in `public/samples/` are derived from:

Moody, G., & Mark, R. (2005). **MIT-BIH Arrhythmia Database (version 1.0.0)**. PhysioNet.
DOI: https://doi.org/10.13026/C2F305
Source: https://physionet.org/content/mitdb/1.0.0/
License: Open Data Commons Attribution License v1.0 (ODC-By-1.0)
Full license: https://opendatacommons.org/licenses/by/1-0/

Original publication: Moody GB, Mark RG. The impact of the MIT-BIH Arrhythmia Database.
IEEE Engineering in Medicine and Biology 20(3):45–50 (2001).

## Derivations

- `100.json`: record 100, samples [0, 21600), both original channels, physical units in mV.
- `119.json`: record 119, samples [0, 21600), both original channels, physical units in mV.
- `noisy.json`: record 100, same interval; synthetic 0.2 Hz sine (0.22 mV), 50 Hz sine (0.08 mV), Gaussian noise (standard deviation 0.025 mV), NumPy random seed 42.
- All clip values are rounded to six decimal places. Record identity, sampling rate, original annotation symbols, clip offset and input file hashes are retained in `provenance`.
- Original reference annotations are not predictions. The noisy example reuses the source annotations; its noisy waveform has not been re-reviewed by experts.
- The CSV template is the first five seconds of record 100, first channel; use fs=360 Hz, unit=mV.

Do not represent the synthetic interference as naturally acquired patient noise. When redistributing derived data, preserve attribution, license links and transformation notes. Original project code is separately MIT licensed.
