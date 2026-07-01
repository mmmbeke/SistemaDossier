# Obtiene un JWT de la API para pruebas de carga (k6 / Locust).
# Uso:
#   .\scripts\get-api-token.ps1
#   .\scripts\get-api-token.ps1 -Email tu@correo.com -Password "tu_clave"
#   $env:API_TOKEN = .\scripts\get-api-token.ps1

param(
    [string]$Email = $env:TEST_LOGIN_EMAIL,
    [string]$Password = $env:TEST_LOGIN_PASSWORD,
    [string]$ApiBase = $(if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://127.0.0.1:8000" })
)

$ErrorActionPreference = "Stop"

if (-not $Email -or -not $Password) {
    Write-Host @"
Falta email o contraseña. Opciones:

  1) Variables de entorno (recomendado):
     `$env:TEST_LOGIN_EMAIL = "tu@correo.com"
     `$env:TEST_LOGIN_PASSWORD = "tu_contraseña"
     .\scripts\get-api-token.ps1

  2) Parámetros:
     .\scripts\get-api-token.ps1 -Email tu@correo.com -Password "tu_clave"

  3) Copiar desde el navegador (DevTools → Application → localStorage → access_token)
     tras iniciar sesión en http://localhost:3000/login

La API debe estar corriendo: python main.py
"@ -ForegroundColor Yellow
    exit 1
}

$body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
try {
    $response = Invoke-RestMethod -Uri "$ApiBase/auth/login" -Method Post `
        -Body $body -ContentType "application/json; charset=utf-8"
} catch {
    Write-Host "Error al hacer login en $ApiBase/auth/login" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

$token = $response.access_token
if (-not $token) {
    Write-Host "La API no devolvió access_token." -ForegroundColor Red
    exit 1
}

# Imprimir solo el token (para asignar a `$env:API_TOKEN = ...`)
Write-Output $token
