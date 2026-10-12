// Nearest-neighbour upscales a VTF texture by an integer factor and writes it as an
// uncompressed BGRA8888 VTF 7.2 with a single mip level.
// Used for HUD sprite sheets: HUD textures are drawn 1 texel = 1 screen pixel, so a
// 2x sheet with doubled coordinates in hud_textures.txt draws the sprite at 2x size.
//
// usage: node upscale-vtf.js <in.vtf> <out.vtf> <factor>
// supports DXT1, DXT5 and BGRA8888 input (what L4D2's HUD sprites use)

const fs = require('fs');

const FMT_BGRA8888 = 12, FMT_DXT1 = 13, FMT_DXT5 = 15;

function decode(b) {
	const w = b.readUInt16LE(16), h = b.readUInt16LE(18);
	const flags = b.readUInt32LE(20);
	const fmt = b.readInt32LE(52), mips = b[56];
	const lowFmt = b.readInt32LE(57), lowW = b[61], lowH = b[62];
	const blocks = (W, H, bs) => Math.max(1, Math.ceil(W / 4)) * Math.max(1, Math.ceil(H / 4)) * bs;
	const mipBytes = (W, H) => fmt === FMT_BGRA8888 ? W * H * 4 : blocks(W, H, fmt === FMT_DXT1 ? 8 : 16);
	if (![FMT_BGRA8888, FMT_DXT1, FMT_DXT5].includes(fmt)) throw new Error(`unsupported VTF format ${fmt}`);

	// image data follows header + low-res thumbnail (7.2), or is located via the resource table (7.3+)
	let off = b.readUInt32LE(12);
	if (lowFmt === FMT_DXT1) off += blocks(lowW, lowH, 8);
	if (b.readUInt32LE(8) >= 3) {
		const n = b.readUInt32LE(68);
		for (let i = 0; i < n; i++) if (b[80 + i * 8] === 0x30) off = b.readUInt32LE(80 + i * 8 + 4);
	}
	// mips are stored smallest first; skip to the full-size one
	for (let m = mips - 1; m > 0; m--) off += mipBytes(Math.max(1, w >> m), Math.max(1, h >> m));

	const px = Buffer.alloc(w * h * 4); // RGBA
	if (fmt === FMT_BGRA8888) {
		for (let i = 0; i < w * h; i++) {
			px[i * 4] = b[off + i * 4 + 2]; px[i * 4 + 1] = b[off + i * 4 + 1];
			px[i * 4 + 2] = b[off + i * 4]; px[i * 4 + 3] = b[off + i * 4 + 3];
		}
		return { w, h, flags, px };
	}
	const bs = fmt === FMT_DXT1 ? 8 : 16;
	const rgb565 = v => [((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31];
	for (let by = 0; by < h / 4; by++) for (let bx = 0; bx < w / 4; bx++) {
		let p = off + (by * (w / 4) + bx) * bs;
		let alpha = null;
		if (fmt === FMT_DXT5) {
			const a0 = b[p], a1 = b[p + 1], a = [a0, a1];
			if (a0 > a1) for (let i = 1; i < 7; i++) a.push(((7 - i) * a0 + i * a1) / 7);
			else { for (let i = 1; i < 5; i++) a.push(((5 - i) * a0 + i * a1) / 5); a.push(0, 255); }
			let bits = 0n;
			for (let i = 0; i < 6; i++) bits |= BigInt(b[p + 2 + i]) << BigInt(8 * i);
			alpha = [];
			for (let i = 0; i < 16; i++) alpha.push(a[Number((bits >> BigInt(3 * i)) & 7n)]);
			p += 8;
		}
		const v0 = b.readUInt16LE(p), v1 = b.readUInt16LE(p + 2), c0 = rgb565(v0), c1 = rgb565(v1);
		const four = v0 > v1 || fmt === FMT_DXT5;
		const cs = [c0, c1,
			four ? c0.map((x, i) => (2 * x + c1[i]) / 3) : c0.map((x, i) => (x + c1[i]) / 2),
			four ? c0.map((x, i) => (x + 2 * c1[i]) / 3) : [0, 0, 0]];
		const idx = b.readUInt32LE(p + 4);
		for (let i = 0; i < 16; i++) {
			const ci = (idx >> (2 * i)) & 3, c = cs[ci];
			const o = ((by * 4 + (i >> 2)) * w + bx * 4 + (i & 3)) * 4;
			px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
			px[o + 3] = alpha ? alpha[i] : (!four && ci === 3 ? 0 : 255);
		}
	}
	return { w, h, flags, px };
}

function encode({ w, h, flags, px }) {
	const hdr = Buffer.alloc(80);
	hdr.write('VTF\0', 0, 'latin1');
	hdr.writeUInt32LE(7, 4); hdr.writeUInt32LE(2, 8); hdr.writeUInt32LE(80, 12);
	hdr.writeUInt16LE(w, 16); hdr.writeUInt16LE(h, 18);
	hdr.writeUInt32LE(flags | 0x100 | 0x200, 20); // + NOMIP | NOLOD: single level, drawn 1:1
	hdr.writeUInt16LE(1, 24); hdr.writeUInt16LE(0, 26); // frames, first frame
	hdr.writeFloatLE(1, 48); // bumpmap scale
	hdr.writeInt32LE(FMT_BGRA8888, 52);
	hdr[56] = 1; // mip count
	hdr.writeInt32LE(-1, 57); // no low-res thumbnail
	hdr.writeUInt16LE(1, 63); // depth
	const data = Buffer.alloc(w * h * 4);
	for (let i = 0; i < w * h; i++) {
		data[i * 4] = px[i * 4 + 2]; data[i * 4 + 1] = px[i * 4 + 1];
		data[i * 4 + 2] = px[i * 4]; data[i * 4 + 3] = px[i * 4 + 3];
	}
	return Buffer.concat([hdr, data]);
}

function upscale(img, f) {
	const W = img.w * f, H = img.h * f, px = Buffer.alloc(W * H * 4);
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
		img.px.copy(px, (y * W + x) * 4, ((Math.floor(y / f)) * img.w + Math.floor(x / f)) * 4, ((Math.floor(y / f)) * img.w + Math.floor(x / f)) * 4 + 4);
	return { w: W, h: H, flags: img.flags, px };
}

const [inFile, outFile, factorArg] = process.argv.slice(2);
const f = Math.round(Number(factorArg));
const img = decode(fs.readFileSync(inFile));
fs.writeFileSync(outFile, encode(upscale(img, f)));
console.log(`${inFile} ${img.w}x${img.h} -> ${outFile} ${img.w * f}x${img.h * f}`);
