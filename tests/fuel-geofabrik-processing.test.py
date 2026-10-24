import datetime, importlib.util, json, pathlib, subprocess, sys, tempfile, unittest
import osmium
spec = importlib.util.spec_from_file_location('processor', pathlib.Path(__file__).parents[1] / 'scripts/fuel-snapshot/process-geofabrik.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
class GeometryTests(unittest.TestCase):
    def run_xml(self, body):
        with tempfile.TemporaryDirectory() as tmp:
            file = pathlib.Path(tmp) / 'fixture.osm'; file.write_text('<osm version="0.6">' + body + '</osm>')
            return p.process(file)
    def test_nodes_ways_relations_and_nested_relations(self):
        xml = '<node id="1" lat="-33.86" lon="151.2"><tag k="amenity" v="fuel"/></node><node id="2" lat="-33.84" lon="151.22"/>'
        xml += '<way id="3"><nd ref="1"/><nd ref="2"/><tag k="amenity" v="fuel"/></way>'
        xml += '<relation id="4"><member type="way" ref="3" role="outer"/><tag k="amenity" v="fuel"/></relation><relation id="5"><member type="relation" ref="4" role=""/><tag k="amenity" v="fuel"/></relation>'
        stations, counts, total = self.run_xml(xml)
        self.assertEqual(total, 4); self.assertEqual(counts, {'node': 1, 'way': 1, 'relation': 2}); self.assertAlmostEqual(stations[-1]['lat'], -33.85)
    def test_untagged_nested_dependencies_are_resolved(self):
        xml = '<node id="1" lat="-33.86" lon="151.2"/><node id="2" lat="-33.84" lon="151.22"/><way id="3"><nd ref="1"/><nd ref="2"/></way><relation id="4"><member type="way" ref="3" role=""/></relation><relation id="5"><member type="relation" ref="4" role=""/><tag k="amenity" v="fuel"/></relation>'
        stations, counts, total = self.run_xml(xml)
        self.assertEqual(total, 1); self.assertEqual(counts['relation'], 1); self.assertEqual(stations[0]['id'], 'relation/5')

    def test_missing_geometry_fails_even_if_valid_station_also_exists(self):
        base = '<node id="1" lat="-33.86" lon="151.2"><tag k="amenity" v="fuel"/></node>'
        for broken in ['<way id="2"><nd ref="1"/><nd ref="999"/><tag k="amenity" v="fuel"/></way>', '<relation id="3"><member type="way" ref="999" role=""/><tag k="amenity" v="fuel"/></relation>', '<relation id="3"><member type="relation" ref="999" role=""/><tag k="amenity" v="fuel"/></relation>', '<relation id="3"><member type="relation" ref="3" role=""/><tag k="amenity" v="fuel"/></relation>']:
            with self.assertRaises((ValueError, KeyError)): self.run_xml(base + broken)
    def test_filter_outside_private_closed_and_keep_boundary(self):
        xml = '<node id="1" lat="-34" lon="151"><tag k="amenity" v="fuel"/></node><node id="2" lat="-35" lon="150"><tag k="amenity" v="fuel"/></node><node id="3" lat="-33.86" lon="151.2"><tag k="amenity" v="fuel"/><tag k="access" v="private"/></node><node id="4" lat="-33.86" lon="151.2"><tag k="amenity" v="fuel"/><tag k="closed" v="yes"/></node>'
        stations, _, total = self.run_xml(xml); self.assertEqual(total, 2); self.assertEqual([s['id'] for s in stations], ['node/1'])
    def test_empty_and_oversized_fail(self):
        with self.assertRaises(ValueError): self.run_xml('<node id="1" lat="-35" lon="150"><tag k="amenity" v="fuel"/></node>')
        with self.assertRaises(ValueError): self.run_xml(''.join('<node id="%s" lat="-33.86" lon="151.2"><tag k="amenity" v="fuel"/></node>' % i for i in range(1, 502)))
    def test_processing_failure_retains_safe_phase_and_validation_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp); data = root / 'bad.osm'; receipt = root / 'source.json'; out = root / 'out'
            timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            # Missing referenced geometry must fail closed, and no arbitrary tag text reaches diagnostic.
            data = root / 'bad.osm.pbf'; header = osmium.io.Header(); header.set('osmosis_replication_timestamp',timestamp)
            with osmium.SimpleWriter(str(data),header=header) as writer:
                writer.add_way(osmium.osm.mutable.Way(id=1,nodes=[90,91],tags={'amenity':'fuel','name':'UNTRUSTED_PAYLOAD'}))
            receipt.write_text('{}')
            result = subprocess.run([sys.executable,str(pathlib.Path(p.__file__)),str(data),str(receipt),str(out)],capture_output=True,text=True)
            self.assertEqual(result.returncode,1); self.assertEqual(result.stderr,'')
            diagnostic = json.loads((out/'processing-diagnostic.json').read_text())
            self.assertEqual(diagnostic['error'],'MISSING_NODE'); self.assertEqual(diagnostic['phase'],'node-dependencies')
            self.assertNotIn('UNTRUSTED',json.dumps(diagnostic)); self.assertFalse((out/'sydney-v1.json').exists())

    def test_real_pbf_reader_header_and_snapshot_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp); data = root / 'fixture.osm.pbf'; receipt = root / 'source.json'; out = root / 'out'
            timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            header = osmium.io.Header(); header.set('osmosis_replication_timestamp', timestamp)
            with osmium.SimpleWriter(str(data), header=header) as writer:
                writer.add_node(osmium.osm.mutable.Node(id=1, location=(151.2, -33.86), tags={'amenity': 'fuel', 'name': 'Synthetic PBF fixture'}))
            receipt.write_text(json.dumps({'retrievedAt': timestamp, 'url': 'https://fixture.invalid/source', 'md5': 'a'*32, 'sha256': 'b'*64, 'bytes': data.stat().st_size}))
            result = subprocess.run([sys.executable, str(pathlib.Path(p.__file__)), str(data), str(receipt), str(out)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            snapshot = json.loads((out / 'sydney-v1.json').read_text())
            self.assertEqual(snapshot['source']['osmBaseTimestamp'], timestamp)
            self.assertTrue(snapshot['coverage']['complete']); self.assertEqual(len(snapshot['stations']), 1)
            self.assertEqual(snapshot['source']['license'], 'ODbL-1.0')

if __name__ == '__main__': unittest.main()
