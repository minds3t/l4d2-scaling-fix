// Generates hi-res aware copies of L4D2 VGUI scheme files.
//
// Source fonts pick a glyph set per sub-block, using the first block whose "yres"
// range matches the screen height. Valve's highest band is "1200 10000" (or the
// font has no band at all), so at 1440p/2160p text keeps its 1200p pixel size.
// Fonts without "yres" are additionally scaled when requested proportionally, which
// is why HUD fonts look fine but chat, console and server browser do not.
//
// This script leaves everything below MIN_YRES untouched and adds new bands above it,
// cloned from the block that is active at 1080p and scaled by (band height / 1080).
//
// usage: node scale-schemes.js <in.res> <out.res> [--banded-only] [--skip=Font1,Font2]
//   --banded-only  only touch fonts that already use "yres" bands (for clientscheme,
//                  whose unbanded fonts are scaled proportionally by the HUD)
//   --skip         fonts to leave alone, e.g. Marlett: its glyphs are drawn inside
//                  fixed-size buttons (scrollbar arrows, window close) and get clipped
//   --alias        New:Existing,... define fonts code requests but no scheme has, as copies

const fs = require('fs');
const { BANDS, MAX_TALL } = require('./vgui.js');

const REF_YRES = 1080;
const MIN_YRES = 1440;
const SCALED_KEYS = ['tall', 'blur'];

// ---- KeyValues tokenizer / parser that keeps source offsets ----

