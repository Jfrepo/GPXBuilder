"""Offline regional entity-count regression; synthetic data, never a station source."""
import datetime, json, os, pathlib, subprocess, tempfile, time
import osmium
ROOT = pathlib.Path(__file__).parents[1]
NODES, WAYS = 30000000, 1000000
with tempfile.TemporaryDirectory(prefix='fuel-scale-') as tmp:
    root = pathlib.Path(tmp); file = root / 'synthetic.osm.pbf'; out = root / 'out'; out.mkdir()
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    header = osmium.io.Header(); header.set('osmosis_replication_timestamp', timestamp)
    started = time.monotonic()
    with osmium.SimpleWriter(str(file), header=header) as writer:
        for i in range(1, NODES+1):
            writer.add_node(osmium.osm.mutable.Node(id=i, location=(151.1+(i%1000)*0.0001,-33.9+(i%100)*0.0001), tags={'amenity':'fuel'} if i==1 else {}))
        for i in range(1, WAYS+1):
            writer.add_way(osmium.osm.mutable.Way(id=i, nodes=[i, i+1, NODES], tags={'amenity':'fuel'} if i==1 else {}))
        writer.add_relation(osmium.osm.mutable.Relation(id=1, members=[('w',1,'outer')]))
        writer.add_relation(osmium.osm.mutable.Relation(id=2, members=[('r',1,'')], tags={'amenity':'fuel'}))
    generated = round(time.monotonic()-started,3)
    receipt = root / 'source.json'
    receipt.write_text(json.dumps({'retrievedAt':timestamp,'url':'https://fixture.invalid/synthetic','md5':'a'*32,'sha256':'b'*64,'bytes':file.stat().st_size}))
    # Use the actual Node subprocess wrapper, default 300-second deadline and exact Python entry point.
    script = "require('./scripts/fuel-snapshot/geofabrik.cjs').runProcessor(...process.argv.slice(1))"
    result = subprocess.run(['node','-e',script,str(file),str(receipt),str(out)],cwd=ROOT,capture_output=True,text=True,timeout=310)
    assert result.returncode == 0, 'SCALE_PROCESSING_FAILED'
    snapshot = json.loads((out/'sydney-v1.json').read_text())
    assert [s['id'] for s in snapshot['stations']] == ['node/1','relation/2','way/1']
    assert snapshot['coverage']['complete'] is True
    assert json.loads((out/'geometry-validation.json').read_text())['retainedByType'] == {'node':1,'way':1,'relation':1}
    processing = json.loads((out/'processing-result.json').read_text())
    phase = json.loads((out/'processing-diagnostic.json').read_text())
    assert processing['errorCode'] is None and processing['exitStatus'] == 0
    assert phase['completed'] is True
    print(json.dumps({'synthetic':True,'nodes':NODES,'ways':WAYS,'relations':2,'pbfBytes':file.stat().st_size,'generationSeconds':generated,'processing':processing,'peakRssKiB':phase['peakRssKiB']}),flush=True)
