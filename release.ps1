<#
.SYNOPSIS
Writes the release package: dist\l4d2-scaling-fix-v<version> and the same folder as a zip.

.DESCRIPTION
The package needs nothing but Windows on the player's PC: it holds the generated files for
every resolution band and the installer from release\. The files are generated from the
game installed here, so the package belongs to that game version. The version of the
package is the one in package.json.
#>
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$name = "l4d2-scaling-fix-v$version"
$stage = Join-Path $root "dist\$name"
$zip = "$stage.zip"

# one set per band of tools\vgui.js, sized for the band's lowest screen height
& (Join-Path $root "build.ps1") -Resolution 1440, 1600, 1800, 2160, 2880

Remove-Item -Recurse -Force $stage, $zip -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item -Recurse (Join-Path $root "release\*") $stage
Copy-Item -Recurse (Join-Path $root "build\files\*") (Join-Path $stage "files")
# Get-Content and Set-Content turn the line ends into Windows ones
Get-Content (Join-Path $root "LICENSE") | Set-Content (Join-Path $stage "LICENSE.txt") -Encoding ascii

# entry names are written with forward slashes, which the .NET of Windows PowerShell does not do by itself
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($zip, "Create")
try {
	foreach ($f in Get-ChildItem $stage -Recurse -File) {
		$entry = "$name/" + $f.FullName.Substring($stage.Length + 1).Replace('\', '/')
		[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $entry, "Optimal")
	}
} finally {
	$archive.Dispose()
}
Write-Host "wrote $zip ($([Math]::Round((Get-Item $zip).Length / 1KB)) KB)"
