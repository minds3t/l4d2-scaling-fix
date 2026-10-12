<#
.SYNOPSIS
Generates UI files for Left 4 Dead 2 that are sized for 1440p to 2880p.

.DESCRIPTION
Regenerates the scaled UI files from the installed game's current originals into
.\build\files\<resolution>: a pak01_dir.vpk and the server browser layouts, as
release\files\install.ps1 installs them. With -Install it runs that installer on them.

.PARAMETER Install
Install after generating. The game must be closed.

.PARAMETER Uninstall
Remove what the installer added.

.PARAMETER Resolution
Screen heights to generate for, e.g. 2160 or 1440,2160. Default: the height in the game's
video.txt. Sizes the parts the game draws in raw pixels (slider bar, texture crosshairs,
cooldown arc, server browser layouts). Fonts are generated for every resolution.

.PARAMETER Game
The "Left 4 Dead 2" folder. Default: the L4D2_DIR environment variable, then Steam's libraries.

.PARAMETER VpkEdit
Path to vpkeditcli.exe. Default: the one on PATH, then "Program Files\VPKEdit".

.EXAMPLE
.\build.ps1 -Install
#>
param(
	[switch]$Install,
	[switch]$Uninstall,
	[int[]]$Resolution,
	[string]$Game = $env:L4D2_DIR,
	[string]$VpkEdit
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
. (Join-Path $root "release\files\common.ps1")
$installer = Join-Path $root "release\files\install.ps1"

function Find-VpkEdit {
	$cmd = Get-Command vpkeditcli -ErrorAction SilentlyContinue
	if ($cmd) { return $cmd.Source }
	$default = Join-Path $env:ProgramFiles "VPKEdit\vpkeditcli.exe"
	if (Test-Path $default) { return $default }
	throw "vpkeditcli.exe not found - install VPKEdit (https://github.com/craftablescience/VPKEdit) or pass its path with -VpkEdit"
}

if (-not $Game) { $Game = Find-Game }
if ($Uninstall) {
	& $installer -Uninstall -Game $Game
	return
}

if (-not (Test-Path (Join-Path $Game "left4dead2\gameinfo.txt"))) { throw "'$Game' is not a Left 4 Dead 2 folder" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js not found - install it from https://nodejs.org" }
if (-not (Test-Path (Join-Path $root "node_modules\opentype.js"))) { throw "opentype.js is missing - run 'npm install' in $root" }
if (-not $VpkEdit) { $VpkEdit = Find-VpkEdit }
if (-not $Resolution) { $Resolution = @(Get-GameResolution $Game) }
if (-not $Resolution[0]) { throw "the game has no saved resolution yet - pass the screen height, e.g. -Resolution 2160" }
foreach ($r in $Resolution) {
	if ($r -lt 1440) { throw "${r}p needs no fix: below 1440p the game's own sizes are right. For another screen height pass e.g. -Resolution 2160" }
}
Write-Host "game: $Game"

# 1. pull the original files (update > dlc3 > dlc2 > dlc1 > base, same order as gameinfo.txt)
$build = Join-Path $root "build"
$orig = Join-Path $build "original"
$tmp = Join-Path $build "extract"
$sources = @("resource/chatscheme.res", "resource/sourcescheme.res", "resource/clientscheme.res", "resource/ui/l4d360ui/slidercontrol.res",
	"scripts/hud_textures.txt", "scripts/hudlayout.res", "materials/sprites/crosshairs.vtf", "materials/sprites/crosshairs.vmt")
Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $orig | Out-Null
foreach ($f in $sources) {
	$leaf = Split-Path $f -Leaf
	foreach ($dir in "update", "left4dead2_dlc3", "left4dead2_dlc2", "left4dead2_dlc1", "left4dead2") {
		Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
		New-Item -ItemType Directory -Force $tmp | Out-Null
		# vpkeditcli prints to stderr when the file isn't in this VPK; that's expected here
		$ErrorActionPreference = "Continue"
		& $VpkEdit --no-progress --extract $f -o (Join-Path $tmp $leaf) (Join-Path $Game "$dir\pak01_dir.vpk") 2>&1 | Out-Null
		$ErrorActionPreference = "Stop"
		$hit = Get-ChildItem $tmp -Recurse -File -Filter $leaf | Select-Object -First 1
		if ($hit) { Copy-Item $hit.FullName (Join-Path $orig $leaf) -Force; Write-Host "$f <- $dir"; break }
	}
	if (-not (Test-Path (Join-Path $orig $leaf))) { throw "could not extract $f" }
}
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

# Valve's server browser layouts. A file with the marker in the game is ours from an earlier
# install, and Valve's is in the installer's backup
$serversDir = Join-Path $Game "platform\servers"
$serversBackup = Join-Path $Game "$modDir\original\servers"
$servers = foreach ($f in Get-ChildItem "$serversDir\*.res") {
	if (-not (Test-Generated $f.FullName)) { $f.FullName; continue }
	$original = Join-Path $serversBackup $f.Name
	if (-not (Test-Path $original)) { throw "$($f.FullName) is a generated file and Valve's original is gone - run Steam's 'Verify integrity of game files', then this again" }
	$original
}

# 2. generate, per resolution: the files of the VPK into .\build\game, mirroring game paths,
#    then the VPK and the server browser layouts into .\build\files
$files = Join-Path $build "files"
foreach ($r in $Resolution) {
	# the parts drawn in raw pixels have the right size at 1080p
	$scale = [Math]::Round($r / 1080, 4).ToString([cultureinfo]::InvariantCulture)
	Write-Host "--- ${r}p: parts drawn in raw pixels x$scale"
	$out = Join-Path $build "game\$r"
	$res = Join-Path $out "resource"
	$ui = Join-Path $res "ui\l4d360ui"
	New-Item -ItemType Directory -Force $ui | Out-Null
	node "$root\tools\scale-schemes.js" "$orig\chatscheme.res" "$res\chatscheme.res" --banded-only
	node "$root\tools\scale-schemes.js" "$orig\sourcescheme.res" "$res\sourcescheme.res" --skip=Marlett,MarlettSmall --alias=ListSmall:DefaultSmall,SmallFont:DefaultSmall,MarlettSmall:Marlett
	node "$root\tools\scale-schemes.js" "$orig\clientscheme.res" "$res\clientscheme.res" --banded-only --alias=PlayerName:Default,ScoreboardVerySmall:DefaultVerySmall
	node "$root\tools\scale-controls.js" "$orig\slidercontrol.res" "$ui\slidercontrol.res" $scale PrgValue PnlDefaultMark
	if ($LASTEXITCODE) { throw "generator failed" }

	# vgui caps fonts at 127px: SurvivalNumbers (survival/scavenge timer) wants 171px at 2160p.
	# Adds Stubble Bold copies with a tighter line height, used only in bands where the cap applies
	# (the font is a loose file in left4dead2\resource, so it's read directly)
	node "$root\tools\unclamp-fonts.js" "$res\clientscheme.res" $res (Join-Path $Game "left4dead2\resource\stubble-bold.vfont") SurvivalNumbers,HudNumbers
	if ($LASTEXITCODE) { throw "unclamp-fonts failed" }

	# texture crosshairs (melee, infected) are drawn 1 texel = 1 pixel: add an upscaled copy of the
	# sheet and point hud_textures.txt at it with scaled coordinates (the original sheet is untouched)
	$scripts = Join-Path $out "scripts"
	$sprites = Join-Path $out "materials\sprites"
	New-Item -ItemType Directory -Force $scripts, $sprites | Out-Null
	node "$root\tools\upscale-vtf.js" "$orig\crosshairs.vtf" "$sprites\crosshairs_scaled.vtf" $scale
	(Get-Content "$orig\crosshairs.vmt" -Raw) -replace '"sprites/crosshairs"', '"sprites/crosshairs_scaled"' | Set-Content "$sprites\crosshairs_scaled.vmt" -NoNewline -Encoding ascii
	node "$root\tools\scale-hudtextures.js" "$orig\hud_textures.txt" "$scripts\hud_textures.txt" sprites/crosshairs sprites/crosshairs_scaled $scale
	# shove/ability cooldown arc around the crosshair: radius in raw pixels
	node "$root\tools\scale-controls.js" "$orig\hudlayout.res" "$scripts\hudlayout.res" $scale HudCrosshair:ability_size
	if ($LASTEXITCODE) { throw "generator failed" }

	$set = Join-Path $files "$r"
	$serversOut = Join-Path $set "servers"
	New-Item -ItemType Directory -Force $serversOut | Out-Null
	foreach ($f in $servers) {
		node "$root\tools\scale-layout.js" $f (Join-Path $serversOut (Split-Path $f -Leaf)) $scale $marker | Out-Null
		if ($LASTEXITCODE) { throw "layout scaling failed for $f" }
	}
	# single-file VPK v1 (data inline in the _dir file), same format as L4D2 addons
	$vpk = Join-Path $set "pak01_dir.vpk"
	& $VpkEdit --no-progress -v 1 --single-file -o $vpk $out | Out-Null
	if (-not (Test-Path $vpk)) { throw "packing failed" }
}
# the installer warns when the game is not the version the files were made from
$version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
@{ version = $version; game = (Get-GameVersion $Game) } | ConvertTo-Json | Set-Content (Join-Path $files "manifest.json") -Encoding ascii
Write-Host "generated $files"

# 3. install
if ($Install) {
	$options = @{ Game = $Game; Files = $files }
	if ($Resolution.Count -eq 1) { $options.Resolution = $Resolution[0] }
	& $installer @options
}
