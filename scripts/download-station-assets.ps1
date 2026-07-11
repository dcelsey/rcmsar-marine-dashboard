#requires -Version 7
$ErrorActionPreference = 'Continue'

$root = Join-Path $PSScriptRoot '..' 'public' 'stations' | Resolve-Path
Write-Host "Downloading to $root"

$items = @(
  @{ slug='sar01'; kind='favicon'; ext='ico'; url='https://www.rcmsar01.ca/favicon.ico' },
  @{ slug='sar02'; kind='logo';    ext='png'; url='https://img1.wsimg.com/isteam/ip/d5d473b1-9f42-4292-be67-925ebbcbfa28/thumbnails/thumbnail-7d2812f2-f077-40e0-ad93-27893b961830.png/:/rs=w:1000' },
  @{ slug='sar02'; kind='favicon'; ext='ico'; url='https://rcmsar2.com/favicon.ico' },
  @{ slug='sar05'; kind='logo';    ext='png'; url='https://rcmsar5.ca/wp-content/uploads/2024/05/rcmsar-logo-colour-stn5-150px.png' },
  @{ slug='sar05'; kind='favicon'; ext='png'; url='https://rcmsar5.ca/wp-content/uploads/2024/05/cropped-favicon-270x270.png' },
  @{ slug='sar08'; kind='logo';    ext='png'; url='https://rcmsardelta.com/wp-content/uploads/2022/08/logo.png' },
  @{ slug='sar08'; kind='favicon'; ext='ico'; url='https://rcmsardelta.com/favicon.ico' },
  @{ slug='sar10'; kind='logo';    ext='gif'; url='https://rcmsar10.org/wp-content/uploads/2023/02/RCMSAR-Round-Logo-HiRes-e1675526943635-1.gif' },
  @{ slug='sar10'; kind='favicon'; ext='gif'; url='https://rcmsar10.org/wp-content/uploads/2023/02/cropped-RCMSAR-Round-Logo-HiRes-e1675526943635-270x270.gif' },
  @{ slug='sar12'; kind='logo';    ext='png'; url='https://images.squarespace-cdn.com/content/v1/69968b2321c76a32fe9f10a8/e24ced07-60d5-4d1d-abd8-6960ffb842fc/rcmsar-logo-colour-150px.png?format=2500w' },
  @{ slug='sar12'; kind='favicon'; ext='ico'; url='https://www.rcmsar12.org/favicon.ico' },
  @{ slug='sar14'; kind='logo';    ext='png'; url='https://lh3.googleusercontent.com/sitesv/AA5AbUBPzhMccoMsQIY5N8qzq_HG2mZYVfRhterW0FFJgjBAl9zZGW1ilh89bBphTua0qWPK0jJfIyJdIBtriZCqk_iv0GLJ0wMwLfKRCEXQeV8u5H8zETPyjgfkCu1mQnLwybhXCrBtKMaEYwvmqBaTRVEFJOAgxV7m94-j20XixKpTkuRPQIPwh9XpFI_Uz54=w600' },
  @{ slug='sar14'; kind='favicon'; ext='ico'; url='https://www.rcmsar14.ca/favicon.ico' },
  @{ slug='sar20'; kind='favicon'; ext='ico'; url='https://www.rcmsar20.ca/favicon.ico' },
  @{ slug='sar27'; kind='logo';    ext='jpg'; url='https://rcmsar27.ca/wp-content/uploads/2013/11/cropped-header_NMRS11.jpeg' },
  @{ slug='sar27'; kind='favicon'; ext='jpg'; url='https://rcmsar27.ca/wp-content/uploads/2013/10/RCMSAR_icon.jpg' },
  @{ slug='sar29'; kind='logo';    ext='png'; url='https://rcmsar29.com/wp-content/uploads/2016/04/rcmsar-logo.png' },
  @{ slug='sar29'; kind='favicon'; ext='ico'; url='https://rcmsar29.com/favicon.ico' },
  @{ slug='sar31'; kind='logo';    ext='png'; url='https://rcmsar31.com/wp-content/uploads/2017/04/Color-logo-png.png' },
  @{ slug='sar31'; kind='favicon'; ext='jpg'; url='https://rcmsar31.com/wp-content/uploads/2020/05/Logo-only.jpg' },
  @{ slug='sar34'; kind='logo';    ext='png'; url='https://rcmsar34.com/wp-content/uploads/2025/11/rcmsar-logo-colour-150px.png' },
  @{ slug='sar34'; kind='favicon'; ext='ico'; url='https://rcmsar34.com/favicon.ico' },
  @{ slug='sar35'; kind='logo';    ext='png'; url='https://vmrs.org/wp-content/uploads/2019/12/VMRS_Logo-Options_FINAL-07.png' },
  @{ slug='sar35'; kind='favicon'; ext='ico'; url='https://www.vmrs.org/favicon.ico' },
  @{ slug='sar36'; kind='favicon'; ext='ico'; url='https://www.marinerescue.org/favicon.ico' },
  @{ slug='sar37'; kind='favicon'; ext='ico'; url='http://rcmsar37.com/favicon.ico' },
  @{ slug='sar39'; kind='favicon'; ext='ico'; url='http://www.rcmsar39.ca/favicon.ico' },
  @{ slug='sar59'; kind='logo';    ext='png'; url='https://rcmsar59.ca/wp-content/uploads/2024/12/logo-horizontal-station59deepbay_v2.png' },
  @{ slug='sar59'; kind='favicon'; ext='ico'; url='https://rcmsar59.ca/wp-content/uploads/2018/02/rcm-sar59-logo.ico' },
  @{ slug='sar60'; kind='logo';    ext='png'; url='https://lh7-us.googleusercontent.com/sitesv-images-rt/ACHe0d3G-R5A_f6c4s6Z7oybA0fT-oybnYRbxZVZ29Ax5a1ucT7snMu_o5PNrMHVuHifjfEv4UQgBJ0kFKJX9089DWWLd0HHkYm_08IJDk-mt3W4gDfij7vHFMm2-ghRuG5Lkg9AgCKT44bsu2l9_jeX4aVpVRMCecuZYZWxxnRA4n1BF7pTOAJKVO-J6VAYkcM=w600' },
  @{ slug='sar60'; kind='favicon'; ext='ico'; url='https://www.station60rcmsar.com/favicon.ico' },
  @{ slug='sar61'; kind='logo';    ext='png'; url='https://www.rcmsar61.ca/uploads/1/2/7/6/127655066/published/phspirit-logo.png' },
  @{ slug='sar61'; kind='favicon'; ext='ico'; url='https://www.rcmsar61.ca/favicon.ico' },
  @{ slug='sar64'; kind='favicon'; ext='ico'; url='https://marinerescue.ca/favicon.ico' },
  @{ slug='sar106'; kind='logo';    ext='png'; url='https://rcmsar106.ca/wp-content/uploads/2023/01/rcmsarlogo.png' },
  @{ slug='sar106'; kind='favicon'; ext='png'; url='https://rcmsar106.ca/wp-content/uploads/2023/01/rcmsarlogo.png' }
)

