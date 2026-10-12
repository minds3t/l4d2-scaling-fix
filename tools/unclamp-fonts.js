// Works around vgui's 127px font height cap for proportionally scaled HUD fonts.
//
// A HUD font with base size T is drawn at T * screenHeight / 480 px, but vgui clamps it to 127.
// SurvivalNumbers (38) wants 171px at 2160p and gets 126px. The engine limit can't be raised,
// but on Windows `tall` is the font's full line height (usWinAscent + usWinDescent). A copy of
// the font with a tighter line height (trimmed around the digits) renders its glyphs larger at
// the same 127px. Outlines are untouched; only vertical metrics and the family name change.
//
// For every resolution band where the font would be clamped, this adds a patched font file and
// a banded block using it at tall 127, placed before the original block. Below the cap the
// original (proportionally scaled) block still applies.
//
// usage: node unclamp-fonts.js <scheme.res> <outResourceDir> <font.vfont|ttf> Font1,Font2
//   <scheme.res> is edited in place (the generated clientscheme)

const fs = require('fs');
const path = require('path');
const vfont = require('./vfont.js');
const opentype = require('opentype.js');
const { BANDS, MAX_TALL: CAP } = require('./vgui.js');

const BASE_H = 480; // proportional HUD base height
const MIN_MARGIN = 0.15; // keep at least 15% of the original space above/below the digits
const GLYPHS = '0123456789:.'; // what the timers/counters draw

// ---- sfnt helpers ----

function readTables(buf) {
	const n = buf.readUInt16BE(4), tables = {};
	for (let i = 0; i < n; i++) {
		const e = 12 + i * 16, tag = buf.toString('latin1', e, e + 4);
		const off = buf.readUInt32BE(e + 8), len = buf.readUInt32BE(e + 12);
		tables[tag] = Buffer.from(buf.subarray(off, off + len));
	}
	return tables;
}

function checksum(b) {
	const p = Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)]);
	let s = 0;
	for (let i = 0; i < p.length; i += 4) s = (s + p.readUInt32BE(i)) >>> 0;
	return s;
}

function writeFont(tables) {
	const tags = Object.keys(tables).sort();
	const n = tags.length;
	let pow = 1, log = 0;
	while (pow * 2 <= n) { pow *= 2; log++; }
	const hdr = Buffer.alloc(12 + 16 * n);
	hdr.writeUInt32BE(0x00010000, 0);
	hdr.writeUInt16BE(n, 4); hdr.writeUInt16BE(pow * 16, 6); hdr.writeUInt16BE(log, 8); hdr.writeUInt16BE(n * 16 - pow * 16, 10);
	tables.head.writeUInt32BE(0, 8); // checkSumAdjustment, recomputed below
	const parts = [hdr];
	let off = hdr.length;
	tags.forEach((tag, i) => {
		const t = tables[tag], e = 12 + i * 16;
		hdr.write(tag, e, 'latin1');
		hdr.writeUInt32BE(checksum(t), e + 4); hdr.writeUInt32BE(off, e + 8); hdr.writeUInt32BE(t.length, e + 12);
		const padded = Buffer.concat([t, Buffer.alloc((4 - t.length % 4) % 4)]);
		parts.push(padded);
		off += padded.length;
	});
	const out = Buffer.concat(parts);
	const headOff = out.readUInt32BE(12 + tags.indexOf('head') * 16 + 8);
	out.writeUInt32BE((0xB1B0AFBA - checksum(out)) >>> 0, headOff + 8);
	return out;
}

