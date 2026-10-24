# Link-C deployment guide

Written for a beginner. Do the parts in order. Anything in a grey box is meant to be copied and pasted.

Jargon, briefly:
- **VM**: your Linux machine that runs the app.
- **Docker / Docker Compose**: runs the app in isolated boxes ("containers") from a recipe (`docker-compose.yml`).
- **Tunnel**: a connection that your VM opens *outward* to Cloudflare, so people reach the app without you opening any port at home.
- **Env file (`.env`)**: a text file holding settings and secrets. It is never committed to git.
- **Secret key**: a password for programs. Treat it like a bank PIN.

Link-C uses Supabase **Cloud** (free plan) for the database and login, so there is no Supabase container on your VM. Docker Compose runs two containers: `app` and `worker`. Internet access comes through your VM's **existing** Cloudflare Tunnel (see Part B), which forwards `https://link-c.innoforge.dpdns.org` to `http://127.0.0.1:3005` on the VM. The app listens on the VM's loopback only, so nothing is reachable from outside except through the tunnel.

---

## Part A. Supabase dashboard (https://supabase.com/dashboard, open your project)

1. **Turn off public sign-up**: Authentication > Sign In / Providers > "Allow new users to sign up" = OFF. (The database also refuses users without an invite.)
2. **URLs**: Authentication > URL Configuration. Site URL = your `APP_URL` (`https://link-c.innoforge.dpdns.org`). Add redirect URL `https://link-c.innoforge.dpdns.org/**`.
3. **Email provider stays ON**: Authentication > Sign In / Providers > Email must stay **enabled**, because password sign-in uses it. The "Confirm email" switch does not matter: the server creates every account already confirmed. Link-C sends **no emails at all**, so you do not need SMTP, email templates or any email settings.
4. **Secret key**: Project Settings > API keys > create a **secret key** (starts with `sb_secret_`). Copy it into `SUPABASE_SECRET_KEY` in `.env`. Never put it in the browser or git. The URL and the `sb_publishable_...` key are public and go in the two `NEXT_PUBLIC_...` variables.
5. **Realtime**: Project Settings > Realtime (or Realtime settings): leave "Allow public access" **OFF**. Link-C uses private channels.
6. **Sign-in token lifetime (recommended)**: Authentication > Sessions (or JWT settings): set the access token expiry to about 300 seconds, so a disabled person's old token stops working within minutes.
7. The database schema is already applied from `supabase/migrations/` (files 1 to 9, including the sign-up lock-down in 7, Clear chat in 8 and push in 9). For a NEW Supabase project run them in order in the SQL editor. To check the security rules, run `supabase/tests/rls.sql` against a **test** database (see README). It rolls back and changes nothing.

## Part B. Cloudflare

1. Your domain `innoforge.dpdns.org` is already on Cloudflare. Keep SSL/TLS mode on **Full**.
2. **Tunnel**: Link-C reuses the existing tunnel `Tunnel-Linux-prod-VM`, so there is **no tunnel token** to copy. Never click "Rotate token" on it (that would disconnect your other apps).
3. In that tunnel add a **published application**: subdomain `link-c`, domain `innoforge.dpdns.org`, service URL `http://127.0.0.1:3005` (use `127.0.0.1`, not `localhost`, because the app is bound to IPv4 loopback only). The app's compose file publishes `127.0.0.1:3005`.
4. **Protect the admin panel**: Zero Trust > Access > Applications > Add > Self-hosted. Domain `link-c.innoforge.dpdns.org`, path `admin*`. Add a policy "Allow" with Include > Emails = only your own email. (Also protect `api/admin*` the same way if the admin API lives there.)
5. **Rate limiting** (Security > WAF > Rate limiting rules). Suggested starting values, per IP:
   - `/api/auth/*` and `/invite/*` (sign-in and invite pages): 10 requests per minute, block 10 minutes.
   - `/api/uploads*`: 120 requests per minute, block 5 minutes (chunks of 8 MB add up).
   - `/api/*`: 300 requests per minute, block 1 minute.
   The free plan allows few rules; prioritise the sign-in rule first.
6. Cloudflare's free plan rejects any single request over **100 MB**. Link-C uploads in 8 MB chunks, so this is not a problem.

## Part C. Backblaze B2 (normal photos and videos)

