<#
.SYNOPSIS
Installs the generated files into Left 4 Dead 2, or removes them again.

.DESCRIPTION
The files are in folders named after the screen height they were generated for, each with
a pak01_dir.vpk and the server browser layouts. The set for the game's resolution is put
into "Left 4 Dead 2\scaling_fix" and that folder is added as the first search path in
left4dead2\gameinfo.txt.

Why this route: scheme files are read at startup, before addon VPKs are mounted, and the
filesystem checks every VPK before any loose file, so neither an addon nor loose files in
update\ can override them. A search path listed first in gameinfo.txt is mounted at startup
and wins over all other VPKs.

.PARAMETER Uninstall
Remove everything the installer added and put Valve's server browser layouts back.

.PARAMETER Resolution
Screen height the game runs at, e.g. 2160. Default: the height in the game's video.txt.

.PARAMETER Game
The "Left 4 Dead 2" folder. Default: the L4D2_DIR environment variable, then Steam's libraries.

.PARAMETER Files
Folder with the generated files. Default: the folder this script is in.
#>
param(
	[switch]$Uninstall,
	[int]$Resolution,
	[string]$Game = $env:L4D2_DIR,
	[string]$Files = $PSScriptRoot
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "common.ps1")

if (-not $Game) { $Game = Find-Game }
$gameinfo = Join-Path $Game "left4dead2\gameinfo.txt"
if (-not (Test-Path $gameinfo)) { throw "$gameinfo not found - '$Game' is not a Left 4 Dead 2 folder" }
if (Get-Process left4dead2 -ErrorAction SilentlyContinue) { throw "close Left 4 Dead 2 first" }
$autoexec = Join-Path $Game "left4dead2\cfg\autoexec.cfg"
$latin1 = [Text.Encoding]::GetEncoding(28591) # reads and writes the user's other lines byte for byte

# Server browser layouts only exist as loose files in the PLATFORM path, so they are replaced
# in place. Valve's are kept in the game folder, next to the VPK
$serversDir = Join-Path $Game "platform\servers"
$serversBackup = Join-Path $Game "$modDir\original\servers"

function Remove-SearchPath {
	$text = [IO.File]::ReadAllText($gameinfo)
	$clean = $text -replace "(?m)^[ \t]+Game[ \t]+$modDir[ \t]*\r?\n", ""
	if ($clean -ne $text) { [IO.File]::WriteAllText($gameinfo, $clean) }
}

if ($Uninstall) {
	foreach ($f in Get-ChildItem "$serversDir\*.res") {
		# without the marker it is Valve's already: Steam has put it back
		if (-not (Test-Generated $f.FullName)) { continue }
		$original = Join-Path $serversBackup $f.Name
		if (Test-Path $original) { Copy-Item $original $f.FullName -Force }
		else { Write-Warning "no original of $($f.Name): Steam's 'Verify integrity of game files' puts it back" }
	}
	Remove-SearchPath
	Remove-Item -Recurse -Force (Join-Path $Game $modDir) -ErrorAction SilentlyContinue

	# cl_crosshair_thickness is saved in config.cfg and its Steam Cloud copy, so removing the
	# line would leave the value set: the line is replaced by one that sets the game's default
	$text = if (Test-Path $autoexec) { [IO.File]::ReadAllText($autoexec, $latin1) } else { "" }
	$reset = "cl_crosshair_thickness 2 // $name uninstalled: the game's default; delete this line after the next game start"
	$new = [regex]::Replace($text, "(?m)^.*$name.*?(?=\r?$)", $reset)
	if ($new -ne $text) {
		[IO.File]::WriteAllText($autoexec, $new, $latin1)
		Write-Host "crosshair thickness: $autoexec sets it back to 2 at the next game start; the line can be deleted after that"
	}
	Write-Host "uninstalled"
	return
}

if (-not $Resolution) { $Resolution = Get-GameResolution $Game }
if (-not $Resolution) { throw "the game has no saved resolution yet - pass the screen height, e.g. -Resolution 2160" }
if ($Resolution -lt 1440) { throw "${Resolution}p needs no fix: below 1440p the game's own sizes are right. For another screen height pass e.g. -Resolution 2160" }
# the set generated for the highest screen height that is not above the game's
$set = Get-ChildItem $Files -Directory | Where-Object { $_.Name -match '^\d+$' -and [int]$_.Name -le $Resolution } |
	Sort-Object { [int]$_.Name } | Select-Object -Last 1
if (-not $set) { throw "no files for ${Resolution}p in $Files" }
Write-Host "game: $Game"
Write-Host "resolution: ${Resolution}p, installing the files made for $($set.Name)p"

# The files replace whole files of the game, so they belong to the version they were made from
$manifest = Join-Path $Files "manifest.json"
$version = Get-GameVersion $Game
if ((Test-Path $manifest) -and $version) {
	$made = (Get-Content $manifest -Raw | ConvertFrom-Json).game
	if ($made -and $made -ne $version) {
		Write-Warning "these files were made from game version $made, the installed game is $version. If Valve changed the HUD or menu files since, that change is missing while the fix is installed: look for a newer release"
	}
}

$dir = Join-Path $Game $modDir
New-Item -ItemType Directory -Force $serversBackup | Out-Null
Copy-Item (Join-Path $set.FullName "pak01_dir.vpk") $dir -Force

Remove-SearchPath
$text = [IO.File]::ReadAllText($gameinfo)
$new = [regex]::Replace($text, "(?m)^([ \t]*SearchPaths[ \t]*\r?\n[ \t]*\{[ \t]*\r?\n)", { param($m) $m.Groups[1].Value + "`t`t`tGame`t`t`t`t$modDir`r`n" }, 1)
if ($new -eq $text) { throw "SearchPaths block not found in $gameinfo" }
[IO.File]::WriteAllText($gameinfo, $new)
Write-Host "installed $dir\pak01_dir.vpk and added '$modDir' as first search path"

foreach ($f in Get-ChildItem (Join-Path $set.FullName "servers\*.res")) {
	$target = Join-Path $serversDir $f.Name
	if (-not (Test-Path $target)) { continue }
	# Valve's file: keep it (again, if an update brought a new one) before it is replaced
	if (-not (Test-Generated $target)) { Copy-Item $target $serversBackup -Force }
	Copy-Item $f.FullName $target -Force
}
Write-Host "installed scaled server browser layouts to $serversDir"

# crosshair is drawn in code; only its thickness is exposed (1-5, default 2 = sized for 1080p).
# Replaces a line of ours that is already there, also the one -Uninstall leaves
$thickness = [Math]::Max(1, [Math]::Min(5, [int][Math]::Round(2 * $Resolution / 1080)))
$line = "cl_crosshair_thickness $thickness // ${name}: the default 2, scaled for ${Resolution}p"
$cur = if (Test-Path $autoexec) { [IO.File]::ReadAllText($autoexec, $latin1) } else { "" }
$kept = [regex]::Replace($cur, "(?m)^.*$name.*(\r?\n|$)", "")
$new = ($kept.TrimEnd() + "`r`n" + $line + "`r`n").TrimStart()
if ($new -ne $cur) {
	[IO.File]::WriteAllText($autoexec, $new, $latin1)
	Write-Host "set crosshair thickness $thickness in $autoexec"
}
Write-Host "installed"
