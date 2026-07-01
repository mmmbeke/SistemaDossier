# Ejecutar suite de pruebas y auditorías
# Uso:
#   .\scripts\run-tests.ps1                          # pytest rápido
#   .\scripts\run-tests.ps1 -Integration -Security   # API + auditorías
#   .\scripts\run-tests.ps1 -E2E -Contract -Perf     # siguiente fase
#   .\scripts\run-tests.ps1 -Full                      # todo lo anterior

param(
    [switch]$Integration,
    [switch]$Security,
    [switch]$Perf,
    [switch]$E2E,
    [switch]$Contract,
    [switch]$Coverage,
    [switch]$Full,
    [ValidateSet("smoke", "medium", "stress")]
    [string]$PerfLevel = "smoke"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if ($Full) {
    $Integration = $true
    $Security = $true
    $Perf = $true
    $E2E = $true
    $Contract = $true
    $Coverage = $true
    $PerfLevel = "medium"
}

$env:PYTHONPATH = Join-Path $Root "src"
$env:DOSSIER_GENERATION_WORKER_ENABLED = "0"
$env:CALENDAR_AUTOMATION_ENABLED = "0"

function Resolve-ApiToken {
    if ($env:API_TOKEN) { return $env:API_TOKEN }
    if ($env:TEST_LOGIN_EMAIL -and $env:TEST_LOGIN_PASSWORD) {
        Write-Host "Obteniendo JWT con TEST_LOGIN_EMAIL..." -ForegroundColor DarkGray
        $t = & (Join-Path $PSScriptRoot "get-api-token.ps1")
        if ($t) { $env:API_TOKEN = $t; return $t }
    }
    return $null
}

Write-Host "`n=== Instalando dependencias de prueba (si faltan) ===" -ForegroundColor Cyan
pip install -q -r requirements-dev.txt

Write-Host "`n=== pytest (API) ===" -ForegroundColor Cyan
$pytestArgs = @("tests/", "-v", "--tb=short")
if ($Coverage) {
    $pytestArgs += @("--cov=dossier", "--cov-report=term-missing:skip-covered")
}
if ($Integration) {
    & pytest @pytestArgs
} else {
    & pytest @pytestArgs -m "not integration"
}

if ($Contract) {
    Write-Host "`n=== OpenAPI (esquema) ===" -ForegroundColor Cyan
    & pytest tests/api/test_openapi_schema.py -v --tb=short

    Write-Host "`n=== Schemathesis (fuzz lectura) ===" -ForegroundColor Cyan
    $token = Resolve-ApiToken
    if (-not $token) {
        Write-Host "Omitido Schemathesis: falta JWT." -ForegroundColor Yellow
    } else {
        & (Join-Path $PSScriptRoot "run-schemathesis.ps1")
    }
}

if ($Security) {
    Write-Host "`n=== Bandit (SAST Python) ===" -ForegroundColor Cyan
    bandit -r src/ -c bandit.yaml -ll -q
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Bandit encontró hallazgos (ver arriba)." -ForegroundColor Yellow
    }

    Write-Host "`n=== pip-audit (CVEs dependencias) ===" -ForegroundColor Cyan
    $pipAuditCache = Join-Path $env:TEMP "pip-audit-sistemadossier"
    New-Item -ItemType Directory -Force -Path $pipAuditCache | Out-Null
    pip-audit -r requirements.txt --cache-dir $pipAuditCache
    if ($LASTEXITCODE -ne 0) {
        Write-Host "pip-audit falló (red o caché). Reintenta: pip-audit -r requirements.txt --cache-dir `$env:TEMP\pip-audit" -ForegroundColor Yellow
    }

    Write-Host "`n=== npm audit (frontend) ===" -ForegroundColor Cyan
    Push-Location frontend-react
    npm audit --audit-level=high 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "npm audit: revisar avisos en frontend-react." -ForegroundColor Yellow
    }
    Pop-Location
}

if ($Perf) {
    $token = Resolve-ApiToken
    if (-not $token) {
        Write-Host "`n=== Perf omitida: falta JWT ===" -ForegroundColor Yellow
    } else {
        switch ($PerfLevel) {
            "smoke" {
                Write-Host "`n=== Locust smoke (5 usuarios, 10s) ===" -ForegroundColor Cyan
                locust -f perf/locustfile.py --host=http://127.0.0.1:8000 --token=$token `
                    --headless -u 5 -r 2 -t 10s --only-summary
            }
            "medium" {
                Write-Host "`n=== Locust medium (30 usuarios, 1m) ===" -ForegroundColor Cyan
                locust -f perf/locustfile.py --host=http://127.0.0.1:8000 --token=$token `
                    --headless -u 30 -r 5 -t 1m --only-summary
            }
            "stress" {
                Write-Host "`n=== Locust stress (100 usuarios, 2m) ===" -ForegroundColor Cyan
                locust -f perf/locustfile.py --host=http://127.0.0.1:8000 --token=$token `
                    --headless -u 100 -r 10 -t 2m --only-summary
            }
        }

        $k6 = Get-Command k6 -ErrorAction SilentlyContinue
        if ($k6) {
            Write-Host "`n=== k6 stress (lectura) ===" -ForegroundColor Cyan
            $k6Vus = if ($PerfLevel -eq "stress") { 100 } elseif ($PerfLevel -eq "medium") { 30 } else { 5 }
            $k6Dur = if ($PerfLevel -eq "smoke") { "15s" } else { "1m" }
            k6 run -e API_TOKEN=$token -e VUS=$k6Vus -e DURATION=$k6Dur perf/k6-stress.js
        } else {
            Write-Host "`n(k6 no instalado; opcional: winget install GrafanaLabs.k6)" -ForegroundColor DarkGray
        }
    }
}

if ($E2E) {
    Write-Host "`n=== Playwright E2E ===" -ForegroundColor Cyan
    Push-Location frontend-react
    if (-not (Test-Path "node_modules/@playwright/test")) {
        npm install -D @playwright/test
    }
    Write-Host "Instalando navegador Chromium (si falta)..." -ForegroundColor DarkGray
    npm run test:e2e:install
    if (-not $env:PLAYWRIGHT_API_URL) { $env:PLAYWRIGHT_API_URL = "http://127.0.0.1:8000" }
    npm run test:e2e
    Pop-Location
}

Write-Host "`n=== Listo ===" -ForegroundColor Green
