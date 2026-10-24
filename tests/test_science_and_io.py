import copy
import hashlib
import io
import json
import zipfile
from pathlib import Path

import numpy as np
import pytest
import wfdb
from fastapi.testclient import TestClient
from backend.app import app, dsp
from backend.data import from_csv, from_project, from_wfdb

ROOT = Path(__file__).resolve().parents[1]
RAW = dict(highpassEnabled=False, highpass=.5, lowpassEnabled=False, lowpass=40, notch=0)
client = TestClient(app)


def amplitude(y, fs, freq):
    # Ignore the record edges; compare sinusoidal projection in the interior.
    y = np.asarray(y)[int(fs*4):-int(fs*4)]
    t = np.arange(len(y)) / fs
    return abs(np.dot(y, np.exp(-2j*np.pi*freq*t))) * 2 / len(y)


def test_frequency_behavior_and_original_unchanged():
    fs = 360
    t = np.arange(fs*30)/fs
    x = np.sin(2*np.pi*5*t) + .4*np.sin(2*np.pi*.2*t) + .3*np.sin(2*np.pi*50*t)
    before = x.copy()
    y = dsp.filter_signal(x, fs, dict(RAW, highpassEnabled=True, lowpassEnabled=True, notch=50))
    assert len(y) == len(x) and np.isfinite(y).all()
    assert .95 < amplitude(y, fs, 5) < 1.05
    assert amplitude(y, fs, .2) < .02
    assert amplitude(y, fs, 50) < .003
    np.testing.assert_array_equal(before, x)


@pytest.mark.parametrize('settings', [dict(RAW, highpassEnabled=True, highpass=-1), dict(RAW, lowpassEnabled=True, lowpass=180), dict(RAW, highpassEnabled=True, lowpassEnabled=True, highpass=45), dict(RAW, notch=55)])
def test_invalid_frequency_rejected(settings):
    with pytest.raises(ValueError):
        dsp.filter_signal([0]*3600, 360, settings)


def test_short_signal_and_nan_rejected_but_raw_can_be_short():
    assert dsp.filter_signal([1, 2], 360, RAW) == [1, 2]
    with pytest.raises(ValueError): dsp.filter_signal([1, 2], 360, dict(RAW, highpassEnabled=True))
    with pytest.raises(ValueError): dsp.filter_signal([float('nan'), 1], 360, RAW)


def test_offline_filter_preserves_interior_impulse_alignment():
    x = np.zeros(7200); x[3600] = 1
    y = dsp.filter_signal(x, 360, dict(RAW, highpassEnabled=True, lowpassEnabled=True))
    assert np.argmax(y) == 3600


def test_csv_template_units_and_validation():
    r = from_csv(b'Lead1,Lead2\n.1,.2\n.3,.4\n', 250, 'uV')
    assert r['fs'] == 250 and r['channels'][0]['unit'] == 'uV'
    assert r['channels'][1]['data'] == [.2, .4]
    for content in [b'Lead\nNaN\n2\n', b'time,Lead\n0,1\n.1,2\n', b'A,A\n1,2\n3,4\n', b'A,B\n1\n2,3\n', b'A\n\n2\n']:
        with pytest.raises(ValueError): from_csv(content, 360, 'mV')
    with pytest.raises(ValueError): from_csv(b'A\n1\n2\n', 0, 'mV')


def test_wfdb_real_format_roundtrip(tmp_path):
    r = json.loads((ROOT/'public/samples/100.json').read_text(encoding='utf8'))
    values = np.array([c['data'][:1800] for c in r['channels']]).T
    wfdb.wrsamp('fixture', fs=360, units=['mV','mV'], sig_name=['MLII','V5'], p_signal=values, fmt=['16','16'], write_dir=str(tmp_path))
    wfdb.wrann('fixture', 'atr', sample=np.array([77,370]), symbol=['N','A'], write_dir=str(tmp_path))
    loaded = from_wfdb(tmp_path, 'fixture.hea')
    np.testing.assert_allclose(np.array([c['data'] for c in loaded['channels']]).T, values, atol=2e-5)
    assert loaded['reference'][1]['symbol'] == 'A'


