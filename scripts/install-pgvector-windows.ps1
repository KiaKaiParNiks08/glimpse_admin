# Installs the pgvector files for PostgreSQL 16 on Windows.
# Run from an elevated PowerShell:  powershell -ExecutionPolicy Bypass -File scripts/install-pgvector-windows.ps1
# Then: npm run prisma:deploy

$ErrorActionPreference = 'Stop'
$pgRoot = 'C:\Program Files\PostgreSQL\16'
if (-not (Test-Path $pgRoot)) {
  throw "PostgreSQL 16 was not found at $pgRoot"
}

$zip = Join-Path $env:TEMP 'vector.v0.8.6-pg16.zip'
$dest = Join-Path $env:TEMP 'vector-pg16'
if (-not (Test-Path $zip)) {
  Invoke-WebRequest -Uri 'https://github.com/andreiramani/pgvector_pgsql_windows/releases/download/0.8.6_16/vector.v0.8.6-pg16.zip' -OutFile $zip
}
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $dest -Force

Copy-Item -Path (Join-Path $dest 'lib\vector.dll') -Destination (Join-Path $pgRoot 'lib\vector.dll') -Force
Copy-Item -Path (Join-Path $dest 'share\extension\*') -Destination (Join-Path $pgRoot 'share\extension') -Force

Write-Output 'pgvector files copied. Restart the postgresql-x64-16 service, then run npm run prisma:deploy.'
