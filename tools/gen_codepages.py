#!/usr/bin/env python3
"""js/codepages.js dosyasını üretir (Windows-1254 ve DOS CP857 tabloları)."""
import os

def table(enc):
    out = []
    for b in range(128, 256):
        try:
            out.append(ord(bytes([b]).decode(enc)))
        except UnicodeDecodeError:
            out.append(0xFFFD)
    return out

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
js = "// Otomatik üretildi (Python codecs). Bayt 0x80–0xFF -> Unicode kod noktası.\n"
js += "// Yeniden üretmek için: python tools/gen_codepages.py\n"
for name in ("cp1254", "cp857"):
    js += f"export const {name.upper()} = [{','.join(str(x) for x in table(name))}];\n"
open(os.path.join(root, "js", "codepages.js"), "w").write(js)
print("js/codepages.js yazıldı")
