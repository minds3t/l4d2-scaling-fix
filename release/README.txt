UI Scaling Fix for Left 4 Dead 2
================================

Fixes the small text and tiny UI parts of Left 4 Dead 2 on 1440p, 4K (2160p)
and other high-resolution screens: chat, console, captions, server browser,
survival timer, option sliders and crosshairs. It works in every game mode,
including Versus.

Needs Windows and the game installed through Steam. Nothing else.


Install
-------

1. Close the game.
2. Double-click "Install.cmd".

The installer finds the game through Steam and reads the resolution the game
is set to. Start the game: the chat, the console and the server browser are
readable now.

Run "Install.cmd" again
- after a game update or after "Verify integrity of game files" in Steam:
  either can switch the fix off without a message;
- after you changed the game's resolution: the sliders, the crosshairs and
  the server browser are sized for one resolution. Text is right at every
  resolution.


Remove
------

Double-click "Uninstall.cmd" while the game is closed.

The crosshair thickness is saved by the game itself, so the uninstaller
leaves one line in left4dead2\cfg\autoexec.cfg that sets it back to the
game's default. Start the game once; after that the line can be deleted.


What the installer changes in the game folder
---------------------------------------------

1. It writes "Left 4 Dead 2\scaling_fix\pak01_dir.vpk".
2. It adds "Game scaling_fix" as the first search path in
   left4dead2\gameinfo.txt.
3. It replaces the server browser layouts in platform\servers. Valve's files
   are kept in scaling_fix\original\servers.
4. It sets cl_crosshair_thickness in left4dead2\cfg\autoexec.cfg.

The uninstaller undoes 1 to 3 and resets 4 as described above.


Options
-------

They can be added to both .cmd files, in a command prompt or in a shortcut:

  Install.cmd -Resolution 1440     screen height, when the game's own setting
                                   is not the one to use
  Install.cmd -Game "D:\Games\Left 4 Dead 2"
                                   the game folder, when it is not found


Limits
------

- Below 1440p there is nothing to fix and the installer says so.
- The files replace whole files of the game: the HUD layout, the list of HUD
  textures and the three font schemes. A HUD mod that brings its own copy of
  one of them conflicts with this.
- The files were made from one game version (the installer warns when yours
  is a different one). Should Valve change those files in an update, look for
  a newer release.


Source, details and license: https://github.com/minds3t/l4d2-scaling-fix
The license is in LICENSE.txt. Left 4 Dead 2 is a trademark of Valve
Corporation; this is an unofficial modification.
