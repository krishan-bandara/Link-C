# Link-C login screen: design handoff and history

Status: **design preview only, mock logic.** It is not wired into the real app yet. Open `login-screen.html` in any browser to see it. It is one self-contained file (no libraries, no network calls).

## What was asked, in order
1. A creative animated login screen that does **not** look like a chat app (no bubbles, no green, no message icons).
2. Add a **coding / developer-console** style.
3. Add **more animated coding stuff in the background**.
4. Adjust the animation so it also works well **on mobile phones**.

## What the design contains
- **Look:** dark night-sky background, frosted-glass card with a light sweeping around its border, cyan-to-violet accent. Only branding is a small ring-and-dot mark and the word "Link-C".
- **Flow (3 steps):** email, then 6-digit code (magic link is mentioned too), then success. Mock only: any valid-looking email and any 6 digits succeed.
- **Coding style:** terminal title bar (`~/auth/session - zsh`), code-comment step labels (`// authenticate(user)`) with blinking cursor, a live typed command log inside the card, monospace labels.
- **Background animation:** star constellation that reacts to the pointer/touch; falling code rain (brighter head, fading trail, speeds up on submit and surges on success); floating code symbols; scrolling hex-dump ticker (top) and git-log ticker (bottom); drifting syntax-coloured code columns on wide screens (hidden under 1060 px); rotating dotted rings that pulse and expand.
- **Mobile tuning:** fewer stars/rain columns/glyphs and a lower frame rate on phones, capped pixel ratio, 16 px email text (stops iOS zoom), safe-area padding for notch and home bar, dynamic viewport height, card scrolls into view when the keyboard opens, short landscape screens scroll and hide the log and bottom ticker, vibration buzz on step changes and errors (Android only).
- **Accessibility:** labelled fields, error messages announced via `aria-live`, visible focus rings, code boxes accept pasted/autofilled 6-digit codes, all motion switched off when the device asks for reduced motion.

## Tested
In the in-app browser at desktop, narrow phone (about 375 px) and short landscape (667x375): full flow works, no console errors, no stray scrollbar. **Not tested on a real phone** (haptics, iOS Safari keyboard, real autofill).

## Known gaps and notes
- No real authentication: nothing talks to Supabase. Wiring needs the app's real magic-link request, 6-digit OTP verify, error handling and redirect.
- The hint text at the bottom ("design preview ...") must be removed for production.
- The code columns and tickers show fake, generic snippets only. They contain no real secrets and should stay that way.
- Rain and tickers are decoration; remove or reduce them if battery or performance matters.
- Colours and sizes are CSS variables at the top of the file (`--a1`, `--a2`, `--bg`, ...).

## To do later (the plan you mentioned)
Ask Claude in the terminal to integrate this into the real login page in `code/` (the app is a Next.js project; working copy `C:\dev\link-c`, mirrored to `Link-C\code`). Suggested request:

```
Read design/README.md and design/login-screen.html. Replace the login page of the Link-C app with this design.
Keep the real Supabase magic-link and 6-digit code verification, keep invite-only behaviour and rate limits,
remove the preview hint and fake success, respect the existing security headers (move the inline CSS and JS
into proper files if the CSP blocks inline code), and keep reduced-motion and mobile behaviour. Test on desktop
and a phone-size viewport, and run the existing tests.
```

Things Claude should check during integration: Content-Security-Policy (inline script/style), the existing login routes and server actions, that errors do not reveal whether an email is invited, and that the animation does not slow low-end phones.
