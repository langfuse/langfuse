"""Sample pixel colors from a PNG (pure python, no PIL)."""
import sys, zlib, struct

def load_png(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos = 8
    idat = b''
    w = h = bitdepth = colortype = None
    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos:pos+4])
        ctype = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+length]
        if ctype == b'IHDR':
            w, h, bitdepth, colortype = struct.unpack('>IIBB', chunk[:10])
        elif ctype == b'IDAT':
            idat += chunk
        pos += 12 + length
    assert bitdepth == 8, f'bitdepth {bitdepth}'
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[colortype]
    raw = zlib.decompress(idat)
    stride = w * channels
    out = bytearray(h * stride)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        filt = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos+stride]); pos += stride
        if filt == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i-channels]) & 0xff
        elif filt == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xff
        elif filt == 3:
            for i in range(stride):
                a = line[i-channels] if i >= channels else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xff
        elif filt == 4:
            for i in range(stride):
                a = line[i-channels] if i >= channels else 0
                b = prev[i]
                c = prev[i-channels] if i >= channels else 0
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xff
        out[y*stride:(y+1)*stride] = line
        prev = line
    return w, h, channels, bytes(out)

def main():
    path = sys.argv[1]
    w, h, ch, buf = load_png(path)
    print(f'size {w}x{h} channels={ch}')
    # sample points given in "displayed" 2000-wide coords; scale to actual
    scale = w / 2000.0
    points = [
        ('sidebar bg',            150, 600),
        ('sidebar selected nav',  150, 253),
        ('sidebar top bar',       150, 25),
        ('content canvas',        600, 125),
        ('table header row',      600, 154),
        ('table row bg',          600, 230),
        ('vertical col divider',  723, 400),
        ('sidebar/content seam',  308, 600),
        ('row separator line',    600, 177),
        ('chip: Created by you',  470, 97),
        ('btn: New project',      1860, 50),
        ('badge: Sales fill',     940, 202),
        ('status text dot area',  749, 202),
        ('scrim right (Shared)',  1950, 300),
    ]
    for label, x, y in points:
        xa, ya = int(x*scale), int(y*scale)
        # average 3x3 to dodge antialiasing
        rs = gs = bs = n = 0
        for dx in (-1,0,1):
            for dy in (-1,0,1):
                i = ((ya+dy)*w + (xa+dx)) * ch
                rs += buf[i]; gs += buf[i+1]; bs += buf[i+2]; n += 1
        r, g, b = rs//n, gs//n, bs//n
        mx, mn = max(r,g,b), min(r,g,b)
        light = (mx+mn)/2/255*100
        print(f'{label:24s} #{r:02x}{g:02x}{b:02x}  HSL-L={light:.1f}%')

main()