$results = @()
foreach ($item in $items) {
  $dir = Join-Path $root $item.slug
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $dest = Join-Path $dir "$($item.kind).$($item.ext)"
  try {
    Invoke-WebRequest -Uri $item.url -OutFile $dest -TimeoutSec 15 -MaximumRedirection 5 -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) rcmsar-dashboard/1.0' -ErrorAction Stop | Out-Null
    $size = (Get-Item $dest).Length
    Write-Host "OK  $($item.slug) $($item.kind) $size bytes"
    $results += [pscustomobject]@{ slug=$item.slug; kind=$item.kind; ok=$true; size=$size }
  } catch {
    if (Test-Path $dest) { Remove-Item $dest }
    Write-Host "ERR $($item.slug) $($item.kind) $($_.Exception.Message)"
    $results += [pscustomobject]@{ slug=$item.slug; kind=$item.kind; ok=$false; error=$_.Exception.Message }
  }
}

Write-Host "`n--- Summary ---"
$ok = ($results | Where-Object ok).Count
$fail = ($results | Where-Object { -not $_.ok }).Count
Write-Host "$ok downloaded, $fail failed"
$results | Where-Object { -not $_.ok } | ForEach-Object { Write-Host "  FAIL $($_.slug) $($_.kind): $($_.error)" }
