# Link-C one-step publish: commit (optional) -> git push -> update the server.
# Run from the repo folder in PowerShell:
#   .\scripts\deploy.ps1 "what I changed"      commit everything, push, deploy
#   .\scripts\deploy.ps1                        push what is already committed, deploy
#   .\scripts\deploy.ps1 -NoDeploy              only commit + push
#   .\scripts\deploy.ps1 -DeployOnly            only update the server (no git push)
#   .\scripts\deploy.ps1 "msg" -Yes             skip the 'commit these files?' question
#
# First time only: connect once by hand (ssh -i <key> <user@host>) and accept the server
# fingerprint so it is saved in known_hosts. This script then refuses unknown hosts.
#
# Private details (server address, key file) are NOT in this file. Put them in
# .env.deploy next to package.json (git-ignored), two lines:
#   LINKC_SSH_HOST=ubuntu@<server ip>
#   LINKC_SSH_KEY=<full path to the .key file>

param(
  [Parameter(Position = 0)][string]$Message,
  [switch]$NoDeploy,
  [switch]$DeployOnly,
  [switch]$Yes
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
    if (-not $Yes) {
      $answer = Read-Host 'Commit ALL the files listed above and push? Type y to continue'
      if ($answer -ne 'y') { throw 'Cancelled. Nothing was committed.' }
    }
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

# Only trust a server whose fingerprint is already saved in known_hosts.
$hostOnly = ($sshHost -split '@')[-1]
$known = & ssh-keygen -F $hostOnly 2>$null
if (-not $known) { throw "Server $hostOnly is not in known_hosts. Connect once by hand (ssh -i <key> $sshHost), check the fingerprint, accept it, then run this again." }

# Runs on the server. chown BEFORE up (else root-owned data breaks uploads). Worker is rebuilt too.
$remote = @'
set -e
cd ~/_work/Link-C
git pull --ff-only
mkdir -p data
sudo chown -R 1000:1000 data
sudo docker compose up -d --build --force-recreate
sudo docker image prune -f
ok=0
for i in 1 2 3 4 5 6; do
  if curl -fsS -o /dev/null http://127.0.0.1:3005/; then ok=1; break; fi
  sleep 5
done
sudo docker compose ps
echo "Deployed commit: $(git rev-parse --short HEAD)"
if [ "$ok" -ne 1 ]; then echo "HEALTH CHECK FAILED: app did not answer on 127.0.0.1:3005"; exit 1; fi
echo "Health check OK"
'@
$remote = $remote -replace "`r", ''

Step "Deploy on the server ($sshHost) - the build can take a few minutes"
Run ssh @('-i', $sshKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=30', '-o', 'StrictHostKeyChecking=yes', $sshHost, $remote)

Write-Host "`nLocal commit: $((git rev-parse --short HEAD).Trim())" -ForegroundColor Cyan
Write-Host "Done. Live at https://link-c.innoforge.dpdns.org (hard-refresh the app on your phone)." -ForegroundColor Green
