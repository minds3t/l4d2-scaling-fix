// Valve .vfont <-> TrueType. A vfont is the font XOR-chained with key[i] = cipher[i-1] + 0xA7,
// followed by a salt, the salt length byte and the magic "VFONT1".
const MAGIC = Buffer.from('VFONT1');
exports.decode = function (b) {
	if (!b.subarray(b.length - MAGIC.length).equals(MAGIC)) throw new Error('not a vfont');
	const saltLen = b[b.length - MAGIC.length - 1];
	const n = b.length - MAGIC.length - saltLen; // salt length includes the length byte itself
	const out = Buffer.alloc(n);
	out[0] = 0; // TrueType/OpenType files start with 0x00 (00 01 00 00)
	for (let i = 1; i < n; i++) out[i] = b[i] ^ ((b[i - 1] + 0xA7) & 0xFF);
	return out;
};

// Encodes a TrueType file as a vfont. The engine derives the first key byte from the salt, so
// the salt + trailer are reused from an existing vfont (`template`); its first cipher byte is
// that key, since every vfont'd TrueType file starts with 0x00.
exports.encode = function (ttf, template) {
	if (!template.subarray(template.length - MAGIC.length).equals(MAGIC)) throw new Error('template is not a vfont');
	if (ttf[0] !== 0) throw new Error('expected a TrueType file starting with 0x00');
	const saltLen = template[template.length - MAGIC.length - 1];
	const trailer = template.subarray(template.length - MAGIC.length - saltLen);
	const out = Buffer.alloc(ttf.length);
	out[0] = template[0] ^ ttf[0];
	for (let i = 1; i < ttf.length; i++) out[i] = ttf[i] ^ ((out[i - 1] + 0xA7) & 0xFF);
	return Buffer.concat([out, trailer]);
};