1. Create a **separate, dedicated Backblaze account** with a unique strong password. Turn on **2-step verification** (authenticator app).
2. Create **one private bucket** (never public). Note its name and its S3 endpoint (for example `https://s3.us-west-004.backblazeb2.com`); the region is the middle part (`us-west-004`).
3. Bucket settings: turn on server-side encryption (SSE-B2), and set **Lifecycle Settings** to "Keep only the last version of the file", so deleted files are really removed.
4. App Keys > Add a new application key: restrict it to **that one bucket**, read and write. Do not use the master key. Copy the keyID and applicationKey immediately (shown once).
5. Account > Caps & Alerts: set a monthly spending cap and email alerts.
6. In `.env`:
   ```
   STORAGE_DRIVER=b2
   B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
   B2_REGION=us-west-004
   B2_BUCKET=your-bucket-name
   B2_KEY_ID=...
   B2_APP_KEY=...
   ```
   If the key ever leaks, delete it in the B2 console and make a new one. Files stay unreadable because they are encrypted with your `MASTER_KEY`.

## Part D. LiveKit Cloud (voice and video calls)

1. Create a free project at https://cloud.livekit.io.
2. Project Settings > Keys: create a key pair.
3. Put the project URL (`wss://....livekit.cloud`) in `LIVEKIT_URL`, and the key and secret in `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.

## Part E. The VM

1. **Install Docker** (Debian/Ubuntu):
   ```
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   ```
   Log out and in again.
2. **Get the code** onto the VM (git clone, or copy the folder), then:
   ```
   cd link-c
   ```
3. **Generate secrets**:
   ```
   node scripts/gen-secrets.mjs
   ```
   (No Node on the VM? Run it on your PC instead.) Paste `MASTER_KEY` and `SIGNING_KEY` into `.env` and **store a copy offline in a password manager**. Losing `MASTER_KEY` makes stored media unreadable forever.
   For phone push notifications also generate a key pair and put all three values in `.env` (the private key is a secret; use the SAME pair on every server, changing it makes every phone subscribe again):
   ```
   npx web-push generate-vapid-keys
   ```
   `VAPID_PUBLIC_KEY=...`, `VAPID_PRIVATE_KEY=...`, `VAPID_SUBJECT=mailto:your-email`.
4. **Create `.env`** and lock it down:
   ```
   cp .env.example .env
   nano .env
   chmod 600 .env
   ```
   Fill in every value. Set `DATA_DIR=/data`, `TZ=Asia/Colombo`.
5. **Data folder** (the container runs as user 1000). **Do not skip this**, and run it BEFORE the first `docker compose up`:
   ```
   mkdir -p data && sudo chown -R 1000:1000 data
   ```
   If you skip it, Docker creates `data` owned by root, login still works, but every photo upload fails with "upload error" and the logs show `EACCES: permission denied, mkdir '/data/cache'`. Fix: run the `chown` above, then `sudo docker compose restart app worker`. Check with `ls -ld data` (owner must be uid 1000, e.g. `threedkn`). Repeat the `chown` if you ever delete and recreate `data`.
6. **Build and start**:
   ```
   docker compose build
   docker compose up -d
   docker compose ps
   docker compose logs -f app
   ```
   The `NEXT_PUBLIC_...` values are baked in at build time: if you change them, run `docker compose build` again.
7. **Firewall**: nothing needs to be reachable from outside (the tunnel is outbound only).
   ```
   sudo apt install -y ufw
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp   # SSH from your home network only; adjust
   sudo ufw enable
   ```
8. **SSH keys only**: copy your public key to the VM (`ssh-copy-id`), then in `/etc/ssh/sshd_config` set `PasswordAuthentication no` and `PermitRootLogin no`, and `sudo systemctl restart ssh`. Test a second login before closing the first.
9. **fail2ban and automatic updates**:
   ```
   sudo apt install -y fail2ban unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```
10. **Disk alerts**: the worker logs a warning when the data disk passes 80% (`docker compose logs worker | grep WARNING`). Also add a cron line that emails you or pings a service when `df` shows over 80%. Docker log rotation: set `{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}` in `/etc/docker/daemon.json` and restart Docker.
11. **Backups (important)**: the free Supabase plan has **no automatic backups you can restore from**. Run a nightly dump from the VM.
    - Supabase dashboard > Project Settings > Database > Connection string (use the "Session pooler" URI). Put it in `/root/linkc-backup.env` as `DATABASE_URL=...` (chmod 600).
    - Install `postgresql-client`, `age` and `rclone` (configure an rclone remote for your B2 bucket, ideally a separate bucket and key from the media one).
    - Create an age key once: `age-keygen -o backup.key`, keep `backup.key` offline, and put the public key (starts with `age1`) in the script.
    - `/usr/local/bin/linkc-backup.sh`:
      ```
      #!/bin/sh
      set -eu
      . /root/linkc-backup.env
      F=/tmp/linkc-$(date +%F).sql.age
      pg_dump "$DATABASE_URL" --no-owner --schema=public | age -r AGE_PUBLIC_KEY_HERE > "$F"
      rclone copy "$F" b2backup:YOUR-BACKUP-BUCKET/db/
      rm -f "$F"
      rclone delete b2backup:YOUR-BACKUP-BUCKET/db/ --min-age 14d
      ```
    - Schedule: `sudo crontab -e` then `30 2 * * * /usr/local/bin/linkc-backup.sh`.
    - Snaps are never backed up (they are temporary on purpose). **Test one restore** into a scratch Supabase project before you rely on this.
    - Keep your `MASTER_KEY` copy too: the database holds encrypted phone numbers and SMS credentials that need it.

## Part F. First login (owner) and how sign-in works

Link-C signs people in with **email + password**. Nobody gets an emailed login link. Instead, the owner creates a **one-time link** and sends it privately (WhatsApp, Signal, in person).

**First login, step by step**

1. On the machine that has your `.env` (the VM, or any machine with Node 22 and `npm ci` done), run:
   ```
   node --env-file=.env scripts/owner-set-password-link.mjs linkchatsecure@gmail.com
   ```
   It prints a one-time link. Open it in your browser and choose a strong password.
2. Go to `https://link-c.innoforge.dpdns.org/login` and sign in with your email and the new password.
3. Open **Admin > Members** and create an invite for each person. Send each person their link privately.