function tokenize(src) {
	const toks = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (/\s/.test(c)) { i++; continue; }
		if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
		if (c === '{' || c === '}') { toks.push({ t: c, start: i, end: i + 1 }); i++; continue; }
		if (c === '[') {
			const e = src.indexOf(']', i);
			toks.push({ t: 'cond', v: src.slice(i + 1, e), start: i, end: e + 1 });
			i = e + 1;
			continue;
		}
		if (c === '"') {
			let e = i + 1;
			while (e < src.length && src[e] !== '"') { if (src[e] === '\\') e++; e++; }
			toks.push({ t: 'str', v: src.slice(i + 1, e), start: i, end: e + 1, quoted: true });
			i = e + 1;
			continue;
		}
		let e = i;
		while (e < src.length && !/[\s{}"\[]/.test(src[e])) e++;
		toks.push({ t: 'str', v: src.slice(i, e), start: i, end: e });
		i = e;
	}
	return toks;
}

function parse(toks) {
	let p = 0;
	function block() {
		const out = [];
		while (p < toks.length && toks[p].t !== '}') {
			const k = toks[p++];
			const node = { key: k.v, start: k.start };
			if (toks[p] && toks[p].t === 'cond') node.keyCond = toks[p++].v;
			if (toks[p].t === '{') {
				node.open = toks[p].end;
				p++;
				node.children = block();
				node.end = toks[p].end; // '}'
				p++;
			} else {
				const v = toks[p++];
				node.value = v.v;
				node.valueTok = v;
				node.end = v.end;
			}
			if (toks[p] && toks[p].t === 'cond') { node.cond = toks[p].v; node.end = toks[p].end; p++; }
			out.push(node);
		}
		return out;
	}
	return block();
}

// ---- conditional evaluation for a Windows desktop client ----

const PLATFORM = { WIN32: true, WINDOWS: true, X360: false, X360WIDE: false, X360HIDEF: false, X360LODEF: false, OSX: false, LINUX: false, POSIX: false, DECK: false, PS3: false };

function isActive(cond) {
	if (!cond) return true;
	const expr = cond.replace(/\$(\w+)/g, (_, n) => String(PLATFORM[n.toUpperCase()] ?? false));
	return Function(`return (${expr});`)();
}

function getActive(children, key) {
	let val;
	for (const c of children) if (c.key.toLowerCase() === key && !c.children && isActive(c.cond)) val = c.value;
	return val;
}

function yresOf(sub) {
	const y = getActive(sub.children, 'yres');
	if (!y) return null;
	const [a, b] = y.trim().split(/\s+/).map(Number);
	return [a, b || a];
}

// ---- transform ----

// Adds fonts that code asks for but no scheme defines (e.g. the server browser's "ListSmall"),
// as copies of an existing font. Missing fonts fall back unpredictably to some tiny font.
function addAliases(src, aliases) {
	const root = parse(tokenize(src));
	const fonts = root.find(n => n.key.toLowerCase() === 'scheme').children.find(n => n.key.toLowerCase() === 'fonts' && n.children);
	let add = '';
	for (const [name, from] of aliases) {
		if (fonts.children.some(f => f.key.toLowerCase() === name.toLowerCase())) continue;
		const base = fonts.children.find(f => f.key.toLowerCase() === from.toLowerCase());
		if (!base) throw new Error(`alias source ${from} not found`);
		const body = src.slice(base.start, base.end).replace(/^"?[^"\s{]+"?/, `"${name}"`);
		add += lineIndent(src, base.start) + body + '\n';
		console.log(`  alias ${name} = copy of ${from}`);
	}
	return src.slice(0, fonts.end - 1) + add + src.slice(fonts.end - 1);
}

function transform(src, bandedOnly, skip) {
	const nl = src.includes('\r\n') ? '\r\n' : '\n';
	const root = parse(tokenize(src));
	const scheme = root.find(n => n.key.toLowerCase() === 'scheme');
	const fonts = scheme.children.find(n => n.key.toLowerCase() === 'fonts' && n.children);
	const edits = []; // {at, del, text}
	const report = [];

	for (const font of fonts.children) {
		if (!font.children) continue;
		const subs = font.children.filter(s => s.children && isActive(s.keyCond));
		if (!subs.length) continue;
		const banded = subs.some(s => yresOf(s));
		if (bandedOnly && !banded) continue;
		if (skip.includes(font.key.toLowerCase())) continue;

		// blocks that are in effect at 1080p (several can be active for different unicode ranges)
		const ref = subs.filter(s => { const y = yresOf(s); return !y || (y[0] <= REF_YRES && y[1] >= REF_YRES); });
		if (!ref.length) continue;
		// with bands, prefer the banded 1080p block(s) over unbanded fallbacks
		const refBanded = ref.filter(s => yresOf(s));
		const sources = banded && refBanded.length ? refBanded : ref;
		// bitmap / button-glyph fonts have no size to scale
		if (!sources.some(s => getActive(s.children, 'tall'))) continue;

		// clip existing bands so they stop below MIN_YRES
		for (const s of subs) {
			const y = yresOf(s);
			if (!y || y[1] < MIN_YRES) continue;
			for (const c of s.children) {
				if (c.key.toLowerCase() !== 'yres' || !isActive(c.cond)) continue;
				const nv = y[0] >= MIN_YRES ? '0 0' : `${y[0]} ${MIN_YRES - 1}`;
				edits.push({ at: c.valueTok.start, del: c.valueTok.end - c.valueTok.start, text: `"${nv}"` });
			}
		}

		// build new blocks
		const indent = lineIndent(src, sources[0].start);
		const inner = indent + '\t';
		let nextId = Math.max(0, ...font.children.map(s => parseInt(s.key, 10)).filter(n => !isNaN(n))) + 1;
		let text = '';
		const sizes = [];
		for (const [lo, hi] of BANDS) {
			const f = lo / REF_YRES;
			for (const s of sources) {
				text += `${indent}"${nextId++}"${nl}${indent}{${nl}`;
				for (const c of s.children) {
					if (c.children) continue;
					const k = c.key.toLowerCase();
					if (k === 'yres' || !isActive(c.cond)) continue;
					let v = c.value;
					if (SCALED_KEYS.includes(k) && /^\d+$/.test(v)) {
						v = String(Math.min(MAX_TALL, Math.round(Number(v) * f)));
						if (k === 'tall' && s === sources[0]) sizes.push(v);
					}
					text += `${inner}"${c.key}"\t\t"${v}"${nl}`;
				}
				text += `${inner}"yres"\t\t"${lo} ${hi}"${nl}${indent}}${nl}`;
			}
		}

		// banded fonts: append after the last band (unbanded fallbacks keep matching below MIN_YRES).
		// unbanded fonts: prepend, so the new bands win above MIN_YRES and the original
		// (proportionally scalable) block still applies below it.
		if (banded) {
			const last = subs.filter(s => yresOf(s)).pop();
			edits.push({ at: last.end, del: 0, text: nl + nl + text.replace(/\s+$/, '') });
		} else {
			edits.push({ at: font.open, del: 0, text: nl + text.replace(/\s+$/, '') + nl });
		}
		const base = getActive(sources[0].children, 'tall');
		report.push(`${font.key.padEnd(30)} 1080p:${String(base).padStart(3)}  ->  ${BANDS.map((b, i) => `${b[0]}:${sizes[i]}`).join(' ')}`);
	}

	// unused marker font: shows up in `vgui_spew_fonts` output when this file is the one loaded
	const ind = lineIndent(src, fonts.children[0].start);
	edits.push({ at: fonts.end - 1, del: 0, text: `${ind}"_scaling_fix_marker"${nl}${ind}{${nl}${ind}\t"1"${nl}${ind}\t{${nl}${ind}\t\t"name"\t\t"Tahoma"${nl}${ind}\t\t"tall"\t\t"11"${nl}${ind}\t}${nl}${ind}}${nl}\t` });

	edits.sort((a, b) => b.at - a.at);
	let out = src;
	for (const e of edits) out = out.slice(0, e.at) + e.text + out.slice(e.at + e.del);
	return { out, report };
}

function lineIndent(src, pos) {
	const ls = src.lastIndexOf('\n', pos - 1) + 1;
	return src.slice(ls, pos).match(/^[\t ]*/)[0];
}

// ---- main ----

const [inFile, outFile, ...flags] = process.argv.slice(2);
const listFlag = name => (flags.find(f => f.startsWith(`--${name}=`)) || '=').split('=')[1].split(',').filter(Boolean);
let src = fs.readFileSync(inFile, 'latin1');
src = addAliases(src, listFlag('alias').map(a => a.split(':')));
const { out, report } = transform(src, flags.includes('--banded-only'), listFlag('skip').map(s => s.toLowerCase()));
fs.writeFileSync(outFile, out, 'latin1');
// sanity check: result must parse and still have balanced braces
parse(tokenize(out));
console.log(`${inFile} -> ${outFile}: ${report.length} fonts`);
for (const r of report) console.log('  ' + r);