// rebuilds the name table with family / full / unique / postscript names replaced
function renameFont(name, family, ps) {
	const count = name.readUInt16BE(2), strOff = name.readUInt16BE(4);
	const recs = [];
	for (let i = 0; i < count; i++) {
		const r = 6 + i * 12;
		const rec = { plat: name.readUInt16BE(r), enc: name.readUInt16BE(r + 2), lang: name.readUInt16BE(r + 4), id: name.readUInt16BE(r + 6) };
		const len = name.readUInt16BE(r + 8), o = name.readUInt16BE(r + 10);
		rec.data = name.subarray(strOff + o, strOff + o + len);
		const wide = rec.plat === 0 || rec.plat === 3;
		const text = { 1: family, 3: `${family};l4d2-scaling-fix`, 4: family, 6: ps, 16: family }[rec.id];
		if (text) rec.data = wide ? Buffer.from(text, 'utf16le').swap16() : Buffer.from(text, 'latin1');
		recs.push(rec);
	}
	const head = Buffer.alloc(6 + count * 12), strings = [];
	head.writeUInt16BE(0, 0); head.writeUInt16BE(count, 2); head.writeUInt16BE(6 + count * 12, 4);
	let o = 0;
	recs.forEach((rec, i) => {
		const r = 6 + i * 12;
		head.writeUInt16BE(rec.plat, r); head.writeUInt16BE(rec.enc, r + 2); head.writeUInt16BE(rec.lang, r + 4);
		head.writeUInt16BE(rec.id, r + 6); head.writeUInt16BE(rec.data.length, r + 8); head.writeUInt16BE(o, r + 10);
		strings.push(rec.data); o += rec.data.length;
	});
	return Buffer.concat([head, ...strings]);
}

// ---- font variant ----

function makeVariant(ttf, bounds, gain, family) {
	const t = readTables(ttf);
	const os2 = t['OS/2'], hhea = t.hhea;
	const asc = os2.readUInt16BE(74), desc = os2.readUInt16BE(76);
	const span = asc + desc, target = Math.round(span / gain);
	const mA = asc - bounds.top, mD = desc + bounds.bottom; // empty space above/below the digits
	const k = (target - (bounds.top - bounds.bottom)) / (mA + mD);
	if (k < MIN_MARGIN - 1e-9) throw new Error(`gain ${gain} too large for this font`);
	const newAsc = Math.round(bounds.top + mA * k), newDesc = target - newAsc;

	os2.writeUInt16BE(newAsc, 74); os2.writeUInt16BE(newDesc, 76);         // usWinAscent/Descent (GDI)
	os2.writeInt16BE(newAsc, 68); os2.writeInt16BE(-newDesc, 70); os2.writeInt16BE(0, 72); // sTypo*
	hhea.writeInt16BE(newAsc, 4); hhea.writeInt16BE(-newDesc, 6); hhea.writeInt16BE(0, 8);
	delete t.VDMX; // per-size vertical metrics for GDI; stale after the change
	t.name = renameFont(t.name, family, family.replace(/\s+/g, '-'));
	return { data: writeFont(t), asc: newAsc, desc: newDesc };
}

// ---- scheme editing ----

function findBlock(src, name, from = 0) {
	const re = new RegExp(`(^|\\n)[ \\t]*"?${name}"?[ \\t]*(\\[[^\\]]*\\])?\\s*\\{`, 'ig');
	re.lastIndex = from;
	const m = re.exec(src);
	if (!m) return null;
	const open = m.index + m[0].length;
	let d = 1, i = open;
	for (; i < src.length && d; i++) { if (src[i] === '{') d++; else if (src[i] === '}') d--; }
	return { start: m.index, open, end: i };
}

const [schemeFile, outDir, fontFile, fontList] = process.argv.slice(2);
let scheme = fs.readFileSync(schemeFile, 'latin1');
const raw = fs.readFileSync(fontFile);
const ttf = fontFile.toLowerCase().endsWith('.vfont') ? vfont.decode(raw) : raw;

// vertical bounds of the glyphs the counters use
const ot = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.length));
const bounds = { top: -Infinity, bottom: Infinity };
for (const ch of GLYPHS) {
	const bb = ot.charToGlyph(ch).getBoundingBox();
	bounds.top = Math.max(bounds.top, Math.ceil(bb.y2)); bounds.bottom = Math.min(bounds.bottom, Math.floor(bb.y1));
}
const os2 = ot.tables.os2;
const winSpan = os2.usWinAscent + os2.usWinDescent;
// rounded down so the integer metrics still keep MIN_MARGIN
const maxGain = Math.floor(100 * winSpan / ((bounds.top - bounds.bottom) + MIN_MARGIN * (winSpan - (bounds.top - bounds.bottom)))) / 100;
const baseFamily = ot.names.fontFamily.en;

