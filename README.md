# UI Scaling Fix for Left 4 Dead 2

Fixes the small text and tiny UI parts of Left 4 Dead 2 on 1440p, 4K (2160p,
Ultra HD) and other high-resolution (HiDPI) screens.

Left 4 Dead 2 scales its HUD with the screen, but not everything else. Above
1200p the chat, the console, the captions and the server browser keep their
pixel size, so at 4K their text is half as large as at 1080p. A few parts are
drawn in raw pixels at every resolution: the option sliders, the melee and
infected crosshairs, the cooldown arc around the crosshair.

This project generates corrected copies of those UI files from the game's own
and mounts them through `gameinfo.txt`. It works in every game mode,
including Versus, in which the game switches addons off.

The release package needs nothing but Windows. The repository itself contains
no game files: `build.ps1` generates everything from the installed game.

## What it fixes

| Part | Stock at 4K (2160p) | With the fix |
| --- | --- | --- |
| Chat, console, closed captions, commentary | text keeps its 1200p pixel size | sized for 1440p, 1600p, 1800p, 2160p and 2880p |
| Server browser | tiny rows, 1080p-sized dialog | readable rows, dialog twice the size |
| Survival and scavenge timer | about a quarter too small (font size cap) | full size |
| Option sliders | thin bar, small marker | twice the size |
| Melee and infected crosshairs, cooldown arc | half size | twice the size |
| Weapon crosshair | thin lines | twice as thick |

Below 1440p nothing changes: the generated files keep Valve's values for
those resolutions.

## Status

Made with Left 4 Dead 2 **2.2.4.3** on Windows and used at 4K (3840x2160).

## Install

Requirements: Windows and the game installed through Steam.

