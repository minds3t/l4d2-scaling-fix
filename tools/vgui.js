// Values of the game's VGUI that more than one tool needs.

// Screen-height bands ("yres") the tools generate. Valve's own top band starts at 1200.
exports.BANDS = [
	[1440, 1599],
	[1600, 1799],
	[1800, 2159],
	[2160, 2879],
	[2880, 10000],
];

// vgui clamps a font to this height in pixels
exports.MAX_TALL = 127;
