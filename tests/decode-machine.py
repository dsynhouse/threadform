"""Independent format oracle. Requires pyembroidery==1.5.1, not app writers."""
import json, sys, os
if os.environ.get('THREADFORM_FORMAT_REFERENCE'):
    sys.path.insert(0, os.environ['THREADFORM_FORMAT_REFERENCE'])
import pyembroidery as embroidery
pattern = embroidery.read(sys.argv[1], settings={'clipping': False, 'trim_distance': None, 'trims': True})
print(json.dumps({'stitches': pattern.stitches, 'threads': [None if t is None else t.color & 0xffffff for t in pattern.threadlist]}))
