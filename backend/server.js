/**
 * TalkBridge Backend — server.js
 *
 * Responsibilities:
 *  1. Serve a Socket.io server that both User A and User B connect to
 *  2. Receive transcribed text from one user panel
 *  3. Call Sarvam AI to translate it into the other user's language
 *  4. Emit the translated text back — only to the receiving panel
 *
 * Language codes used throughout:
 *   "en"  →  English
 *   "hi"  →  Hindi
 *   "ta"  →  Tamil
 *
 * Sarvam AI language code mapping (their API uses BCP-47 style codes):
 *   en  →  en-IN
 *   hi  →  hi-IN
 *   ta  →  ta-IN
 */

require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",       // allow the Next.js dev server on any port
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 4000;
const SARVAM_API_KEY = process.env.SARVAM_API_KEY;

// ── Sarvam language code map ──────────────────────────────────────────────────
// Our internal codes (en / hi / ta) → Sarvam BCP-47 codes
const SARVAM_LANG = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
};

/**
 * Translate text using Sarvam AI translate API.
 *
 * @param {string} text       - text to translate
 * @param {string} sourceLang - "en" | "hi" | "ta"
 * @param {string} targetLang - "en" | "hi" | "ta"
 * @returns {Promise<string>} translated text, or original on failure
 */
async function translateWithSarvam(text, sourceLang, targetLang) {
  // No translation needed
  if (sourceLang === targetLang) return text;

  const srcCode = SARVAM_LANG[sourceLang] || "en-IN";
  const tgtCode = SARVAM_LANG[targetLang] || "hi-IN";

  try {
    const response = await axios.post(
      "https://api.sarvam.ai/translate",
      {
        input: text,
        source_language_code: srcCode,
        target_language_code: tgtCode,
        speaker_gender: "Male",
        mode: "formal",
        model: "mayura:v1",
        enable_preprocessing: true,
      },
      {
        headers: {
          "api-subscription-key": SARVAM_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 8000, // 8 second timeout
      }
    );

    const translated = response.data?.translated_text;
    if (!translated) throw new Error("Empty translation response");

    console.log(`[Translate] "${text}" → "${translated}" (${sourceLang}→${targetLang})`);
    return translated;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error(`[Translate] Error (${sourceLang}→${targetLang}):`, detail);
    // Fall back to original text so the UI doesn't silently break
    return text;
  }
}

// ── Socket.io connection handler ──────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  /**
   * Event: "speech"
   *
   * Emitted by a user panel when Web Speech API produces a transcript.
   *
   * Payload:
   * {
   *   senderId:    "userA" | "userB"   — who spoke
   *   text:        string              — what they said
   *   sourceLang:  "en"|"hi"|"ta"     — speaker's language
   *   targetLang:  "en"|"hi"|"ta"     — listener's language
   * }
   */
  socket.on("speech", async (data) => {
    const { senderId, text, sourceLang, targetLang } = data;

    console.log(`[Speech] ${senderId} said: "${text}" [${sourceLang}]`);

    if (!text || !text.trim()) return;

    // Translate (or pass through if same language)
    const translated = await translateWithSarvam(text, sourceLang, targetLang);

    /**
     * Event: "translated"
     *
     * Broadcast to ALL clients in the session.
     * The frontend uses receiverId to decide which panel plays the audio.
     *
     * Payload:
     * {
     *   senderId:     "userA"|"userB"  — who originally spoke
     *   receiverId:   "userA"|"userB"  — who should hear the translation
     *   original:     string           — original transcript
     *   translated:   string           — translated text
     *   targetLang:   "en"|"hi"|"ta"  — language to synthesise in
     * }
     */
    io.emit("translated", {
      senderId,
      receiverId: senderId === "userA" ? "userB" : "userA",
      original: text,
      translated,
      targetLang,
    });
  });

  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ── Health check endpoint ─────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", port: PORT }));

server.listen(PORT, () => {
  console.log(`\nTalkBridge backend running on http://localhost:${PORT}`);
  // console.log(`Sarvam API key: ${SARVAM_API_KEY ? "loaded ✓" : "MISSING ✗"}\n`);
});
