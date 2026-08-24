param(
  [string]$Tag = "latest",
  [string]$Owner = "kkh95x"
)

$ErrorActionPreference = "Stop"
$Image = "ghcr.io/$Owner/bothub:$Tag"
$LocalTag = "bothub:$Tag"

Write-Host "Building Docker image..."
Write-Host "  - $LocalTag"
Write-Host "  - $Image"

docker build -t $LocalTag -t $Image .

if ($LASTEXITCODE -ne 0) {
  Write-Error "Docker build failed. Make sure Docker Desktop is running."
}

Write-Host ""
Write-Host "Build succeeded."
Write-Host "Run locally:  docker run --rm -p 3000:3000 --env-file .env $LocalTag"
Write-Host "With compose: docker compose up -d"
Write-Host "Push to GHCR: docker push $Image"
