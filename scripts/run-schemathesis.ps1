# Fuzzing de contrato OpenAPI (solo 5 GET core).
# Uso: .\scripts\run-schemathesis.ps1

param(
    [string]$ApiBase = $(if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://127.0.0.1:8000" }),
    [int]$MaxExamples = 10
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$token = $env:API_TOKEN
if (-not $token -and $env:TEST_LOGIN_EMAIL -and $env:TEST_LOGIN_PASSWORD) {
    $token = & (Join-Path $PSScriptRoot "get-api-token.ps1")
}
if (-not $token) {
    Write-Host "Falta API_TOKEN o TEST_LOGIN_EMAIL/PASSWORD" -ForegroundColor Yellow
    exit 1
}

$env:API_TOKEN = $token
$env:API_BASE_URL = $ApiBase
$env:SCHEMATHESIS_MAX_EXAMPLES = [string]$MaxExamples

Write-Host "Schemathesis (OpenAPI filtrado, 5 rutas GET)" -ForegroundColor Cyan
python (Join-Path $PSScriptRoot "run_schemathesis.py")
exit $LASTEXITCODE