const variants = new Map(); // gain -> family
const fontsDir = path.join(outDir);
fs.mkdirSync(fontsDir, { recursive: true });
const nl = scheme.includes('\r\n') ? '\r\n' : '\n';

for (const fontName of fontList.split(',')) {
	const fontsBlock = findBlock(scheme, 'Fonts');
	const blk = findBlock(scheme, fontName, fontsBlock.open);
	if (!blk || blk.start > fontsBlock.end) throw new Error(`${fontName} not found`);
	const body = scheme.slice(blk.open, blk.end - 1);
	const tall = Number(/"tall"\s+"(\d+)"/.exec(body)[1]);
	const face = /"name"\s+"([^"]+)"/.exec(body)[1];
	if (face.toLowerCase() !== baseFamily.toLowerCase()) throw new Error(`${fontName} uses ${face}, not ${baseFamily}`);
	if (/"yres"/.test(body)) throw new Error(`${fontName} already has yres bands`);
	const props = [...body.matchAll(/"(weight|additive|antialias|dropshadow|outline|blur|italic|underline)"\s+"([^"]+)"/gi)];

	let blocks = '', id = 100;
	const report = [];
	for (const [lo, hi] of BANDS) {
		const wanted = tall * lo / BASE_H;
		if (wanted <= CAP * 1.03) continue;
		const gain = Math.min(maxGain, Math.round(wanted / CAP * 100) / 100);
		const key = gain.toFixed(2);
		if (!variants.has(key)) {
			const family = `${baseFamily} scaled${key.replace('.', '')}`;
			const v = makeVariant(ttf, bounds, gain, family);
			// the engine only accepts custom fonts as .vfont ("Failed to parse custom font file" otherwise)
			if (!fontFile.toLowerCase().endsWith('.vfont')) throw new Error('need a .vfont source to encode the variants');
			const file = `scaling_fix_${family.replace(/\s+/g, '_').toLowerCase()}.vfont`;
			fs.writeFileSync(path.join(fontsDir, file), vfont.encode(v.data, raw));
			variants.set(key, { family, file });
			console.log(`  font ${file}: gain x${key} (win ${v.asc}/${v.desc})`);
		}
		const fam = variants.get(key).family;
		blocks += `${nl}\t\t\t"${id++}"${nl}\t\t\t{${nl}\t\t\t\t"name"\t\t"${fam}"${nl}\t\t\t\t"tall"\t\t"${CAP}"${nl}` +
			props.map(p => `\t\t\t\t"${p[1]}"\t\t"${p[2]}"${nl}`).join('') +
			`\t\t\t\t"yres"\t\t"${lo} ${hi}"${nl}\t\t\t}`;
		report.push(`${lo}p: wants ${Math.round(wanted)}px -> 127px x${key} = ${Math.round(CAP * gain)}px`);
	}
	if (!blocks) { console.log(`${fontName}: never clamped`); continue; }
	// new bands first: vgui uses the first matching block
	scheme = scheme.slice(0, blk.open) + blocks + scheme.slice(blk.open);
	console.log(`${fontName} (${tall}): ${report.join('; ')}`);
}

// register the font files
const cff = findBlock(scheme, 'CustomFontFiles');
const used = [...scheme.slice(cff.open, cff.end).matchAll(/"(\d+)"\s+"/g)].map(m => Number(m[1]));
let next = Math.max(0, ...used) + 1, add = '';
for (const { file } of variants.values()) add += `\t\t"${next++}"\t\t"resource/${file}"${nl}`;
scheme = scheme.slice(0, cff.end - 1) + add + '\t' + scheme.slice(cff.end - 1);
fs.writeFileSync(schemeFile, scheme, 'latin1');
