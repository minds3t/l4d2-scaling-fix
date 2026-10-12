// Multiplies pixel values of selected controls in a VGUI .res layout.
// Used for values the L4D2 code applies in raw pixels (slider bar / marker, crosshair ability arc).
//
// usage: node scale-controls.js <in.res> <out.res> <factor> <Control>[:key1,key2]...
//   without a key list, xpos/ypos/wide/tall are scaled

const fs = require('fs');

const [inFile, outFile, factorArg, ...specs] = process.argv.slice(2);
const factor = Number(factorArg);
const src = fs.readFileSync(inFile, 'latin1');
const DEFAULT_KEYS = ['xpos', 'ypos', 'wide', 'tall'];

let out = src;
for (const spec of specs) {
	const [name, keyList] = spec.split(':');
	const keys = keyList ? keyList.split(',') : DEFAULT_KEYS;
	// block names may be quoted ("PrgValue") or bare (HudCrosshair)
	const head = new RegExp(`(^|\\n)[ \\t]*"?${name}"?\\s*\\{`, 'i').exec(out);
	if (!head) throw new Error(`${name} not found in ${inFile}`);
	const start = head.index + head[0].length;
	const end = out.indexOf('}', start);
	let n = 0;
	const body = out.slice(start, end).replace(
		new RegExp(`("(${keys.join('|')})"\\s+")(\\d+)(")`, 'gi'),
		(_, pre, key, v, post) => { n++; return pre + Math.round(Number(v) * factor) + post; }
	);
	if (!n) throw new Error(`${name}: none of ${keys.join(',')} found`);
	out = out.slice(0, start) + body + out.slice(end);
	console.log(`${name}: ${n} values scaled x${factor}`);
}
fs.writeFileSync(outFile, out, 'latin1');
