# TalkBridge — Multilingual Video Call Demo

Split-screen demo: two users, one browser, real-time translation via Sarvam AI.

---

## Folder structure

```
talkbridge/
├── backend/
│   ├── server.js          ← Node.js + Socket.io + Sarvam translation
│   ├── package.json
│   └── .env               ← API key lives here
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx        ← split-screen UI + mic routing logic
    │   └── globals.css
    ├── components/
    │   └── UserPanel.tsx   ← (unused in final, logic merged into page)
    ├── lib/
    │   ├── socket.ts           ← singleton Socket.io client
    │   ├── useSpeechRecognition.ts  ← Web Speech API hook
    │   └── useTTS.ts           ← SpeechSynthesis hook
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── tsconfig.json
```

---

## Setup

### 1. Backend

```bash
cd backend
npm install
# make sure to create .env in backend
# .env already has your Sarvam API key — confirm it's correct
npm run dev
# Server starts on http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# App starts on http://localhost:3000
```

Open **http://localhost:3000** in Chrome.

---

## How to use

1. Open Chrome at `http://localhost:3000`
2. Allow microphone permission when prompted
3. Left panel = User A, Right panel = User B
4. Each panel has its own language dropdown
5. Set User A to "English", User B to "Hindi" (for example)
6. Click **Speak** on User A's panel
7. Say something in English
8. User B's panel will show the Hindi translation and speak it aloud
9. Click **Stop** on User A, then click **Speak** on User B to go the other way

> **Note:** Only one mic can be active at a time. This is a Web Speech API
> limitation in a single browser tab — two simultaneous recognition instances
> fight over the mic. In a real two-user setup (different devices/tabs) both
> could be active at once.

---

## Data flow

```
User A speaks
  └─ Web Speech API (en-IN)
       └─ Final transcript → socket.emit("speech", { senderId, text, sourceLang: "en", targetLang: "hi" })
            └─ Backend receives "speech"
                 └─ Sarvam AI translate: en-IN → hi-IN
                      └─ socket.io.emit("translated", { receiverId: "userB", translated, targetLang: "hi" })
                           └─ Frontend receives "translated"
                                └─ Filter: receiverId === "userB" → update User B's messages
                                     └─ SpeechSynthesis.speak(translated, "hi")
                                          └─ User B hears Hindi speech
```

---

## Language pairs supported

| User A speaks | User B hears |
|---------------|--------------|
| English       | Hindi        |
| English       | Tamil        |
| Hindi         | English      |
| Hindi         | Tamil        |
| Tamil         | English      |
| Tamil         | Hindi        |

Same language selected on both sides → translation is skipped, text passes through as-is.

---

## Common issues

### "Backend connected" stays red
- Make sure backend is running: `cd backend && npm run dev`
- Check port 4000 is not blocked by a firewall

### No speech recognition
- **Must use Chrome** (Firefox does not support Web Speech API)
- Allow microphone permission in the browser address bar
- If recognition stops after ~60 seconds, it auto-restarts — this is normal

### Translation returns the original text unchanged
- Check your Sarvam API key in `backend/.env`
- Look at the backend terminal for `[Translate] Error` messages
- Sarvam free tier has rate limits — wait a moment and try again

### TTS speaks in wrong language / accent
- SpeechSynthesis voices depend on what's installed in your OS
- On Windows: Settings → Time & Language → Language → Add a language (Hindi / Tamil)
- After adding, restart Chrome
- The hook falls back to any available voice if the correct one isn't installed

### Tamil TTS sounds wrong
- Tamil voices are rare on Windows. Install the Tamil language pack or
  accept that Tamil will use a fallback voice while the text is still correct.

### Two mics both active causes garbled recognition
- The UI enforces only one active at a time — clicking Speak on one panel
  automatically stops the other

---

## Architecture notes

- **No WebRTC peer connection is used** — for a single-browser demo, actual
  peer-to-peer video would just connect to itself. Each panel gets its own
  camera stream directly. If you want real two-device video, WebRTC signaling
  via the `/ws/{room}` endpoint (from your existing backend) would be added.

- **Socket.io** is used instead of raw WebSocket because it handles
  reconnection, fallback transports, and broadcast to all clients automatically.

- **Sarvam AI** is called server-side (in Node.js) so the API key is never
  exposed in the browser.