1. Download the package from the
   [releases](https://github.com/minds3t/l4d2-scaling-fix/releases) and unpack
   it anywhere.
2. Close the game and run **`Install.cmd`**.

To remove the fix again, run **`Uninstall.cmd`**.

Run `Install.cmd` again after a game update or after "Verify integrity of
game files": either can restore `gameinfo.txt`, which switches the fix off
without a message. Run it again as well after changing the game's resolution.

The package holds one set of files for each resolution band (1440p, 1600p,
1800p, 2160p, 2880p), and the installer takes the one for the resolution the
game is set to. The sets were generated from game version 2.2.4.3; the
installer warns when the installed game is a different version.

| Option | Default | Meaning |
| --- | --- | --- |
| `-Resolution` | the height in the game's `video.txt` | screen height the game runs at, for example `2160`. It selects the set and with it the size of the parts drawn in raw pixels. Fonts need no setting: every set has all resolution bands |
| `-Game` | found through Steam | the `Left 4 Dead 2` folder; the environment variable `L4D2_DIR` does the same |

### What the installer changes in the game folder

1. It writes `Left 4 Dead 2\scaling_fix\pak01_dir.vpk` with the generated files.
2. It adds `Game scaling_fix` as the first search path in
   `left4dead2\gameinfo.txt`.
3. It replaces the server browser layouts in `platform\servers`. These exist
   only as loose files, so they cannot be overridden from the VPK. Valve's
   files are kept in `scaling_fix\original\servers`. The generated ones start
   with a comment line; a file without it is taken as a new one from Valve
   and is kept in its place.
4. It sets `cl_crosshair_thickness` in `left4dead2\cfg\autoexec.cfg`
   (4 at 2160p).

The uninstaller undoes the first three. The game saves the crosshair thickness
in its own configuration (and in Steam Cloud), so removing the line would not
set it back: the line is replaced by one that sets the game's default, 2.
Start the game once, then that line can be deleted.

## Why a search path and not an addon

Measured in the game with `-condebug` and `vgui_spew_fonts`. Each generated
scheme contains an unused font `_scaling_fix_marker`; if it is listed, the
game has read the generated file.

- **Addon VPK.** The game reads its scheme files at startup, before addons are
  mounted, so it uses Valve's. It reads them again only when the resolution
  really changes (`mat_setvideomode` with a different size). `ui_reloadscheme`,
  `hud_reloadscheme` and setting the same mode again do not do it, and a
  config file inside an addon cannot be run with `exec`, so an addon cannot
  cause the change itself: it would work only after a resolution switch on
  every start.
- **Game modes.** Valve's servers switch addons off in Versus and Scavenge
  (`cfg/addonconfig.cfg`). A search path is not an addon and stays mounted.
- **Loose files in `update\`.** The file system looks in every VPK before any
  loose file, so the copy in Valve's `pak01` wins.

A search path listed first in `gameinfo.txt` is mounted at startup and is
searched before all other VPKs.

## What is generated

Font sizes are chosen per screen-height band (`"yres"`). Valve's top band is
`1200 10000`, or the font has no band at all. Fonts without bands are scaled
by the engine where a panel asks for it, which is why the HUD looks right.
`tools/scale-schemes.js` leaves everything below 1440p untouched and adds
bands for 1440 / 1600 / 1800 / 2160 / 2880p, cloned from the entry that is
active at 1080p and scaled by `height / 1080`.

The parts drawn in raw pixels are multiplied by `resolution / 1080`.

| File | Affects |
| --- | --- |
| `resource/chatscheme.res` | chat (banded fonts only; unbanded ones like the scroll-arrow font are scaled by the chat box) |
| `resource/sourcescheme.res` | console, server browser, legacy VGUI dialogs. `Marlett`/`MarlettSmall` are not scaled: they draw symbols inside fixed-size buttons. It also adds `ListSmall`/`SmallFont`/`MarlettSmall`, which ServerBrowser.dll requests but no Valve scheme defines; without them the server rows fall back to a tiny font |
| `resource/clientscheme.res` | banded fonts only: closed captions, commentary. Also adds `PlayerName` (copy of `Default`, used by the L4D1 survivor titles in `ui/deathinfected.res`) and `ScoreboardVerySmall` (copy of `DefaultVerySmall`, the scoreboard's Spectators label). Valve's layouts use both, but no Valve scheme defines them |
| `platform/servers/*.res` | server browser layouts. They are fixed pixels, so they grow with the fonts |
| `resource/scaling_fix_stubble_bold_scaled*.vfont` + `SurvivalNumbers`/`HudNumbers` bands | vgui caps fonts at 127px, so the survival/scavenge timer (`SurvivalNumbers`, wants 171px at 2160p) is about 26% too small. `tools/unclamp-fonts.js` decodes `stubble-bold.vfont` (`tools/vfont.js`) and writes copies with a tighter line height (OS/2 win/typo metrics and hhea; VDMX dropped; renamed; checksums fixed; outlines untouched). They are encoded as .vfont again because the engine rejects plain TTF custom fonts ("Failed to parse custom font file"). The encoder reuses the original salt and reproduces the game's own file byte for byte. The copies draw the digits larger at the same 127px and are used only in bands where the cap applies. In a GDI render test the patched font at 127px drew the digits 103px high, the original at 171px 101px |
| `materials/sprites/crosshairs_scaled.vtf/.vmt` + `scripts/hud_textures.txt` | texture crosshairs (melee "+", infected crosshairs). HUD textures are drawn 1 texel = 1 screen pixel, so a nearest-neighbour copy of `sprites/crosshairs` is added and the 5 entries that use it point at the copy with scaled coordinates. The original sheet and the weapon scripts are untouched. The factor is rounded to a whole number |
| `scripts/hudlayout.res` | `HudCrosshair` `ability_size` (radius of the shove/ability cooldown arc, raw pixels) |
| `resource/ui/l4d360ui/slidercontrol.res` | bar and marker of the option sliders (raw pixels) |

The weapon crosshair is drawn in code and only its thickness can be set
(`cl_crosshair_thickness`, 1 to 5, default 2).

## Limits

- Windows only.
- The parts drawn in raw pixels are right for one resolution, the one the
  installer ran for. After changing the game's resolution, run it again.
  Fonts are right at every resolution.
- The release package has one set per resolution band, sized for the band's
  lowest resolution. At a resolution inside a band (1700p, say) the parts
  drawn in raw pixels are a little smaller than they could be; a build from
  the repository uses the exact resolution.
- `hudlayout.res`, `hud_textures.txt` and the three scheme files are replaced
  as whole files. A HUD mod that ships its own copy of one of them conflicts
  with this.
- A game update that changes one of these files needs files generated from
  the new ones: a newer release, or a build from the repository. Until then
  the game uses the copy generated from the old file.

## Building from the repository

Requirements: Windows, the game installed through Steam,
[Node.js](https://nodejs.org) and
[VPKEdit](https://github.com/craftablescience/VPKEdit) (its `vpkeditcli.exe`).

```powershell
npm install
powershell -ExecutionPolicy Bypass -File build.ps1 -Install     # generate for the game's resolution and install
powershell -ExecutionPolicy Bypass -File build.ps1 -Uninstall
powershell -ExecutionPolicy Bypass -File release.ps1            # dist\l4d2-scaling-fix-v<version> and its zip
npm test
```

`build.ps1` reads Valve's files from the installed game, so a build after a
game update contains Valve's changes. It takes `-Resolution` (one or several
screen heights, exact rather than per band) and `-Game` like the installer,
and `-VpkEdit` for the path to `vpkeditcli.exe` when it is neither on `PATH`
nor in `Program Files\VPKEdit`. Without `-Install` it only generates into
`build\`.

| Path | Contents |
| --- | --- |
| `build.ps1` | extracts Valve's files from the installed game and runs the tools: a VPK and the server browser layouts per resolution |
| `release.ps1` | generates the sets for all resolution bands and writes the release package into `dist\` |
| `release/` | files that go into the release package as they are: the two starters, `README.txt`, and in `files/` the installer (`install.ps1`, `common.ps1`), which `build.ps1 -Install` uses too |
| `tools/scale-schemes.js` | adds the resolution bands to a scheme file |
| `tools/unclamp-fonts.js`, `tools/vfont.js` | the font copies that get around the 127px cap; the .vfont decoder and encoder |
| `tools/upscale-vtf.js`, `tools/scale-hudtextures.js` | the crosshair sheet and its entries in `hud_textures.txt` |
| `tools/scale-layout.js`, `tools/scale-controls.js` | multiply pixel values in layout files: all of them, or those of named controls |
| `tools/vgui.js` | the resolution bands and the font size cap, shared by the tools |
| `tests/` | the .vfont encoder (against the game's own font when the game is installed) and the layout scaler |

`build\` and `dist\` are written by the scripts and are not part of the
repository: they hold Valve's files and the files derived from them.

## License

The source is public so that anyone can read and check it. It is not open
source: you may read it, build it for your own use and use the released
package, but not copy, redistribute or publish modified versions without
permission. The exact terms are in [LICENSE](LICENSE); open an issue to ask.

The build uses [opentype.js](https://github.com/opentypejs/opentype.js) (MIT),
installed by `npm install`. Left 4 Dead 2 is a trademark of Valve Corporation;
this is an unofficial modification.
