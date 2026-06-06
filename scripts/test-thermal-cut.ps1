param(
  [string]$PrinterName,
  [ValidateSet('Partial', 'Full')]
  [string]$Cut = 'Partial',
  [switch]$ListPrinters,
  [switch]$NoText
)

if ($ListPrinters) {
  Get-CimInstance Win32_Printer |
    Sort-Object Name |
    Select-Object Name, Default, WorkOffline, PrinterStatus
  exit 0
}

if ([string]::IsNullOrWhiteSpace($PrinterName)) {
  Write-Error "PrinterName is required. Use -ListPrinters to see installed printer names."
  exit 1
}

$signature = @'
using System;
using System.Runtime.InteropServices;

public static class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
}
'@

if (-not ('RawPrinterHelper' -as [type])) {
  Add-Type -TypeDefinition $signature
}

$printer = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $PrinterName } | Select-Object -First 1
if (-not $printer) {
  Write-Error "Printer '$PrinterName' was not found. Use -ListPrinters to copy the exact name."
  exit 1
}

$esc = 0x1B
$gs = 0x1D
$bytes = New-Object System.Collections.Generic.List[byte]

# ESC/POS initialize.
$bytes.AddRange([byte[]]@($esc, 0x40))

if (-not $NoText) {
  $text = "Wolastoq Bingo cut test`nIf this prints but does not cut, check printer driver cutter settings.`n`n`n"
  $bytes.AddRange([System.Text.Encoding]::ASCII.GetBytes($text))
}

# Feed a few lines before cutting so the blade has paper past the print head.
$bytes.AddRange([byte[]]@($esc, 0x64, 0x04))

# ESC/POS GS V m: m=0 full cut, m=1 partial cut on Epson-compatible printers.
$cutMode = if ($Cut -eq 'Full') { 0x00 } else { 0x01 }
$bytes.AddRange([byte[]]@($gs, 0x56, $cutMode))

$handle = [IntPtr]::Zero
$opened = [RawPrinterHelper]::OpenPrinter($PrinterName, [ref]$handle, [IntPtr]::Zero)
if (-not $opened) {
  throw "Could not open printer '$PrinterName'. Win32 error: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

try {
  $doc = New-Object RawPrinterHelper+DOCINFOA
  $doc.pDocName = 'Wolastoq Bingo Thermal Cut Test'
  $doc.pDataType = 'RAW'

  if (-not [RawPrinterHelper]::StartDocPrinter($handle, 1, $doc)) {
    throw "Could not start raw print job. Win32 error: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }

  try {
    if (-not [RawPrinterHelper]::StartPagePrinter($handle)) {
      throw "Could not start raw print page. Win32 error: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }

    try {
      $written = 0
      $payload = $bytes.ToArray()
      if (-not [RawPrinterHelper]::WritePrinter($handle, $payload, $payload.Length, [ref]$written)) {
        throw "Could not write raw print bytes. Win32 error: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
      }
      if ($written -ne $payload.Length) {
        throw "Only wrote $written of $($payload.Length) raw print bytes."
      }
    } finally {
      [void][RawPrinterHelper]::EndPagePrinter($handle)
    }
  } finally {
    [void][RawPrinterHelper]::EndDocPrinter($handle)
  }
} finally {
  [void][RawPrinterHelper]::ClosePrinter($handle)
}

Write-Host "Sent $Cut cut test to '$PrinterName'."
