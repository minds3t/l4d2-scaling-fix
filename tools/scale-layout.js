// Multiplies every xpos/ypos/wide/tall in a VGUI .res layout by a factor.
// For non-proportional dialogs (server browser) whose layouts are fixed pixels:
// with larger fonts their buttons and tabs clip text unless the layout grows too.
// Keeps prefixes like "r10" (from right) or "c-50" (from center): only the number is scaled.
//
// usage: node scale-layout.js <in.res> <out.res> <factor> [marker]
//   marker  written as a comment in the first line, so that the installer can tell a
//           generated file from Valve's

const fs = require('fs');

const [inFile, outFile, factorArg, marker] = process.argv.slice(2);
const factor = Number(factorArg);
const src = fs.readFileSync(inFile, 'latin1');
let n = 0;
const out = src.replace(
	/("(?:xpos|ypos|wide|tall)"\s+")([rc]?)(-?\d+)(")/gi,
	(_, pre, anchor, v, post) => { n++; return pre + anchor + Math.round(Number(v) * factor) + post; }
);
const nl = src.includes('\r\n') ? '\r\n' : '\n';
fs.writeFileSync(outFile, (marker ? `// ${marker}${nl}` : '') + out, 'latin1');
console.log(`${inFile}: ${n} values scaled x${factor}`);
