# Link-C owner guide

A short, friendly guide for the person who runs Link-C. You do everything below in **Admin** (open the app, then Admin).

## Invite someone

1. Admin > Members > **Invite**. Type their email address, a name and choose a role (Member for normal people).
2. The app makes a **one-time link**. Copy it and send it to the person **privately** (WhatsApp, Signal, in person). Link-C does not send any email.
3. The link works **once** and stops working after **24 hours**. If it expires, just make a new one.

## What the person sees

1. They open your link and see a page asking for a display name and a password.
2. The password needs at least 12 characters and must be hard to guess (the page shows how strong it is). It cannot contain their name or email.
3. After saving, they go to the sign-in page and sign in with their **email and password**. A short welcome and setup guide follows on their first visit.
4. If they stay idle for 1 minute they are signed out automatically (calls, uploads and location sharing keep them signed in).

## Reset a password

Someone forgot their password? Admin > Members > the person > **Reset password link**. Send them the new link privately. It also works once for 24 hours. Their old password stops working when they choose a new one.

## Disable or enable a login

- **Disable login** signs the person out everywhere straight away and stops them signing in. Their messages and files are kept.
- **Enable login** lets them sign in again with their existing password.
- Use this when a phone is lost, or for a break. It is gentler than removing someone.

## What "Login disabled" means

A label next to a person means their login is switched off. They cannot sign in until you press **Enable login**. It is not the same as removed.

## Remove a person

Admin > Members > the person > **Remove**. This deletes the account and their data, and it cannot be undone. If you only want them to stop using the app for now, disable the login instead.

## Sticker packs

Admin > Stickers shows the official packs (open-licensed Fluent Emoji, with credit) and lets you turn packs on or off for everyone. People can also add their own stickers in the chat sticker picker.

## SMS settings

Admin > SMS holds the gateway, monthly cap and quiet hours for the disguised offline alerts. See the "Known limits" part of `docs/DEPLOY.md` for the honest limits (carriers may filter messages). Always test with a real phone.

A person who is offline with an unread message gets texts on this schedule, until they open the app. SMS 1 goes out as soon as they are offline with an unread message, that is after "SMS 1: offline after (s)" seconds without the app open (recommended 45). SMS 2 goes out "SMS 2 after (minutes)" after SMS 1 (default 10). SMS 3 and every later SMS goes out "Repeat every (minutes) after the previous SMS" after the previous one (default 19). The daily cap (per person, default 10) and the monthly cap (overall, default 300) count only SMS that were sent successfully. Each step has its own text (max 160 characters): SMS 1, SMS 2, and "SMS 3 and later"; a blank SMS 2 or SMS 3 and later text reuses the SMS 1 text, and a text set on a member overrides all three. Keep the texts looking like an ordinary system message, with no app name. The old Push tab is gone: push alerts are replaced by SMS.

The "Recent SMS attempts" card at the top of Admin > SMS shows a status line (SMS on or off, gateway URL and credentials saved, how many members have a number and alerts on) and the last 15 attempts with the time in your local time, the member name, the kind and the result, with a plain explanation. "http 200" means the gateway accepted it; "http 4xx/5xx" means the gateway refused it; "error gateway rejected" means the gateway answered OK (http 200) but its reply body looks like an error (for example Notify.lk answering status "error"), so check the credentials, sender ID and balance; "cap reached" means the daily or monthly SMS limit was reached and sending is paused; "error credentials" means the saved gateway credentials cannot be decrypted, so re-enter BOTH the API key and the API secret and save; "error phone unreadable" means the stored number cannot be read, so re-enter it under Members > the person's menu > Phone number. It never shows phone numbers or message text.

## Locked out?

Five wrong passwords in a row lock that email for **15 minutes**. Wait, or send a reset link.

## Security tips

- Send links **privately**, to one person only. Never post a link in a group.
- Anyone holding an unused link can set the password, so delete the message after the person has used it.
- **Never share your own password**, and use one that you use nowhere else. A password manager helps.
- If you think a link or password leaked: disable that person's login, then send a fresh reset link.
- Keep your `.env`, `MASTER_KEY` and Supabase secret key private and backed up offline.

## Twilio setup (SMS alerts)
1. In the Twilio console copy **Account SID** (starts with AC) and **Auth Token**, and get a Twilio phone number (or a Messaging Service SID, starts with MG).
2. Twilio > Messaging > Settings > **Geo permissions**: enable every country you will text (for example Sri Lanka). A trial account can only text numbers you verified in Twilio ("Verified Caller IDs"), and adds a "Sent from your Twilio trial account" prefix. Upgrade the account to remove both limits.
3. Link-C admin > SMS, fill in:
   - API URL: `https://api.twilio.com/2010-04-01/Accounts/<YOUR ACCOUNT SID>/Messages.json`
   - HTTP method: POST, Request format: form
   - Sender ID: your Twilio number in +E.164 form (for example +15551234567)
   - Body template: `To={to}&From={sender}&Body={text}` (with a Messaging Service use `To={to}&MessagingServiceSid=MGxxxx&Body={text}`)
   - Headers template: `{"Authorization":"Basic {basicAuth}"}`
   - API key = Account SID, API secret = Auth Token
   - Tick Enabled, save, then use the test message button with your own number.
4. Each member's phone number is added when you invite them (+country code). They get one alert when they have been offline longer than "Offline after", then no more until they come back online.

## Notify.lk setup (SMS alerts for Sri Lanka)
Check the field names in your Notify.lk dashboard / API docs first: this is written from memory of their simple "send" API.
1. In Notify.lk copy your **User ID** and **API Key** (Settings / API). The free trial normally sends only from their demo sender ID and has a small message allowance.
2. Link-C admin > SMS, fill in:
   - API URL: `https://app.notify.lk/api/v1/send`
   - HTTP method: POST, Request format: form
   - Sender ID: `NotifyDEMO` while on the trial, or your approved sender name later
   - Body template: `user_id={apiKey}&api_key={apiSecret}&sender_id={sender}&to={toDigits}&message={text}`
   - Headers template: `{}`
   - API key field = your Notify.lk **User ID**, API secret field = your Notify.lk **API Key**
   - Tick Enabled, save, then send the test message to your own number (`+94...`). The Delivery log shows `http 200` for accepted messages.
3. A member only gets alerts when they have a phone number (added when you invite them, with +94), have verified it, and have "SMS alerts" on.
