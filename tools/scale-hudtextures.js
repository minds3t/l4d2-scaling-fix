// Points hud_textures.txt entries that use <texture> at <newTexture> and multiplies their
// x/y/width/height. HUD textures are drawn 1 texel = 1 screen pixel, so with a sheet that is
// upscaled by the same factor (upscale-vtf.js) the sprite is drawn that much larger.
//
// usage: node scale-hudtextures.js <in.txt> <out.txt> <texture> <newTexture> <factor>

const fs = require('fs');

const [inFile, outFile, texture, newTexture, factorArg] = process.argv.slice(2);
const factor = Math.round(Number(factorArg));
const src = fs.readFileSync(inFile, 'latin1');
const fileRe = new RegExp(`("file"\\s+")${texture.replace(/[/\\]/g, '[/\\\\]')}(")`, 'i');
const names = [];

// entries are flat blocks: "name" { "file" "..." "x" "..." ... }
const out = src.replace(/("[^"]+"\s*\{)([^{}]*)(\})/g, (all, head, body, tail) => {
	if (!fileRe.test(body)) return all;
	names.push(head.match(/"([^"]+)"/)[1]);
	body = body.replace(fileRe, `$1${newTexture}$2`)
		.replace(/("(?:x|y|width|height)"\s+")(\d+)(")/gi, (_, a, v, b) => a + Number(v) * factor + b);
	return head + body + tail;
});
fs.writeFileSync(outFile, out, 'latin1');
console.log(`${inFile}: ${names.length} entries -> ${newTexture} x${factor}: ${names.join(', ')}`);
