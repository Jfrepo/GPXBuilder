"""Offline OSM geometry validation. Never makes network requests."""
import datetime, hashlib, json, math, pathlib, sys
import osmium
BOUNDS = {'south': -34, 'west': 151, 'north': -33.5, 'east': 151.5}
TAG_KEYS = ('amenity', 'name', 'brand', 'operator', 'addr:housenumber', 'addr:street', 'addr:suburb', 'addr:city', 'addr:postcode', 'opening_hours', 'phone', 'contact:phone')

def active(tags):
    return (tags.get('amenity') == 'fuel' and not any(tags.get(k, '').lower() in ('yes', 'true', '1') for k in ('disused', 'abandoned', 'demolished', 'closed', 'construction')) and not any(tags.get(k) for k in ('disused:amenity', 'abandoned:amenity', 'demolished:amenity', 'construction:amenity')) and tags.get('access', '').lower() not in ('no', 'private'))

def position(node):
    if not node.location.valid(): raise ValueError('INVALID_NODE_LOCATION')
    p = (node.location.lat, node.location.lon)
    if not all(math.isfinite(v) for v in p) or not (-90 <= p[0] <= 90 and -180 <= p[1] <= 180): raise ValueError('INVALID_NODE_LOCATION')
    return p

def process(filename):
    fuel, nodes, ways, relations = {}, {}, {}, {}
    class Initial(osmium.SimpleHandler):
        def node(self, obj):
            tags = dict(obj.tags)
            if active(tags): fuel[('n', obj.id)] = tags; nodes[obj.id] = position(obj)
        def way(self, obj):
            tags = dict(obj.tags)
            if active(tags): fuel[('w', obj.id)] = tags; ways[obj.id] = [n.ref for n in obj.nodes]
        def relation(self, obj):
            tags = dict(obj.tags)
            if active(tags): fuel[('r', obj.id)] = tags; relations[obj.id] = [(m.type, m.ref) for m in obj.members]
    Initial().apply_file(str(filename))
    if not fuel or len(fuel) > 20000: raise ValueError('FUEL_COUNT_LIMIT')
    for depth in range(8):
        missing = {ref for members in relations.values() for typ, ref in members if typ == 'r' and ref not in relations}
        if not missing: break
        class Related(osmium.SimpleHandler):
            def relation(self, obj):
                if obj.id in missing: relations[obj.id] = [(m.type, m.ref) for m in obj.members]
        Related().apply_file(str(filename))
        if any(ref not in relations for ref in missing): raise ValueError('MISSING_RELATION')
        if len(relations) > 5000: raise ValueError('RELATION_LIMIT')
    else: raise ValueError('RELATION_DEPTH_LIMIT')
    needed_ways = {ref for members in relations.values() for typ, ref in members if typ == 'w'}
    class Ways(osmium.SimpleHandler):
        def way(self, obj):
            if obj.id in needed_ways: ways[obj.id] = [n.ref for n in obj.nodes]
    if needed_ways: Ways().apply_file(str(filename))
    if any(ref not in ways for ref in needed_ways): raise ValueError('MISSING_WAY')
    needed_nodes = {ref for refs in ways.values() for ref in refs} | {ref for members in relations.values() for typ, ref in members if typ == 'n'}
    if len(needed_nodes) > 500000: raise ValueError('GEOMETRY_LIMIT')
    class Nodes(osmium.SimpleHandler):
        def node(self, obj):
            if obj.id in needed_nodes: nodes[obj.id] = position(obj)
    if needed_nodes: Nodes().apply_file(str(filename))
    if any(ref not in nodes for ref in needed_nodes): raise ValueError('MISSING_NODE')
    cache = {}
    def box(key, stack=()):
        if key in cache: return cache[key]
        if key in stack or len(stack) > 8: raise ValueError('CYCLIC_GEOMETRY')
        typ, ref = key
        if typ == 'n':
            lat, lon = nodes[ref]; result = (lat, lon, lat, lon)
        else:
            members = [('n', n) for n in ways[ref]] if typ == 'w' else relations[ref] if typ == 'r' else []
            if not members or (typ == 'w' and len(members) < 2): raise ValueError('EMPTY_GEOMETRY')
            boxes = [box(member, stack + (key,)) for member in members]
            result = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        cache[key] = result; return result
    stations, counts = [], {'node': 0, 'way': 0, 'relation': 0}
    for key, tags in sorted(fuel.items()):
        b = box(key); lat, lon = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        if BOUNDS['south'] <= lat <= BOUNDS['north'] and BOUNDS['west'] <= lon <= BOUNDS['east']:
            typ = {'n': 'node', 'w': 'way', 'r': 'relation'}[key[0]]
            stations.append({'id': typ + '/' + str(key[1]), 'lat': lat, 'lon': lon, 'tags': {k: tags[k][:500] for k in TAG_KEYS if k in tags}}); counts[typ] += 1
    if not stations or len(stations) > 500 or len(json.dumps(stations, ensure_ascii=False).encode('utf-16-le')) > 500000: raise ValueError('SNAPSHOT_SIZE')
    return stations, counts, len(fuel)

def main():
    filename, receipt_path, out = map(pathlib.Path, sys.argv[1:])
    receipt = json.loads(receipt_path.read_text())
    with osmium.io.Reader(str(filename)) as reader:
        timestamp = reader.header().get('osmosis_replication_timestamp')
    moment = datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    now = datetime.datetime.now(datetime.timezone.utc)
    if moment > now + datetime.timedelta(minutes=1) or now - moment > datetime.timedelta(days=7): raise ValueError('SOURCE_TIMESTAMP')
    stations, counts, inspected = process(filename)
    snapshot = {'schemaVersion': 1, 'coverage': {'cellKey': '-68:302', 'bounds': BOUNDS, 'complete': True, 'semantics': 'All active fuel features in the NSW extract whose validated geometry bounding-box centre falls within these bounds; not a guarantee of all real-world stations'}, 'retrievedAt': receipt['retrievedAt'], 'source': {'dataset': 'OpenStreetMap via Geofabrik', 'url': receipt['url'], 'md5': receipt['md5'], 'sha256': receipt['sha256'], 'bytes': receipt['bytes'], 'osmBaseTimestamp': timestamp, 'license': 'ODbL-1.0', 'licenseUrl': 'https://opendatacommons.org/licenses/odbl/1-0/', 'attribution': '© OpenStreetMap contributors', 'attributionUrl': 'https://www.openstreetmap.org/copyright'}, 'stations': stations}
    out.mkdir(parents=True, exist_ok=True)
    (out / 'sydney-v1.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')
    (out / 'geometry-validation.json').write_text(json.dumps({'complete': True, 'sourceFuelFeaturesValidated': inspected, 'retainedByType': counts, 'missingGeometry': 0, 'bounds': BOUNDS}, indent=2) + '\n')

if __name__ == '__main__': main()
