/**
 * components/UserPanel.tsx
 *
 * One half of the split screen (either User A or User B).
 *
 * Each panel:
 *  1. Shows a video feed (camera or placeholder)
 *  2. Has a language selector
 *  3. Has a mic toggle button
 *  4. Shows own transcript (what this user said) in grey
 *  5. Shows incoming translated text (what the other user said) in blue
 *  6. Plays translated speech via SpeechSynthesis when a translation arrives
 *
 * Data flow:
 *  Speak → Web Speech API → onResult → socket.emit("speech") → backend
 *  Backend → socket.on("translated") → filter by receiverId → speak via TTS
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getSocket } from "../lib/socket";
import { useSpeechRecognition } from "../lib/useSpeechRecognition";
import { useTTS } from "../lib/useTTS";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TranslatedEvent {
  senderId: string;
  receiverId: string;
  original: string;
  translated: string;
  targetLang: string;
}

interface Message {
  id: number;
  type: "sent" | "received";    // sent = I said it, received = translated to me
  original: string;
  translated?: string;
  lang: string;
}

interface UserPanelProps {
  userId: "userA" | "userB";
  label: string;                // "User A" or "User B"
  defaultLang?: string;
  accentColor: string;          // Tailwind color class for border/header
}

const LANG_OPTIONS = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserPanel({
  userId,
  label,
  defaultLang = "en",
  accentColor,
}: UserPanelProps) {
  const [language, setLanguage] = useState(defaultLang);
  const [micOn, setMicOn] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [interimText, setInterimText] = useState("");
  const [status, setStatus] = useState<"idle" | "listening" | "translating">("idle");

  const videoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);

  const { speak } = useTTS();
  const socket = getSocket();

  // ── Camera setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,  // audio handled separately by Web Speech API
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        console.warn(`[${userId}] Camera not available — showing placeholder`);
      }
    }

    initCamera();

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [userId]);

  // ── Auto-scroll transcript ─────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Speech recognition callback ───────────────────────────────────────────
  // Called with the final transcript when the user stops speaking
  const handleSpeechResult = useCallback(
    (text: string) => {
      setInterimText("");
      setStatus("translating");

      // Add the "sent" message immediately so the speaker can see their text
      const id = ++msgIdRef.current;
      setMessages((prev) => [
        ...prev,
        { id, type: "sent", original: text, lang: language },
      ]);

      // Get the OTHER user's language by reading from their panel's language
      // The backend needs both source and target — we derive target from the
      // global state held in the sibling panel (passed in via otherLang prop
      // in the page, but here we emit with what we know; backend uses its own
      // stored mapping).
      //
      // We emit the event; the backend determines who the receiver is and
      // what their language is based on the senderId.
      socket.emit("speech", {
        senderId: userId,
        text,
        sourceLang: language,
        // targetLang is filled in by the page component (see page.tsx)
        // We use a custom event here so the page can intercept and add it.
        _needsTargetLang: true,
      });
    },
    [language, socket, userId]
  );

  // ── Listen for translated messages from the backend ───────────────────────
  useEffect(() => {
    function handleTranslated(data: TranslatedEvent) {
      // Only process messages meant for THIS panel
      if (data.receiverId !== userId) return;

      setStatus("idle");

      // Add incoming translated message to transcript
      const id = ++msgIdRef.current;
      setMessages((prev) => [
        ...prev,
        {
          id,
          type: "received",
          original: data.original,
          translated: data.translated,
          lang: data.targetLang,
        },
      ]);

      // Play the translated text as speech
      speak(data.translated, data.targetLang);
    }

    socket.on("translated", handleTranslated);
    return () => { socket.off("translated", handleTranslated); };
  }, [userId, socket, speak]);

  // ── Language change: restart recognition with new lang ────────────────────
  // (handled inside useSpeechRecognition hook automatically)

  // ── Mic toggle ─────────────────────────────────────────────────────────────
  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    setStatus(next ? "listening" : "idle");
    if (!next) setInterimText("");
  }

  // ── Activate Web Speech API ────────────────────────────────────────────────
  useSpeechRecognition({
    language,
    enabled: micOn,
    onResult: handleSpeechResult,
    onInterim: setInterimText,
  });

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusBadge = {
    idle: null,
    listening: (
      <span className="inline-flex items-center gap-1 text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
        Listening
      </span>
    ),
    translating: (
      <span className="inline-flex items-center gap-1 text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
        Translating…
      </span>
    ),
  }[status];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full border-2 ${accentColor} rounded-xl overflow-hidden bg-slate-900`}>

      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700`}>
        <span className="font-semibold text-slate-100">{label}</span>
        <div className="flex items-center gap-2">
          {statusBadge}
          {/* Language selector */}
          <select
            className="text-sm bg-slate-700 text-slate-100 border border-slate-600 rounded px-2 py-1 focus:outline-none"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANG_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Video */}
      <div className="relative bg-slate-950 flex items-center justify-center" style={{ height: "200px" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        {/* Fallback avatar when no camera */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-6xl opacity-20 select-none">
            {userId === "userA" ? "👤" : "👥"}
          </div>
        </div>
        {/* Mic status overlay */}
        <div className="absolute bottom-2 left-2">
          {micOn && (
            <span className="text-xs bg-black/60 text-green-400 px-2 py-0.5 rounded-full">
              🎤 Live
            </span>
          )}
        </div>
      </div>

      {/* Mic button */}
      <div className="flex items-center justify-center gap-3 px-4 py-2 bg-slate-800 border-b border-slate-700">
        <button
          onClick={toggleMic}
          className={`px-5 py-1.5 rounded-full text-sm font-medium transition-colors ${
            micOn
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-red-600 hover:bg-red-700 text-white"
          }`}
        >
          {micOn ? "🎤 Stop Mic" : "🎤 Start Mic"}
        </button>
        <span className="text-xs text-slate-400">
          Speaking: <strong className="text-slate-200">{LANG_OPTIONS.find(o => o.value === language)?.label}</strong>
        </span>
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">

        {messages.length === 0 && (
          <p className="text-center text-slate-500 text-sm mt-4">
            Press "Start Mic" and speak…
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-lg px-3 py-2 text-sm max-w-full ${
              msg.type === "sent"
                ? "bg-slate-700 text-slate-200 border-l-2 border-slate-400"
                : "bg-blue-950 text-blue-100 border-l-2 border-blue-500"
            }`}
          >
            {msg.type === "sent" ? (
              <>
                <span className="text-xs text-slate-400 block mb-0.5">You said:</span>
                <p>{msg.original}</p>
              </>
            ) : (
              <>
                <span className="text-xs text-blue-400 block mb-0.5">
                  Received ({LANG_OPTIONS.find(o => o.value === msg.lang)?.label}):
                </span>
                <p className="font-medium">{msg.translated}</p>
                <p className="text-xs text-slate-400 mt-0.5">Original: {msg.original}</p>
              </>
            )}
          </div>
        ))}

        {/* Interim (in-progress) transcript */}
        {interimText && (
          <div className="rounded-lg px-3 py-2 text-sm bg-slate-800 border-l-2 border-yellow-500 opacity-70">
            <span className="text-xs text-yellow-400 block mb-0.5">Hearing…</span>
            <p className="italic text-slate-300">{interimText}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
