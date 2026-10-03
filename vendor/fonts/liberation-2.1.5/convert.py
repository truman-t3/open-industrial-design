"""Optional reproduction: Python + fonttools==4.60.1 + brotli==1.1.0.
Normal application builds use the checked-in WOFF2 and require no Python.
"""
from pathlib import Path
from hashlib import sha256
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData

root = Path(__file__).parent
original = root / 'LiberationSans-Regular.ttf'
assert sha256(original.read_bytes()).hexdigest() == 'bade59d822652f76e6941aa87b40a87c13d1cc70db98ededb5011127efafd1d3'
font = TTFont(original, recalcTimestamp=False)
font.flavor = 'woff2'
font.flavorData = WOFF2FlavorData(transformedTables=set())
output = root / 'LiberationSans-Regular.woff2'
font.save(output)
assert sha256(output.read_bytes()).hexdigest() == 'e94ff0707a83eb23de656105c5dd0f1cb1fb65e025b7cc08ca7a8854cd0f6041'
source = TTFont(original, lazy=True)
converted = TTFont(output, lazy=True)
assert set(source.reader.keys()) == set(converted.reader.keys())
for tag in source.reader.keys():
    a, b = source.reader[tag], converted.reader[tag]
    if tag == 'head':
        # Checksum adjustment and required WOFF2 compression flag only.
        a, b = a[:8] + b'\0'*4 + a[12:], b[:8] + b'\0'*4 + b[12:]
        a = a[:16] + (int.from_bytes(a[16:18], 'big') & ~0x800).to_bytes(2, 'big') + a[18:]
        b = b[:16] + (int.from_bytes(b[16:18], 'big') & ~0x800).to_bytes(2, 'big') + b[18:]
    assert a == b, tag
print('Verified: full glyphs, names, outlines, metrics and license tables preserved.')
