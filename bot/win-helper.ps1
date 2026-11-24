param(
  [Parameter(Mandatory=$true)][string]$Action,
  [int]$X1 = 0,
  [int]$Y1 = 0,
  [int]$X2 = 0,
  [int]$Y2 = 0,
  [string]$Text = ""
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$win32 = @"
using System;
using System.Runtime.InteropServices;
public class WinInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  public const uint LEFTDOWN = 0x02;
  public const uint LEFTUP = 0x04;
}
"@
Add-Type -TypeDefinition $win32

if ($Action -eq "get-cursor") {
  $p = [System.Windows.Forms.Cursor]::Position
  Write-Output ("{0},{1}" -f $p.X, $p.Y)
  exit 0
}

if ($Action -eq "click") {
  [WinInput]::SetCursorPos($X1, $Y1) | Out-Null
  Start-Sleep -Milliseconds 80
  [WinInput]::mouse_event([WinInput]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [WinInput]::mouse_event([WinInput]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
  exit 0
}

if ($Action -eq "type-text") {
  [WinInput]::SetCursorPos($X1, $Y1) | Out-Null
  Start-Sleep -Milliseconds 90
  [WinInput]::mouse_event([WinInput]::LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [WinInput]::mouse_event([WinInput]::LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.SendKeys]::SendWait("^a")
  Start-Sleep -Milliseconds 80
  [System.Windows.Forms.SendKeys]::SendWait($Text)
  exit 0
}

if ($Action -eq "ocr-rect") {
  $left = [Math]::Min($X1, $X2)
  $top = [Math]::Min($Y1, $Y2)
  $width = [Math]::Max(10, [Math]::Abs($X2 - $X1))
  $height = [Math]::Max(10, [Math]::Abs($Y2 - $Y1))

  $bmp = New-Object System.Drawing.Bitmap($width, $height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($left, $top, 0, 0, $bmp.Size)
  $g.Dispose()

  # Scale up 2x for much sharper Windows OCR on Roblox UI text
  $scaled = New-Object System.Drawing.Bitmap(($width * 2), ($height * 2))
  $gs = [System.Drawing.Graphics]::FromImage($scaled)
  $gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gs.DrawImage($bmp, 0, 0, ($width * 2), ($height * 2))
  $gs.Dispose()
  $bmp.Dispose()

  $tmpFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), ("pf99_ocr_" + [guid]::NewGuid().ToString() + ".png"))
  $scaled.Save($tmpFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $scaled.Dispose()

  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType=WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

    function Await-WinRT($op, $type) {
      $m = $asTaskGeneric.MakeGenericMethod($type)
      $task = $m.Invoke($null, @($op))
      $task.Wait()
      return $task.Result
    }

    $file = Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmpFile)) ([Windows.Storage.StorageFile])
    $stream = Await-WinRT ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $softBmp = Await-WinRT ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    $ocrRes = Await-WinRT ($engine.RecognizeAsync($softBmp)) ([Windows.Media.Ocr.OcrResult])
    $stream.Dispose()
    Write-Output ($ocrRes.Text -replace "`r|`n", " ").Trim()
  } finally {
    if (Test-Path $tmpFile) { Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue }
  }
  exit 0
}
