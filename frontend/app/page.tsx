/**
 * app/page.tsx
 *
 * The main split-screen page.
 *
 * Layout:
 *   [  User A panel  ] | [  User B panel  ]
 *
 * Cross-language routing:
 *   This page sits between the two panels and manages what language each
 *   user has selected. When User A speaks, we pass User B's current language
 *   as the targetLang to the backend. Vice versa for User B.
 *
 *   The socket "speech" event is intercepted here so we can inject the
 *   target language before forwarding to the backend.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { getSocket } from "../lib/socket";
import { useTTS } from "../lib/useTTS";
import { useSpeechRecognition } from "../lib/useSpeechRecognition";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TranslatedEvent {
  senderId: string;
  receiverId: string;
  original: string;
  translated: string;
  targetLang: string;
}

interface Message {
  id: number;
  type: "sent" | "received";
  original: string;
  translated?: string;
  lang: string;
}

const LANG_OPTIONS = [
  { value: "en", label: "🇬🇧 English" },
  { value: "hi", label: "🇮🇳 Hindi" },
  { value: "ta", label: "🇮🇳 Tamil" },
];

// ── Single panel (inline so page has full control over state) ─────────────────

interface PanelProps {
  userId: "userA" | "userB";
  label: string;
  language: string;
  onLanguageChange: (l: string) => void;
  messages: Message[];
  interimText: string;
  micOn: boolean;
  onToggleMic: () => void;
  accentClass: string;
}

function Panel({
  userId, label, language, onLanguageChange,
  messages, interimText, micOn, onToggleMic, accentClass,
}: PanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 320, height: 240, facingMode: "user" }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => {});
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, interimText]);

  return (
    <div className={`flex flex-col h-full rounded-xl overflow-hidden border-2 ${accentClass} bg-slate-900`}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <span className="font-bold text-slate-100 text-base">{label}</span>
        <select
          className="text-sm bg-slate-700 text-white border border-slate-600 rounded px-2 py-1"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
        >
          {LANG_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Video */}
      <div className="relative bg-black" style={{ height: 180 }}>
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-5xl opacity-10 select-none">{userId === "userA" ? "👤" : "👥"}</span>
        </div>
        {micOn && (
          <span className="absolute bottom-1 left-2 text-xs bg-black/70 text-green-400 px-2 py-0.5 rounded-full">
            🎤 Live
          </span>
        )}
      </div>

      {/* Mic control */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <button
          onClick={onToggleMic}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            micOn ? "bg-green-600 hover:bg-green-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"
          }`}
        >
          {micOn ? "⏹ Stop" : "🎤 Speak"}
        </button>
        <span className="text-xs text-slate-400">
          Lang: <span className="text-slate-200 font-medium">
            {LANG_OPTIONS.find((o) => o.value === language)?.label}
          </span>
        </span>
      </div>

      {/* Transcript area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0 text-sm">
        {messages.length === 0 && !interimText && (
          <p className="text-slate-500 text-center mt-6 text-xs">
            Press <strong>Speak</strong> and start talking…
          </p>
        )}

        {messages.map((m) =>
          m.type === "sent" ? (
            <div key={m.id} className="bg-slate-700 rounded-lg px-3 py-2 border-l-2 border-slate-400">
              <p className="text-xs text-slate-400 mb-0.5">You said:</p>
              <p className="text-slate-100">{m.original}</p>
            </div>
          ) : (
            <div key={m.id} className="bg-blue-950 rounded-lg px-3 py-2 border-l-2 border-blue-500">
              <p className="text-xs text-blue-400 mb-0.5">
                Received ({LANG_OPTIONS.find((o) => o.value === m.lang)?.label}):
              </p>
              <p className="text-blue-100 font-medium">{m.translated}</p>
              <p className="text-xs text-slate-400 mt-0.5">"{m.original}"</p>
            </div>
          )
        )}

        {interimText && (
          <div className="bg-slate-800 rounded-lg px-3 py-2 border-l-2 border-yellow-500 opacity-75">
            <p className="text-xs text-yellow-400 mb-0.5">Hearing…</p>
            <p className="text-slate-300 italic">{interimText}</p>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  // Each user's selected language
  const [langA, setLangA] = useState("en");
  const [langB, setLangB] = useState("hi");

  // Each user's mic state
  const [micA, setMicA] = useState(false);
  const [micB, setMicB] = useState(false);

  // Each user's transcript messages
  const [msgsA, setMsgsA] = useState<Message[]>([]);
  const [msgsB, setMsgsB] = useState<Message[]>([]);

  // Interim (in-progress) speech text
  const [interimA, setInterimA] = useState("");
  const [interimB, setInterimB] = useState("");

  const [connected, setConnected] = useState(false);

  const msgId = useRef(0);
  const socket = getSocket();
  const { speak: speakA } = useTTS();
  const { speak: speakB } = useTTS();

  // ── Socket connection status ───────────────────────────────────────────────
  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    setConnected(socket.connected);
    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, [socket]);

  // ── Listen for translated events ──────────────────────────────────────────
  useEffect(() => {
    function onTranslated(data: TranslatedEvent) {
      const id = ++msgId.current;
      const msg: Message = {
        id,
        type: "received",
        original: data.original,
        translated: data.translated,
        lang: data.targetLang,
      };

      if (data.receiverId === "userA") {
        setMsgsA((p) => [...p, msg]);
        speakA(data.translated, data.targetLang);
      } else {
        setMsgsB((p) => [...p, msg]);
        speakB(data.translated, data.targetLang);
      }
    }

    socket.on("translated", onTranslated);
    return () => { socket.off("translated", onTranslated); };
  }, [socket, speakA, speakB]);

  // ── Speech handlers ───────────────────────────────────────────────────────
  // When User A finishes a sentence:
  const handleSpeechA = (text: string) => {
    setInterimA("");
    const id = ++msgId.current;
    setMsgsA((p) => [...p, { id, type: "sent", original: text, lang: langA }]);
    // Emit with BOTH source (langA) and target (langB — the other user's lang)
    socket.emit("speech", {
      senderId: "userA",
      text,
      sourceLang: langA,
      targetLang: langB,
    });
  };

  // When User B finishes a sentence:
  const handleSpeechB = (text: string) => {
    setInterimB("");
    const id = ++msgId.current;
    setMsgsB((p) => [...p, { id, type: "sent", original: text, lang: langB }]);
    socket.emit("speech", {
      senderId: "userB",
      text,
      sourceLang: langB,
      targetLang: langA,
    });
  };

  // Wire up Web Speech API for each panel
  useSpeechRecognition({
    language: langA,
    enabled: micA,
    onResult: handleSpeechA,
    onInterim: setInterimA,
  });

  useSpeechRecognition({
    language: langB,
    enabled: micB,
    onResult: handleSpeechB,
    onInterim: setInterimB,
  });

  // ── Note: only one mic can be active at once ───────────────────────────────
  // Web Speech API can't reliably run two recognition instances simultaneously.
  // Turning A on turns B off, and vice versa.
  function toggleMicA() {
    const next = !micA;
    setMicA(next);
    if (next) setMicB(false); // stop B
  }

  function toggleMicB() {
    const next = !micB;
    setMicB(next);
    if (next) setMicA(false); // stop A
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-slate-950 overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-white">🌐 TalkBridge</span>
          <span className="text-sm text-slate-400">Multilingual VideoConferencing</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-400" : "bg-red-500 animate-pulse"}`}
          />
          <span className={connected ? "text-green-400" : "text-red-400"}>
            {connected ? "Backend connected" : "Connecting…"}
          </span>
        </div>
      </div>

      {/* Note: only one mic at a time */}
      {(micA || micB) && (
        <div className="bg-yellow-900/40 border-b border-yellow-700 px-4 py-1 text-center text-xs text-yellow-300 shrink-0">
          ℹ️ Only one microphone can be active at a time. The other panel will receive the translation.
        </div>
      )}

      {/* Split panels */}
      <div className="flex flex-1 gap-3 p-3 overflow-hidden">
        <div className="flex-1 min-w-0">
          <Panel
            userId="userA"
            label="User A"
            language={langA}
            onLanguageChange={setLangA}
            messages={msgsA}
            interimText={interimA}
            micOn={micA}
            onToggleMic={toggleMicA}
            accentClass="border-violet-600"
          />
        </div>

        {/* Centre divider */}
        <div className="flex flex-col items-center justify-center shrink-0 gap-2">
          <div className="w-px flex-1 bg-slate-700" />
          <span className="text-slate-500 text-xs rotate-0 writing-mode-vertical select-none px-1">⇄</span>
          <div className="w-px flex-1 bg-slate-700" />
        </div>

        <div className="flex-1 min-w-0">
          <Panel
            userId="userB"
            label="User B"
            language={langB}
            onLanguageChange={setLangB}
            messages={msgsB}
            interimText={interimB}
            micOn={micB}
            onToggleMic={toggleMicB}
            accentClass="border-emerald-600"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 text-center text-xs text-slate-600 py-1 border-t border-slate-800">
        TalkBridge AI | Developed by Vivek Kumar - 24MCA0174
      </div>
    </div>
  );
}
