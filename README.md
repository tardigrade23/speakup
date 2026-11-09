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
| AI | `supabase/functions/english-coach/index.ts`: Supabase Edge Function that calls Google Gemini (free tier, Flash models, JSON output) when `GEMINI_API_KEY` is set, otherwise Claude (`claude-opus-5-5`, paid API credit) |

The function runs in the Supabase project **speakup** (`brrisogdhhzxpxgskbjh`). The API key stays on the server.

- AI key (Supabase dashboard → Edge Functions → Secrets), the first one set wins:
  - `GEMINI_API_KEY`: free, from aistudio.google.com → Get API key. The function tries `GEMINI_MODEL` (optional), then `gemini-flash-latest`, `gemini-3.5-flash`, `gemini-3-flash-preview` and `gemini-2.5-flash`, moving on when a model is missing or its free quota is used up. On the free tier Google may use the conversations to improve its models.
  - `ANTHROPIC_API_KEY`: Claude, from platform.claude.com; needs API credit, which a Claude Pro subscription does not include.
- **Passcode:** the function answers only requests that carry the code stored in `public.app_config` (key `passcode`), so nobody else can spend the API credit. The table has row level security on and no policies, so only the service role can read it. Enter the code in the app under *Ayarlar → Giriş kodu*. To change it: `update public.app_config set value = '...' where key = 'passcode';`

## Deploy

- **App:** `.github/workflows/deploy-pages.yml` copies the site to the `gh-pages` branch on every push to `main`; GitHub Pages serves that branch.
- **AI function:** `supabase functions deploy english-coach --project-ref brrisogdhhzxpxgskbjh` (or through the Supabase dashboard / MCP).
- **Database:** `supabase/migrations/` (the `app_config` table).

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
