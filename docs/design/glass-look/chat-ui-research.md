# Chat UI/UX research: WhatsApp, Instagram, Messenger (2026-10-25)

Owner liked only message bubble style **A (gradient for my messages)**. This note collects what the big apps do, so Link-C can borrow the good parts. Nothing is applied yet. Try the ideas in `design-ideas-v2.html`.

Reliability note: results came from news and design blogs, not official design docs. Items marked (single source) or (conflicting) are weaker. Pinterest could not be read by the tool.

## WhatsApp (2026 "Liquid Glass" redesign, rolling out mainly on iOS)
- Translucent, blurred glass look: transparent top section with subtle blur, redesigned bottom navigation bar. Rollout is phased and sources disagree on dates.
- Floating chat input bar that replaces the fixed bottom layout. On Android beta, two chat-bar layouts are being tested (input moved up, send button folded into the bar). Not confirmed which one ships.
- Rounder message bubbles. Media (photos, video, GIF, link previews) no longer has the green outline.
- Chat list: filters and categories (one Italian report, single source, says users choose which category tabs stay visible, such as Work or Family).
- Status may move into the Chats section (beta report, not confirmed).
- Sources: https://mobilemasr.com/en/blogs/whatsapp-liquid-glass , https://www.ithinkdiff.com/whatsapp-testing-rounder-message-bubbles-ios/ , https://arynews.tv/whatsapp-android-app-tests-new-chat-bar-layouts-in-latest-beta-update , https://www.money.it/whatsapp-ridisegna-da-zero-le-chat-ecco-come-saranno

## Instagram DMs
- Default theme uses a gradient on sent bubbles; "Direct Classic" gives back the grey look. Colours and gradients come from a fixed preset list (a FAQ page says no custom colour picker, not verified).
- A theme changes the look for everyone in that conversation, and the other person gets a notice. (Sources conflict on whether a theme changes only bubbles or also the background.)
- Seasonal themes (Fall and a few artist themes). Notes bubble with a confetti animation for birthdays.
- Very large corner radius compared with iMessage and WhatsApp (marketing blog, weak source).
- Sources: https://www.howtogeek.com/698074/how-to-change-the-theme-and-accent-color-of-instagram-dms , https://www.bustle.com/life/how-to-change-chat-color-instagram-dms , https://socialsamosa.com/news-2/instagram-introduces-new-feature-dms-7051844

## Facebook Messenger
- "Messenger 4" redesign cut navigation from nine tabs to three (Chats, People, Discover): simpler is better.
- Gradient chat bubbles where the colour gradually changes along the conversation (one report). Chat themes (love, tie-dye) and custom reactions. Suggestion: match colour to mood or topic.
- Swipe right on a contact reveals call and video icons (no reply gesture found in these results).
- Sources: https://www.iphoneincanada.ca/2020/10/13/messenger-logo/ , https://www.nbcnews.com/tech/tech-news/facebook-announces-overhauled-simplified-messenger-app-n923576 , https://www.digitaltrends.com/phones/messenger-4-unveiled/

## General chat UX rules (design guides, vendor blogs)
- Clear sender vs receiver (colour or tails), timestamps and read receipts inside the bubble.
- Typing indicator to avoid people writing over each other. Unread badge plus highlighted chats.
- Keep phone screens uncrowded. Small interactions (reactions, swipe to reply) are what people expect from WhatsApp and Telegram.
- Sources: https://www.okoone.com/spark/product-design-research/how-to-build-messaging-apps-people-actually-want-to-use/ , https://www.cometchat.com/blog/chat-app-design-best-practices , https://uxcel.com/lessons/chat--messaging-best-practices-001

## Ideas worth borrowing for Link-C (all fit bubble A)
1. Gradient that shifts along the chat (Messenger): the gradient is tied to the screen, so older messages are a bit different in hue than new ones.
2. Floating, rounded composer (WhatsApp 2026).
3. Frosted top bar over the chat (WhatsApp glass).
4. Rounder bubbles, media without outline (WhatsApp).
5. Chat list filter chips: All, Unread, Snaps (WhatsApp).
6. Three or four tabs only (Messenger).
7. Gradient theme presets per chat (Instagram). Link-C already has per-chat wallpapers.
8. A tiny celebration (confetti) for special moments such as a birthday sticker.
9. Read ticks and time inside the bubble, typing wave, unread badge.
