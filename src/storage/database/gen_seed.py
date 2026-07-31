"""Generate merged seed.ts — run with: python gen_seed.py"""
import os, re

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed.ts')

# ── helpers ──
def esc(s):
    """Escape single quotes for JS string."""
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")

def opts(arr):
    """Convert option array to JS object literal."""
    if not arr:
        return 'null'
    parts = []
    for i, o in enumerate(arr):
        m = re.match(r'^([A-E])[.。]\s*(.+)', o)
        if m:
            parts.append(f"{m.group(1)}: '{esc(m.group(2))}'")
        else:
            parts.append(f"{chr(65+i)}: '{esc(o)}'")
    return '{ ' + ', '.join(parts) + ' }'

def remap_kp(cid, old):
    """Remap original Supabase KP ID to current contiguous ID."""
    if cid == 1: return old
    if cid == 2:
        m = {11:11,12:12,13:15,14:16,15:17,16:13,17:18,18:19,
             19:20,20:21,21:22,22:23,23:24,24:25,25:26,26:27}
        return m.get(old, old)
    if cid == 3: return old - 3
    if cid == 4: return old - 9
    return old

def qtype(t):
    return 'multiple_choice' if t == 'multi_choice' else t