def test_typescript_created_package_restores_in_python():
    raw = (ROOT/'.verification/roundtrip.ecgwork').read_bytes()
    restored = from_project(raw)
    assert restored['annotations'][1]['end'] == 1440
    assert restored['channel'] == 1 and restored['view'] == [360, 3960]
    assert restored['record']['channels'][0]['data'][100] == json.loads((ROOT/'public/samples/100.json').read_text(encoding='utf8'))['channels'][0]['data'][100]
    assert restored['settings']['notch'] == 50


def test_package_tamper_and_annotation_bounds_rejected():
    original = (ROOT/'.verification/roundtrip.ecgwork').read_bytes()
    with zipfile.ZipFile(io.BytesIO(original)) as z:
        manifest = json.loads(z.read('manifest.json')); record = z.read('record.json')
    def package(m, r):
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as z:
            z.writestr('manifest.json', json.dumps(m)); z.writestr('record.json', r)
        return out.getvalue()
    with pytest.raises(ValueError): from_project(package(manifest, record+b' '))
    altered=copy.deepcopy(manifest);altered['annotations'][0]['start']=-1
    with pytest.raises(ValueError): from_project(package(altered, record))


def test_api_import_and_filter_errors():
    response = client.post('/api/import', files={'files':('test.csv',b'ECG\n.1\n.2\n.3\n','text/csv')}, data={'fs':'250','unit':'mV'})
    assert response.status_code == 200 and response.json()['record']['sampleCount'] == 3
    bad = client.post('/api/filter', json={'samples':[0]*100,'fs':360,'settings':dict(RAW, notch=50)})
    assert bad.status_code == 400
    corrupt = client.post('/api/import',files={'files':('bad.ecgwork',b'broken','application/zip')})
    assert corrupt.status_code == 400


def test_wfdb_header_cannot_read_outside_upload(tmp_path):
    (tmp_path/'bad.hea').write_text('bad 1 360 100\n../secret.dat 16 200/mV 16 0 0 0 0 ECG\n')
    with pytest.raises(ValueError): from_wfdb(tmp_path,'bad.hea')


def modified_project(change):
    with zipfile.ZipFile(ROOT/'.verification/roundtrip.ecgwork') as z:
        manifest=json.loads(z.read('manifest.json'))
        record=json.loads(z.read('record.json'))
    change(record,manifest)
    raw=json.dumps(record).encode()
    manifest['recordSha256']=hashlib.sha256(raw).hexdigest()
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w') as z:
        z.writestr('manifest.json',json.dumps(manifest));z.writestr('record.json',raw)
    return output.getvalue()


@pytest.mark.parametrize('change',[
    lambda r,m:r.pop('provenance'),
    lambda r,m:r.update(name={'invalid':'object'}),
    lambda r,m:r['channels'][0].update(name={'invalid':'object'}),
    lambda r,m:r['channels'][0].update(unit={'invalid':'object'}),
    lambda r,m:r['reference'][0].update(symbol={'invalid':'object'}),
    lambda r,m:r['reference'][0].update(sample=True),
    lambda r,m:r['reference'].append(copy.deepcopy(r['reference'][0])),
    lambda r,m:r['provenance'].update(offsetSamples=True),
    lambda r,m:m['annotations'][0].update(start=True),
    lambda r,m:m['annotations'][0].update(channel=True),
])
def test_project_schema_rejects_malformed_metadata(change):
    payload=modified_project(change)
    with pytest.raises(ValueError):from_project(payload)
    response=client.post('/api/import',files={'files':('invalid.ecgwork',payload,'application/zip')})
    assert response.status_code==400


def test_project_missing_reference_is_normalized():
    restored=from_project(modified_project(lambda r,m:r.pop('reference')))
    assert restored['record']['reference']==[]
