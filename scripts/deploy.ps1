# Link-C one-step publish: commit (optional) -> git push -> update the server.
# Run from the repo folder in PowerShell:
#   .\scripts\deploy.ps1 "what I changed"      commit everything, push, deploy
#   .\scripts\deploy.ps1                        push what is already committed, deploy
#   .\scripts\deploy.ps1 -NoDeploy              only commit + push
#   .\scripts\deploy.ps1 -DeployOnly            only update the server (no git push)
#
# Private details (server address, key file) are NOT in this file. Put them in
# .env.deploy next to package.json (git-ignored), two lines:
#   LINKC_SSH_HOST=ubuntu@<server ip>
#   LINKC_SSH_KEY=<full path to the .key file>

param(
  [Parameter(Position = 0)][string]$Message,
  [switch]$NoDeploy,
  [switch]$DeployOnly
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Run($exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "$exe failed (exit $LASTEXITCODE). Stopped." }
}

# --- 1. git: commit + push --------------------------------------------------
if (-not $DeployOnly) {
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'main') { throw "You are on '$branch', not main. Stopped." }

  Step 'Git status'
  git status --short
  $dirty = git status --porcelain
  if ($dirty) {
    if (-not $Message) { throw 'There are uncommitted changes. Run again with a message: .\scripts\deploy.ps1 "what I changed"' }
    Step 'Commit'
    Run git @('add', '-A')
    Run git @('commit', '-m', $Message)
  } elseif ($Message) {
    Write-Host 'Nothing new to commit (message ignored).'
  }

  Step 'Push to GitHub'
  Run git @('push', 'origin', 'main')
}

if ($NoDeploy) { Write-Host "`nDone (git only)." -ForegroundColor Green; exit 0 }

# --- 2. server: pull + rebuild ----------------------------------------------
$cfg = @{}
if (Test-Path '.env.deploy') {
  Get-Content '.env.deploy' | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
  }
}
$sshHost = if ($cfg.LINKC_SSH_HOST) { $cfg.LINKC_SSH_HOST } else { $env:LINKC_SSH_HOST }
$sshKey = if ($cfg.LINKC_SSH_KEY) { $cfg.LINKC_SSH_KEY } else { $env:LINKC_SSH_KEY }
if (-not $sshHost -or -not $sshKey) { throw 'Missing LINKC_SSH_HOST / LINKC_SSH_KEY. See the top of this file (.env.deploy).' }
if (-not (Test-Path $sshKey)) { throw "SSH key file not found: $sshKey" }

# Runs on the server. Worker is rebuilt too (--force-recreate on the whole project).
$remote = 'set -e; cd ~/_work/Link-C; git pull --ff-only; sudo docker compose up -d --build --force-recreate; sudo chown -R 1000:1000 data; sudo docker compose ps'

Step "Deploy on the server ($sshHost) - the build can take a few minutes"
Run ssh @('-i', $sshKey, '-o', 'IdentitiesOnly=yes', $sshHost, $remote)

Write-Host "`nDone. Live at https://link-c.innoforge.dpdns.org (hard-refresh the app on your phone)." -ForegroundColor Green
