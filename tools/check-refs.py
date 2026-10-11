#!/usr/bin/env python3
"""Static consistency checks run on every build."""
import re, sys, glob

ok = True
def err(m):
    global ok
    ok = False
    print("  ✗ " + m)

parts = sorted(glob.glob('parts/*.js')) + ['parts/00-head.html']
src = {p: open(p, encoding='utf-8').read() for p in parts}
alljs = "\n".join(v for k, v in src.items() if k.endswith('.js'))
html = src['parts/00-head.html']

# 1. every UI.el.X must be registered in initUI and exist in the HTML
used = set(re.findall(r'UI\.el\.(\w+)', alljs))
declared = set(re.findall(r"'(\w+)'", re.search(r"const ids = \[(.*?)\];", src['parts/80-ui.js'], re.S).group(1)))
for k in sorted(used - declared):
    err('UI.el.%s is referenced but not registered in initUI()' % k)
for k in sorted(declared):
    if ('id="%s"' % k) not in html:
        err('UI.el.%s is registered but no element with that id exists in the HTML' % k)

# 2. every material key passed to B() must exist in MATDEFS
defs = set(re.findall(r'^\s{2}(\w+):\s*\{\s*rough', src['parts/30-world.js'], re.M))
for k in set(re.findall(r"\bB\(\s*'(\w+)'", src['parts/30-world.js'])) - defs:
    err("material '%s' used in geometry but not defined in MATDEFS" % k)

# 3. every dialogue 'next' target must exist
dlgs = set(re.findall(r'^  (\w+): \{$', src['parts/90-missions.js'], re.M))
for target in set(re.findall(r"next: '(\w+)'", src['parts/90-missions.js'])) - dlgs:
    err("dialogue option points at missing node '%s'" % target)
for start in set(re.findall(r"beginDialogue\('(\w+)'\)", alljs)) - dlgs:
    err("beginDialogue('%s') has no such dialogue node" % start)

# 4. campaign integrity
camp = re.findall(r'''\{ act: '([^']+)', actName: '[^']+', n: (\d+), title: (?:"([^"]+)"|'([^']+)'), status: '(\w+)' '''.strip(), src['parts/90-missions.js'])
nums = [int(n) for _, n, _t1, _t2, _s in camp]
if nums != list(range(1, 16)):
    err('campaign is not 15 sequential missions (got %s)' % nums)
if sum(1 for row in camp if row[-1] == 'playable') != 2:
    err('expected exactly 2 playable missions in the vertical slice')


# 5. every W.* / S.* property read must be defined somewhere in the codebase.
#    The renderer uses `st` for R.state, so S.* always means the game state.
def strip_nested(block):
    """Remove nested {...} groups so only top-level keys are seen."""
    out, depth = [], 0
    for ch in block:
        if ch == '{':
            depth += 1
            continue
        if ch == '}':
            depth -= 1
            continue
        if depth == 0:
            out.append(ch)
    return ''.join(out)

def literal_keys(obj_name):
    m = re.search(r'(?:const|let) %s = \{([\s\S]*?)\n\s*\};' % obj_name, alljs)
    if not m:
        return set()
    return set(re.findall(r'(\w+)\s*:', strip_nested(m.group(1))))

_js_files = [f for f in parts if f.endswith('.js')]
_ns_rules = [('W', _js_files), ('S', _js_files), ('st', _js_files), ('R', _js_files)]
for ns, files in _ns_rules:
    reads = set()
    for f in files:
        reads |= set(re.findall(r'\b%s\.(\w+)' % ns, src[f]))
    defined = literal_keys(ns)
    for f in files:
        defined |= set(re.findall(r'\b%s\.(\w+)\s*=[^=]' % ns, src[f]))
    # R.* handles are allocated imperatively in initRenderer
    defined |= {'prototype', 'length', 'gl', 'canvas', 'hdrOK', 'maxAniso', 'dprMax', 'progMain',
                'progDepth', 'progSky', 'progBright', 'progBlur', 'progComp', 'progPart', 'quadVAO',
                'meshBox', 'meshCyl', 'meshSphere', 'shadowSize', 'shadowTex', 'shadowFBO', 'dynBatches',
                'dyn', 'dynCyl', 'dyn2', 'dynMesh', 'dyn2Mesh', 'tmpM', 'tmpM2', 'mVP', 'mProj', 'mView',
                'mInvVP', 'mLightVP', 'mLightProj', 'mLightView', 'nm3', 'mTmp', 'mTmp2', 'lights', 'scene',
                'quality', 'frame', 'vw', 'vh', 'dpr', 'pw', 'ph', 'tScene', 'tResolve', 'tBloomA',
                'tBloomB', 'bloomW', 'bloomH', 'partData', 'partMax', 'partCount', 'partMesh', 'opaque',
                'trans', 'state', 'mIdentity', 'mIdentity3', 'mIdentityWorld', 'dynMat', 'dyn2Mat',
                'dyn2MeshMat', 'stats'}
    # st.* is R.state, created in initRendererWorld
    defined |= {'camPos', 'sunDir', 'sunColor', 'ambTop', 'ambBot', 'fogColor', 'fogDensity', 'time',
                'wet', 'exposure', 'skyTop', 'skyHorizon', 'groundColor', 'cloud', 'stars', 'flash',
                'grade', 'lights'} if ns == 'st' else defined
    for k in sorted(reads - defined):
        err('%s.%s is read but never defined (would be undefined -> NaN)' % (ns, k))

print('  ✓ static reference checks' if ok else '  ✗ static reference checks FAILED')
sys.exit(0 if ok else 1)
