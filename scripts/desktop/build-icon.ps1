# SPDX-License-Identifier: MPL-2.0
param([switch]$Check)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$source = Join-Path $repo 'brand/icon/open-industrial-design-icon-1024.png'
$output = Join-Path $repo 'apps/desktop/src-tauri/icons/icon.ico'
$original = [Drawing.Bitmap]::new($source)
$frames = @()
try {
  $left = $original.Width; $top = $original.Height; $right = -1; $bottom = -1
  for ($y = 0; $y -lt $original.Height; $y++) {
    for ($x = 0; $x -lt $original.Width; $x++) {
      if ($original.GetPixel($x, $y).A -gt 32) {
        $left = [Math]::Min($left, $x); $top = [Math]::Min($top, $y)
        $right = [Math]::Max($right, $x); $bottom = [Math]::Max($bottom, $y)
      }
    }
  }
  if ($right -lt $left) { throw 'Source contains no visible pixels' }
  # Preserve antialiased edges. Only the Windows derivative is reframed;
  # the original artwork, colors, proportions and brand files stay unchanged.
  $left = [Math]::Max(0, $left - 2); $top = [Math]::Max(0, $top - 2)
  $right = [Math]::Min($original.Width - 1, $right + 2)
  $bottom = [Math]::Min($original.Height - 1, $bottom + 2)
  $crop = [Drawing.Rectangle]::new($left, $top, $right-$left+1, $bottom-$top+1)
  # Include 125%, 150%, 200% and 300% small-icon sizes without upscaling.
  foreach ($size in @(16,20,24,32,40,48,64,96,128,256)) {
    $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $stream = [IO.MemoryStream]::new()
    try {
      $graphics.Clear([Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      # Desktop tile gives the narrow transparent mark a stable visual mass.
      # Keep a clear outer pixel; use the original artwork without recoloring.
      $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $inset = [Math]::Max(1, [Math]::Round($size * 0.035))
      $side = $size - 2 * $inset
      $diameter = [single]($side * 0.40)
      $tile = [Drawing.Drawing2D.GraphicsPath]::new()
      $brush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(255,240,243,255))
      try {
        $tile.AddArc($inset,$inset,$diameter,$diameter,180,90)
        $tile.AddArc($inset+$side-$diameter,$inset,$diameter,$diameter,270,90)
        $tile.AddArc($inset+$side-$diameter,$inset+$side-$diameter,$diameter,$diameter,0,90)
        $tile.AddArc($inset,$inset+$side-$diameter,$diameter,$diameter,90,90)
        $tile.CloseFigure()
        $graphics.FillPath($brush,$tile)
      } finally { $brush.Dispose(); $tile.Dispose() }
      $extent = [Math]::Round($size * 0.76)
      $scale = $extent / [Math]::Max($crop.Width, $crop.Height)
      $w = [int][Math]::Round($crop.Width * $scale); $h = [int][Math]::Round($crop.Height * $scale)
      $dest = [Drawing.Rectangle]::new([int][Math]::Floor(($size-$w)/2), [int][Math]::Floor(($size-$h)/2), $w, $h)
      $graphics.DrawImage($original, $dest, $crop, [Drawing.GraphicsUnit]::Pixel)
      $visibleLeft = $size; $visibleTop = $size; $visibleRight = -1; $visibleBottom = -1
      for ($py = 0; $py -lt $size; $py++) {
        for ($px = 0; $px -lt $size; $px++) {
          if ($bitmap.GetPixel($px, $py).A -gt 32) {
            $visibleLeft = [Math]::Min($visibleLeft, $px); $visibleTop = [Math]::Min($visibleTop, $py)
            $visibleRight = [Math]::Max($visibleRight, $px); $visibleBottom = [Math]::Max($visibleBottom, $py)
          }
        }
      }
      if ($visibleLeft -le 0 -or $visibleTop -le 0 -or $visibleRight -ge $size-1 -or $visibleBottom -ge $size-1) {
        throw "Visible artwork touches the $size-pixel frame edge"
      }
      $visibleExtent = [Math]::Max($visibleRight-$visibleLeft+1, $visibleBottom-$visibleTop+1)
      if ($visibleExtent -lt [Math]::Min($size-2, [Math]::Floor($size*0.91))) {
        throw "Too much transparent padding in the $size-pixel frame"
      }
      $opaquePixels = 0
      for ($py = 0; $py -lt $size; $py++) {
        for ($px = 0; $px -lt $size; $px++) {
          if ($bitmap.GetPixel($px,$py).A -gt 224) { $opaquePixels++ }
        }
      }
      if ($opaquePixels / ($size*$size) -lt 0.65) { throw "Desktop tile lacks visual mass at $size px" }
      $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
      $frames += [pscustomobject]@{ Size=$size; Bytes=$stream.ToArray() }
    } finally { $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $original.Dispose() }
$result = [IO.MemoryStream]::new()
$writer = [IO.BinaryWriter]::new($result)
try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
  $offset = 6 + 16 * $frames.Count
  foreach ($frame in $frames) {
    $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset)
    $offset += $frame.Bytes.Length
  }
  foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
  $writer.Flush()
  $bytes = $result.ToArray()
  if ($Check) {
    $actual = [IO.File]::ReadAllBytes($output)
    if ([Convert]::ToBase64String($actual) -cne [Convert]::ToBase64String($bytes)) {
      throw 'Windows icon differs from its source/build recipe. Run scripts/desktop/build-icon.ps1 on Windows.'
    }
    Write-Output 'PASS: all Windows icon frames match the unchanged original artwork and framing recipe.'
  } else {
    [IO.File]::WriteAllBytes($output, $bytes)
    Write-Output "Built $($frames.Count) Windows icon sizes; original artwork unchanged."
  }
} finally { $writer.Dispose(); $result.Dispose() }