**Good to know**

- **Links work once, for 24 hours.** After the person has used a link, or after 24 hours, it stops working. Just make a new one.
- **Password rules**: at least 12 characters, hard to guess (the app checks strength), and it must not contain the person's name or email.
- **Forgotten password**: Admin > Members > the person > **Reset password link**. Send them the new link. Their old password stops working once they choose a new one.
- **Disable or enable a login**: Admin > Members > the person > **Disable login** (and **Enable login** to undo). A disabled person is signed out everywhere straight away and cannot sign in. Their chats and files are kept.
- **Auto sign-out**: after 1 minute without activity you are signed out. Calls, uploads and location sharing count as activity, so they keep you signed in.
- **Lockout**: 5 wrong passwords in a row lock that email for 15 minutes. Waiting is the only fix (or the owner resets the password).
- The Cloudflare Access rule on `admin*` (Part B) is an extra lock in front of the admin panel.

## Part G. Pre-launch checklist

- [ ] User A cannot read user B's conversations or media (`supabase/tests/rls.sql` passes)
- [ ] A one-time snap cannot be fetched twice (race-condition test)
- [ ] Unopened snap deleted after 24 hours; snaps never appear in B2 or backups
- [ ] Password policy test: short, common or name-based passwords are refused
- [ ] Invite link works once (second use is rejected) and an expired link is rejected
- [ ] Lockout works: 5 wrong passwords lock the email for 15 minutes
- [ ] Disabled user is signed out and cannot sign in; enabling restores access
- [ ] Idle logout works (signed out after 1 minute; a running call or upload keeps you in)
- [ ] Disallowed file types and oversize uploads rejected
- [ ] A 250 MB video uploads in chunks and resumes after a dropped connection; abandoned uploads are cleaned up after 1 hour
- [ ] XSS test in message text passes
- [ ] B2 application key works and is limited to its one bucket
- [ ] Master key copy stored offline; backup restore tested
- [ ] SMS test delivered to a real phone; caps enforced (only if you use SMS; see docs/ADMIN-GUIDE.md for gateway setup)
- [ ] Push: on a phone open the live https address, Settings > Phone notifications on (iPhone: Add to Home Screen first), then Admin > Push > "Send a test to my phone" arrives
- [ ] Clear chat: clears only for the person who used it
- [ ] Privacy notice and SMS disguise notice accepted at first login
- [ ] n8n isolated from Link-C; no inbound ports open
- [ ] Public sign-up is off in Supabase; Realtime public access is off
- [ ] Manual test on Chrome desktop, Samsung Chrome, iPhone Safari
- [ ] Secrets scan clean (CI gitleaks)

## Part H. Known limits (honest list)

- **Free Supabase pauses a project after 7 days of inactivity** and the free plan has no restorable backups. Use the app weekly or upgrade; keep the nightly dump.
- **No read cache for normal media yet**: every view of a normal photo or video is fetched from B2 and decrypted, which is slower than local disk.
- Cloudflare's 100 MB per-request cap is handled by 8 MB upload chunks.
- **Carriers may filter** the disguised SMS alert, especially from a generic gateway number. Test with real phones.
- **Snaps can be screenshotted or filmed.** "Deleted" means gone from your server only; the screenshot alert is best effort.
- Encryption is server-side, not end-to-end: whoever controls the server and `MASTER_KEY` can read media.
- **Push notifications** need the live https address, and on iPhone the app must be added to the Home Screen first. Someone who never turned them on gets nothing. The alert text is generic on purpose; set it in Admin > Push.
- Invite and reset links are only as private as the way you send them. Send them over a private channel, and never post them in a group.
