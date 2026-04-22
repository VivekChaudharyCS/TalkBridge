/**
 * lib/useTTS.ts
 *
 * Hook that wraps the browser SpeechSynthesis API.
 *
 * Key behaviours:
 *  - Picks the best available voice for the target language
 *  - Queues utterances so they don't overlap
 *  - Cancels any in-progress speech before playing a new one
 *    (important for demo — you don't want old translations queuing up)
 */

import { useCallback, useRef } from "react";

// BCP-47 language tags used to match SpeechSynthesis voices
const TTS_LANG_MAP: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
};

// Fallback lang tags if the primary isn't available
const TTS_FALLBACK: Record<string, string> = {
  en: "en-US",
  hi: "hi",
  ta: "ta",
};

/**
 * Find the best matching voice for a language code.
 * Tries exact match first, then prefix match, then any available voice.
 */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const primary = TTS_LANG_MAP[lang] || "en-IN";
  const fallback = TTS_FALLBACK[lang] || "en";

  // 1. Exact match (e.g. "hi-IN")
  let voice = voices.find((v) => v.lang === primary) ?? null;
  // 2. Prefix match (e.g. "hi")
  if (!voice) voice = voices.find((v) => v.lang.startsWith(fallback)) ?? null;
  // 3. Any voice as last resort
  if (!voice) voice = voices[0] ?? null;

  return voice;
}

export function useTTS() {
  const speakingRef = useRef(false);

  const speak = useCallback((text: string, lang: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("[TTS] SpeechSynthesis not available");
      return;
    }
    if (!text.trim()) return;

    // Cancel any current speech immediately
    window.speechSynthesis.cancel();
    speakingRef.current = false;

    const utterance = new SpeechSynthesisUtterance(text);

    // Voices may not be loaded yet — wait for them
    const assignVoiceAndSpeak = () => {
      const voice = pickVoice(lang);
      utterance.lang = TTS_LANG_MAP[lang] || "en-IN";
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.rate = 0.95;   // slightly slower — easier to follow in demo
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => { speakingRef.current = true; };
      utterance.onend = () => { speakingRef.current = false; };
      utterance.onerror = (e) => {
        speakingRef.current = false;
        // "interrupted" is normal when cancel() is called
        if (e.error !== "interrupted") {
          console.warn("[TTS] Error:", e.error);
        }
      };

      console.log(
        `[TTS] Speaking: "${text}" [${utterance.lang}]` +
        (voice ? ` voice: ${voice.name}` : " (no matching voice)")
      );

      window.speechSynthesis.speak(utterance);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      assignVoiceAndSpeak();
    } else {
      // Voices load asynchronously on first access
      window.speechSynthesis.addEventListener("voiceschanged", assignVoiceAndSpeak, {
        once: true,
      });
    }
  }, []);

  return { speak };
}
