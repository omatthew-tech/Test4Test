# Redraws the hand portion of the Test4Test arm sprite so the fingers have
# rounded, anti-aliased top/bottom edges instead of the hard horizontal cuts
# that exist in the source artwork.
#
# Strategy:
#   1. Load the original padded arm PNG.
#   2. In the hand region only, rebuild the alpha channel so edges fade smoothly
#      (2D tent/box filter feather on alpha only).
#   3. Keep RGB untouched so the existing shading/highlight stays intact.
#   4. Save the result in-place.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$srcRel = 'public/branding/test4test-raspberry-arm-only-padded.png'
$srcPath = (Resolve-Path $srcRel).Path

# Hand region (inclusive). From the alpha bounding-box scan:
#   - Arm artwork lives at y=277..378
#   - The "hand" (knuckles + pointing finger) is x~285..362
$handXStart = 285
$handXEnd   = 362
$handYStart = 277
$handYEnd   = 378

# Feather radius in pixels; larger = softer rounded edges.
$radius = 3

$src = New-Object System.Drawing.Bitmap($srcPath)
$w = $src.Width
$h = $src.Height

# Pull all pixels into a single byte[] buffer using LockBits for speed.
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$data = $src.LockBits($rect,
    [System.Drawing.Imaging.ImageLockMode]::ReadWrite,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

$stride = $data.Stride
$byteCount = $stride * $h
$buf = New-Object 'byte[]' $byteCount
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $byteCount)

# In Format32bppArgb, each pixel is 4 bytes in order B, G, R, A.
function Get-AlphaIdx([int]$x, [int]$y) { return ($y * $stride) + ($x * 4) + 3 }

# Copy alpha channel into a 2D array for random access.
$alpha = New-Object 'byte[,]' $w, $h
for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
        $alpha[$x, $y] = $buf[$row + $x * 4 + 3]
    }
}

# Vertical tent filter on alpha in the hand region.
$alpha1 = New-Object 'byte[,]' $w, $h
for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) { $alpha1[$x, $y] = $alpha[$x, $y] }
}
for ($x = $handXStart; $x -le $handXEnd; $x++) {
    for ($y = $handYStart; $y -le $handYEnd; $y++) {
        $sum = 0; $count = 0
        for ($dy = -$radius; $dy -le $radius; $dy++) {
            $yy = $y + $dy
            if ($yy -lt 0 -or $yy -ge $h) { continue }
            $weight = ($radius + 1) - [math]::Abs($dy)
            $sum += [int]$alpha[$x, $yy] * $weight
            $count += $weight
        }
        $alpha1[$x, $y] = [byte]([math]::Round($sum / $count))
    }
}

# Horizontal tent filter on the vertically smoothed buffer (2D feather) across
# the hand area so the fingertip rounds too.
$alpha2 = New-Object 'byte[,]' $w, $h
for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) { $alpha2[$x, $y] = $alpha1[$x, $y] }
}
for ($y = $handYStart; $y -le $handYEnd; $y++) {
    for ($x = $handXStart; $x -le $handXEnd; $x++) {
        $sum = 0; $count = 0
        for ($dx = -$radius; $dx -le $radius; $dx++) {
            $xx = $x + $dx
            if ($xx -lt 0 -or $xx -ge $w) { continue }
            $weight = ($radius + 1) - [math]::Abs($dx)
            $sum += [int]$alpha1[$xx, $y] * $weight
            $count += $weight
        }
        $alpha2[$x, $y] = [byte]([math]::Round($sum / $count))
    }
}

# Write smoothed alpha back into the buffer (RGB untouched).
for ($y = $handYStart - 2; $y -le $handYEnd + 2; $y++) {
    if ($y -lt 0 -or $y -ge $h) { continue }
    $row = $y * $stride
    for ($x = $handXStart - 2; $x -le $handXEnd + 2; $x++) {
        if ($x -lt 0 -or $x -ge $w) { continue }
        $buf[$row + $x * 4 + 3] = $alpha2[$x, $y]
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $data.Scan0, $byteCount)
$src.UnlockBits($data)

# GDI+ locks the source file while the bitmap is loaded, so we can't save back
# to the original path. Save to a sibling temp file, dispose the bitmap, then
# move the temp file over the original.
$tmpPath = "$srcPath.tmp.png"
$src.Save($tmpPath, [System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose()
Move-Item -Path $tmpPath -Destination $srcPath -Force

"Rounded hand written to $srcPath"
