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

[StructLayout(LayoutKind.Sequential)]
public struct MOUSEINPUT {
  public int dx;
  public int dy;
  public uint mouseData;
  public uint dwFlags;
  public uint time;
  public IntPtr dwExtraInfo;
}

[StructLayout(LayoutKind.Explicit)]
public struct INPUT {
  [FieldOffset(0)] public uint type;
  [FieldOffset(8)] public MOUSEINPUT mi;
}

public class WinInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);

  public const uint INPUT_MOUSE = 0;
  public const uint MOUSEEVENTF_MOVE = 0x0001;
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;

  public static void SendMouse(uint flags, int dx = 0, int dy = 0) {
    INPUT[] inp = new INPUT[1];
    inp[0].type = INPUT_MOUSE;
    inp[0].mi.dx = dx;
    inp[0].mi.dy = dy;
    inp[0].mi.dwFlags = flags;
    SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
Add-Type -TypeDefinition $win32

function Focus-Roblox {
  $p = Get-Process -Name "RobloxPlayerBeta" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
    [WinInput]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 100
  }
}

function Do-Click($x, $y) {
  Focus-Roblox
  [WinInput]::SetCursorPos($x - 3, $y - 3) | Out-Null
  Start-Sleep -Milliseconds 35
  [WinInput]::SendMouse([WinInput]::MOUSEEVENTF_MOVE, 3, 3)
  [WinInput]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 120
  [WinInput]::SendMouse([WinInput]::MOUSEEVENTF_MOVE, 1, 0)
  Start-Sleep -Milliseconds 30
  [WinInput]::SendMouse([WinInput]::MOUSEEVENTF_LEFTDOWN, 0, 0)
  Start-Sleep -Milliseconds 120
  [WinInput]::SendMouse([WinInput]::MOUSEEVENTF_LEFTUP, 0, 0)
}

if ($Action -eq "get-cursor") {
  $p = [System.Windows.Forms.Cursor]::Position
  Write-Output ("{0},{1}" -f $p.X, $p.Y)
  exit 0
}

if ($Action -eq "wait-f8") {
  while (([WinInput]::GetAsyncKeyState(0x77) -band 0x8000) -ne 0) {
    Start-Sleep -Milliseconds 40
  }
  while (([WinInput]::GetAsyncKeyState(0x77) -band 0x8000) -eq 0) {
    Start-Sleep -Milliseconds 40
  }
  $p = [System.Windows.Forms.Cursor]::Position
  while (([WinInput]::GetAsyncKeyState(0x77) -band 0x8000) -ne 0) {
    Start-Sleep -Milliseconds 40
  }
  Write-Output ("{0},{1}" -f $p.X, $p.Y)
  exit 0
}

if ($Action -eq "click") {
  Do-Click $X1 $Y1
  exit 0
}

if ($Action -eq "type-text") {
  Do-Click $X1 $Y1
  Start-Sleep -Milliseconds 150
  [System.Windows.Forms.SendKeys]::SendWait("^a")
  Start-Sleep -Milliseconds 90
  [System.Windows.Forms.SendKeys]::SendWait($Text)
  exit 0
}

if ($Action -eq "check-green") {
  $left = [Math]::Min($X1, $X2)
  $top = [Math]::Min($Y1, $Y2)
  $width = [Math]::Max(10, [Math]::Abs($X2 - $X1))
  $height = [Math]::Max(10, [Math]::Abs($Y2 - $Y1))

  $bmp = New-Object System.Drawing.Bitmap($width, $height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($left, $top, 0, 0, $bmp.Size)
  $g.Dispose()

  $greenCount = 0
  for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
      $c = $bmp.GetPixel($x, $y)
      if ($c.G -gt 150 -and ($c.G - $c.R) -gt 35 -and ($c.G - $c.B) -gt 35) {
        $greenCount++
      }
    }
  }
  $bmp.Dispose()
  Write-Output $greenCount
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
