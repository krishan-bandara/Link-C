---
name: project-link-c-deploy-script
description: "One-command publish script scripts/deploy.ps1 (2026-10-29): commit + git push + SSH deploy to the Oracle server; config in git-ignored .env.deploy"
metadata:
  type: project
---

Owner asked (2026-10-29) for one command that pushes to git and updates the server. Built `scripts/deploy.ps1` (PowerShell, run from the repo folder on the owner's PC): `.\scripts\deploy.ps1 "message"` = git add/commit, `git push origin main`, then SSH to the server and run `git pull --ff-only`, `sudo docker compose up -d --build --force-recreate` (app AND worker), `sudo chown -R 1000:1000 data`, `docker compose ps`. Flags: `-NoDeploy` (git only), `-DeployOnly` (server only). Stops if not on main, if there are uncommitted changes without a message, or on any error.

Server host and SSH key path are NOT in the script: they live in `.env.deploy` (git-ignored by `.env.*`) as `LINKC_SSH_HOST=ubuntu@<ip>` and `LINKC_SSH_KEY=<key path>`. The Oracle IP is ephemeral: if SSH fails, update the IP there first. Claude's shell has no GitHub key, so the owner runs the script, not Claude. Written but NOT yet run (untested) when saved.

See [[project-link-c-hosting-oracle]].
