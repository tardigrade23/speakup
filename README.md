# SpeakUp: AI English conversation partner

An installable web app (PWA) for daily spoken-English practice with an AI partner. The interface is in Azerbaijani.

Live: `https://tardigrade23.github.io/speakup/`

## Features

- **Talk:** pick a level (A2–C1) and a scenario (free talk, my day, job interview, tech talk, travel, restaurant, small talk, shopping, doctor, storytelling, debate). Tap the mic and speak English; the browser turns speech into text (Web Speech API, `en-US`) and sends it when you stop. You can also type, or use the keyboard's dictation.
- **Listen:** replies are read aloud with the phone's English voice (speechSynthesis), with a slow replay button. Voice and speed are in Settings.
- **Corrections:** after each message the app shows up to 3 corrections of what you said, explained in Azerbaijani (or English, Turkish, Russian), a 💡 example of what to say next, and new words, which are saved to the *Sözlər* (words) screen.
- **Feedback:** *Bitir* (finish) scores fluency, grammar and vocabulary, estimates your CEFR level, and lists strengths, what to work on and phrases to practise. Past conversations are under *Tarixçə* (history).
- **Daily habit:** a daily goal in minutes (5–30) and a streak of days with at least one minute of practice. Progress is stored on the device only.

## Install on a phone

- **Android / Chrome:** open the site → menu ⋮ → *Install app*.
- **iPhone / Safari:** Share → *Add to Home Screen*. Speech recognition may not work inside a Home Screen app on iOS; use the keyboard's mic (English) instead.

## How it works

| Part | File |
|---|---|
| App (no build step) | `index.html`, `app.js`, `style.css` |
| PWA | `manifest.webmanifest`, `sw.js` (network-first, offline fallback), `icons/` |
| AI | `supabase/functions/english-coach/index.ts`: Supabase Edge Function that calls Claude (`claude-opus-5-5`, low effort for chat turns, structured JSON output, server-side refusal fallback) |

The function runs in the Supabase project **speakup** (`brrisogdhhzxpxgskbjh`). The API key stays on the server.

Function secrets (Supabase dashboard → Edge Functions → Secrets):

- `ANTHROPIC_API_KEY`: required, from platform.claude.com.
- `APP_PASSCODE`: recommended. The function then answers only requests that carry this code, so nobody else can spend your API credit. Enter the same code in the app under *Ayarlar → Giriş kodu*.

## Deploy

- **App:** `.github/workflows/deploy-pages.yml` publishes to GitHub Pages on every push to the default branch. One-time: repository **Settings → Pages → Source: GitHub Actions**.
- **AI function:** `.github/workflows/deploy-function.yml` redeploys it when the function changes. It needs repository secrets `SUPABASE_ACCESS_TOKEN` (supabase.com/dashboard/account/tokens) and `ANTHROPIC_API_KEY`, plus optional `APP_PASSCODE`; it also stores those as function secrets. Or by hand: `supabase functions deploy english-coach --project-ref brrisogdhhzxpxgskbjh`.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
