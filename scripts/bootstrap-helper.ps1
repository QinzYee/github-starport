$ErrorActionPreference = 'Stop'
$starportRoot = Split-Path -Parent $PSScriptRoot
$starportNode = Join-Path $starportRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $starportNode)) {
    $starportVersion = 'v24.16.0'
    $starportName = "node-$starportVersion-win-x64.zip"
    $starportCache = Join-Path $starportRoot '.data\install-cache'
    New-Item -ItemType Directory -Path $starportCache -Force | Out-Null
    Write-Host 'Downloading Node.js from nodejs.org; no administrator access required...'
    $starportChecksums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$starportVersion/SHASUMS256.txt").Content
    if ($starportChecksums -is [byte[]]) { $starportChecksums = [Text.Encoding]::UTF8.GetString($starportChecksums) }
    $starportLine = ($starportChecksums -split "`n" | Where-Object { $_.Trim().EndsWith(" $starportName") } | Select-Object -First 1)
    if (-not $starportLine) { throw 'Node.js official checksum is missing.' }
    $starportExpected = ($starportLine.Trim() -split '\s+')[0]
    if ($starportExpected -notmatch '^[a-f0-9]{64}$') { throw 'Invalid Node.js checksum.' }
    $starportZip = Join-Path $starportCache $starportName
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$starportVersion/$starportName" -OutFile $starportZip
    if ((Get-FileHash -LiteralPath $starportZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $starportExpected) { throw 'Node.js SHA256 verification failed.' }
    Expand-Archive -LiteralPath $starportZip -DestinationPath $starportCache -Force
    New-Item -ItemType Directory -Path (Join-Path $starportRoot 'runtime') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $starportCache "node-$starportVersion-win-x64\node.exe") -Destination $starportNode
    Copy-Item -LiteralPath (Join-Path $starportCache "node-$starportVersion-win-x64\LICENSE") -Destination (Join-Path $starportRoot 'runtime\LICENSE')
}
& $starportNode (Join-Path $PSScriptRoot 'install-helper.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Helper registration failed.' }
