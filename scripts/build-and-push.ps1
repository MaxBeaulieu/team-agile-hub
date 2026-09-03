# Builds the backend/frontend images and pushes them to the image registry
# ops asked for (docker-registry.ao1.amilia.com), so their box can
# `docker compose pull` instead of building from source.
#
# Usage:
#   .\scripts\build-and-push.ps1                # builds + pushes :latest
#   .\scripts\build-and-push.ps1 -Tag v1.2.3    # builds + pushes a specific tag
#
# Requires: already run `docker login docker-registry.ao1.amilia.com` once
# (or enter credentials when prompted) — this script does not store or
# prompt for credentials itself.

param(
    [string]$Registry = $(if ($env:REGISTRY) { $env:REGISTRY } else { "docker-registry.ao1.amilia.com" }),
    [string]$Tag = $(if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" })
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Registry: $Registry" -ForegroundColor Cyan
Write-Host "Tag:      $Tag" -ForegroundColor Cyan

Push-Location $repoRoot
try {
    # `docker compose build` tags each image with its `image:` field in
    # docker-compose.yml, which already points at $Registry/command-center-*
    # (via the REGISTRY/IMAGE_TAG env vars, defaulted above if unset).
    $env:REGISTRY = $Registry
    $env:IMAGE_TAG = $Tag

    Write-Host "`n== Building images ==" -ForegroundColor Green
    docker compose build backend frontend
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed" }

    Write-Host "`n== Pushing images to $Registry ==" -ForegroundColor Green
    docker compose push backend frontend
    if ($LASTEXITCODE -ne 0) { throw "docker compose push failed (are you logged in? docker login $Registry)" }

    Write-Host "`nDone. Pushed:" -ForegroundColor Green
    Write-Host "  $Registry/command-center-backend:$Tag"
    Write-Host "  $Registry/command-center-frontend:$Tag"
}
finally {
    Pop-Location
}
