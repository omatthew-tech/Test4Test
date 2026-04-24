# Processes `public/branding/arm only.png` (flat near-white background, large
# canvas) into a clean overlay PNG that matches the sizing conventions used by
# the homepage mascot.
#
# Steps:
#   1. Chroma-key the near-white background (#F7F7F7 / #F8F8F8) to transparency
#      with anti-aliased alpha, recovering the foreground RGB on semi-transparent
#      pixels so edges stay crisp.
#   2. Trim the canvas to the opaque bounding box (with a small margin).
#   3. Resize the trimmed arm so its height matches the body mascot's arm band
#      height at the same rendered width, and place it on a canvas whose
#      aspect ratio lets the hand extend past the body into the start card.
#
# The output replaces `test4test-raspberry-arm-only-padded.png` which is what
# the HomePage currently loads.
#
# Usage: powershell -NoProfile -File scripts/process-arm-only.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$srcPath = (Resolve-Path 'public/branding/arm only.png').Path
$outRel = 'public/branding/test4test-raspberry-arm-only-padded.png'
$outAbs = Join-Path (Get-Location) $outRel

# Background colour (sampled). The source image's "white" ranges across several
# near-white values (#F7F7F7, #F8F8F8, #FEFEFE, ...) so we key out the whole
# low-chroma light range: anything with all channels >= $bgMin and with very
# low chroma is treated as background. Anti-aliasing is driven by distance to
# a representative background colour.
$bgR = 248; $bgG = 248; $bgB = 248
$bgSolid = 30
$bgEdge   = 110
$bgMin    = 225     # all of R,G,B must exceed this to be considered "near-white"
$bgChroma = 10      # max(R,G,B)-min(R,G,B) must be below this for low-chroma

$src = New-Object System.Drawing.Bitmap($srcPath)
$w = $src.Width
$h = $src.Height

$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$data = $src.LockBits($rect,
    [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$byteCount = $stride * $h
$buf = New-Object 'byte[]' $byteCount
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $byteCount)
$src.UnlockBits($data)
$src.Dispose()

# First pass: chroma-key the background and recover foreground RGB.
# In Format32bppArgb the in-memory byte order is B, G, R, A.
for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
        $i = $row + $x * 4
        $b = [int]$buf[$i]
        $g = [int]$buf[$i + 1]
        $r = [int]$buf[$i + 2]
        $dist = [math]::Abs($r - $bgR) + [math]::Abs($g - $bgG) + [math]::Abs($b - $bgB)
        $maxC = [math]::Max([math]::Max($r, $g), $b)
        $minC = [math]::Min([math]::Min($r, $g), $b)
        $chroma = $maxC - $minC
        $looksWhite = ($r -ge $bgMin -and $g -ge $bgMin -and $b -ge $bgMin -and $chroma -le $bgChroma)
        if ($looksWhite -or $dist -le $bgSolid) {
            $buf[$i]     = 0
            $buf[$i + 1] = 0
            $buf[$i + 2] = 0
            $buf[$i + 3] = 0
        }
        elseif ($dist -ge $bgEdge) {
            $buf[$i + 3] = 255
        }
        else {
            # Smooth anti-alias in the fringe and un-mix the background so the
            # recovered foreground colour isn't washed out toward white.
            $aFloat = ($dist - $bgSolid) / [double]($bgEdge - $bgSolid)
            if ($aFloat -lt 0.0) { $aFloat = 0.0 }
            if ($aFloat -gt 1.0) { $aFloat = 1.0 }
            $a = [int][math]::Round($aFloat * 255.0)
            if ($a -lt 1) {
                $buf[$i] = 0; $buf[$i + 1] = 0; $buf[$i + 2] = 0; $buf[$i + 3] = 0
            } else {
                $fr = [int][math]::Round(($r - (1 - $aFloat) * $bgR) / $aFloat)
                $fg = [int][math]::Round(($g - (1 - $aFloat) * $bgG) / $aFloat)
                $fb = [int][math]::Round(($b - (1 - $aFloat) * $bgB) / $aFloat)
                if ($fr -lt 0) {$fr = 0}; if ($fr -gt 255) {$fr = 255}
                if ($fg -lt 0) {$fg = 0}; if ($fg -gt 255) {$fg = 255}
                if ($fb -lt 0) {$fb = 0}; if ($fb -gt 255) {$fb = 255}
                $buf[$i]     = [byte]$fb
                $buf[$i + 1] = [byte]$fg
                $buf[$i + 2] = [byte]$fr
                $buf[$i + 3] = [byte]$a
            }
        }
    }
}

# Write the keyed buffer into a fresh bitmap so we can work with it further.
$keyed = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$kRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$kData = $keyed.LockBits($kRect,
    [System.Drawing.Imaging.ImageLockMode]::WriteOnly,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $kData.Scan0, $byteCount)
$keyed.UnlockBits($kData)

# Find the opaque bounding box (alpha > 8).
$minX = $w; $maxX = 0; $minY = $h; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
        if ($buf[$row + $x * 4 + 3] -gt 8) {
            if ($x -lt $minX) {$minX = $x}
            if ($x -gt $maxX) {$maxX = $x}
            if ($y -lt $minY) {$minY = $y}
            if ($y -gt $maxY) {$maxY = $y}
        }
    }
}
"Keyed content bbox: x=[$minX..$maxX] y=[$minY..$maxY] (canvas ${w}x${h})"

$contentW = $maxX - $minX + 1
$contentH = $maxY - $minY + 1

# Target render dimensions. The body mascot PNG is 364x607. The homepage CSS
# positions the arm at the same top-left as the body and scales its width
# relative to the body so the arm overlays the body's own arm band and the
# hand extends into the start card. We reproduce the previous canvas
# convention: arm canvas is 364 wide (so it aligns with the body) plus 80px
# of right-hand padding for the hand to reach past the body, height 607.
# Those dimensions let us keep the existing CSS calc(var(--mascot-width) * (444 / 364))
# without further tweaks.
$outCanvasW = 444
$outCanvasH = 607

# Place the arm at the same canvas coordinates the previous working arm asset
# used, so it aligns with the body mascot's built-in arm exactly the way the
# original overlay did. The original 364x607 arm artwork lived at x=57..361,
# y=277..378 (content 304x101 in body coordinates). The padded 444-wide
# canvas convention keeps the left side aligned with body and adds 80 px of
# right-hand padding for the hand to reach past the body.
$placeX = 57
$placeY = 277
$targetW = 304
$targetH = 101

"Placing arm ${targetW}x${targetH} at ($placeX, $placeY) on ${outCanvasW}x${outCanvasH} canvas"

# Build the output canvas (fully transparent) and draw the cropped, rescaled
# arm onto it.
$out = New-Object System.Drawing.Bitmap($outCanvasW, $outCanvasH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$og = [System.Drawing.Graphics]::FromImage($out)
$og.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$og.Clear([System.Drawing.Color]::Transparent)
$og.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
$og.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$og.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$og.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$og.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$destRect = New-Object System.Drawing.Rectangle($placeX, $placeY, $targetW, $targetH)
$srcCrop  = New-Object System.Drawing.Rectangle($minX, $minY, $contentW, $contentH)
$og.DrawImage($keyed, $destRect, $srcCrop, [System.Drawing.GraphicsUnit]::Pixel)
$og.Dispose()

$tmpPath = "$outAbs.tmp.png"
$out.Save($tmpPath, [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
$keyed.Dispose()
Move-Item -Path $tmpPath -Destination $outAbs -Force

"Processed arm saved to $outAbs"
