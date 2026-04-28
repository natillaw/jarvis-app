<div align="center">

# JARVIS

**Just A Rather Very Intelligent System**

An AI-powered voice assistant for your desktop — built with Electron, Express, Groq, and Edge TTS.

![Electron](https://img.shields.io/badge/Electron-41.x-47848F?style=flat-square&logo=electron)
![Node](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=nodedotjs)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

</div>

---

<img width="1128" height="810" alt="image" src="https://github.com/user-attachments/assets/7c72e670-2893-423b-a935-09e2d44666fe" />


## Features

- **Voice input** — speak a command, get a spoken answer
-  **AI chat** — powered by Groq (Llama 3.3 70B)
-  **Text-to-speech** — natural voice via Microsoft Edge TTS
-  **Spotify control** — play, pause, skip, search
-  **System commands** — volume, time/date, shutdown, restart
-  **App launcher** — open any app by voice
-  **Web search** — hands-free Google search
-  **Wake hotkey** — Ctrl+Shift+J to activate anywhere
-  **Auto-launch** — starts with Windows

---

## Requirements

- Node.js 18+
- [SoX](https://sox.sourceforge.net/) (for audio recording — must be in PATH)
- A [Groq API key](https://console.groq.com) (free tier available)

---
<img width="1127" height="812" alt="image" src="https://github.com/user-attachments/assets/b35a2748-c599-40c9-bccc-c699db23fe63" />

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/your-username/jarvis-app.git
cd jarvis-app

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your real API keys (see Configuration below)

# 4. Run
npm start
```

---

## Configuration

Copy `.env.example` to `.env` and fill in your credentials:

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` |  Yes | Get free at [console.groq.com](https://console.groq.com) |
| `SPOTIFY_CLIENT_ID` |  Optional | Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` |  Optional | Spotify Developer Dashboard |
| `SPOTIFY_REDIRECT_URI` |  Optional | Default: `http://127.0.0.1:8888/callback` |
| `PICOVOICE_ACCESS_KEY` |  Optional | For offline wake word detection |

>  **Never commit your `.env` file.** It is already in `.gitignore`.

---

## Spotify Setup (Optional)

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Add `http://127.0.0.1:8888/callback` as a Redirect URI
3. Fill `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env`
4. Run JARVIS and open `http://127.0.0.1:3847/spotify-auth` in your browser
5. Authorize — the refresh token is saved automatically

---

## Voice Commands

| You say | JARVIS does |
|---|---|
| *"Open Chrome"* | Launches Chrome |
| *"Search for weather in Panama"* | Opens Google search |
| *"What time is it?"* | Reads the current time |
| *"Volume up"* | Increases system volume |
| *"Play Daft Punk on Spotify"* | Plays on Spotify |
| *"Next song"* | Skips track |
| *"Shutdown the computer"* | Schedules shutdown in 30s |

---

## Architecture

```
jarvis-app/
├── main.js              # Electron main process + tray + IPC
├── preload.js           # Context bridge (renderer ↔ main)
├── backend/
│   ├── server.js        # Express + WebSocket server (port 3847)
│   ├── router.js        # Intent classification + command routing
│   ├── voice.js         # Mic recording + Whisper transcription
│   ├── wakeword.js      # Continuous wake-word listening loop
│   ├── spotify.js       # Spotify Web API integration
│   ├── apps.js          # App launcher
│   └── system.js        # Volume, shutdown, time/date
├── renderer/
│   └── index.html       # Frontend UI (vanilla JS)
├── config/
│   └── apps.json        # App name → path map
└── assets/
    └── jarvis-icon.png
```

---

## Building

```bash
npm run build
# Output in dist/
```

---

## License

MIT — see [LICENSE](LICENSE)
