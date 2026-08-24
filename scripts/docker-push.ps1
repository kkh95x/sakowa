param(
  [string]$Owner = "kkh95x",
  [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$Image = "ghcr.io/$Owner/bothub:$Tag"

Write-Host "Building $Image ..."
docker build -t $Image .

Write-Host "Logging in to ghcr.io (use GitHub PAT with write:packages) ..."
docker login ghcr.io

Write-Host "Pushing $Image ..."
docker push $Image

Write-Host "Done. Set in .env:"
Write-Host "BOTHUB_IMAGE=$Image"
