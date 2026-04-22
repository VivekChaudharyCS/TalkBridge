/**
 * lib/useSpeechRecognition.ts
 *
 * Wraps the browser Web Speech API.
 *
 * KEY FIX — sentence accumulation:
 *   Chrome's SpeechRecognition fires isFinal=true on short chunks (2–3 words)
 *   rather than waiting for a full sentence. Without accumulation, each chunk
 *   triggers a separate translation call, so only the first fragment gets
 *   translated and the rest are ignored or sent out of order.
 *
 *   Solution: collect every isFinal chunk into a buffer. Start a 600 ms
 *   debounce timer on each chunk. If no new chunk arrives within 600 ms the
 *   user has paused — fire onResult with the FULL accumulated sentence.
 *   This produces natural sentence-length translations.
 *
 * Other features:
 *  - Continuous listening (auto-restarts after browser's ~60 s timeout)
 *  - Language-aware (restarts with correct BCP-47 code on language change)
 *  - Interim results shown live while the user is still speaking
 */

import { useEffect, useRef, useCallback } from "react";

const SPEECH_LANG_MAP: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
};

// How long to wait after the last final chunk before treating it as a
// complete sentence and firing onResult. 600 ms is a natural speaking pause.
const SENTENCE_DEBOUNCE_MS = 600;

interface Options {
  language: string;
  enabled: boolean;
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
}

export function useSpeechRecognition({
  language,
  enabled,
  onResult,
  onInterim,
}: Options) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const enabledRef     = useRef(enabled);
  const languageRef    = useRef(language);
  const onResultRef    = useRef(onResult);
  const onInterimRef   = useRef(onInterim);

  // Sentence accumulation state
  const sentenceBufferRef  = useRef("");       // collects isFinal chunks
  const debounceTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs current so stale closures always see latest props
  useEffect(() => { enabledRef.current  = enabled;  }, [enabled]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);

  // ── Flush the accumulated sentence buffer ─────────────────────────────────
  const flushBuffer = useCallback(() => {
    const sentence = sentenceBufferRef.current.trim();
    sentenceBufferRef.current = "";
    if (sentence) {
      console.log(`[Speech] Sentence complete: "${sentence}" [${languageRef.current}]`);
      onResultRef.current(sentence);
    }
  }, []);

  // ── Schedule a flush after SENTENCE_DEBOUNCE_MS of silence ────────────────
  const schedulFlush = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(flushBuffer, SENTENCE_DEBOUNCE_MS);
  }, [flushBuffer]);

  // ── Stop recognition ──────────────────────────────────────────────────────
  const stop = useCallback(() => {
    // Flush anything left in the buffer before stopping
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    flushBuffer();

    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    sentenceBufferRef.current = "";
  }, [flushBuffer]);

  // ── Start recognition ─────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.error("[Speech] Web Speech API not supported — use Chrome.");
      return;
    }

    stop(); // clean up any previous instance

    const recognition: SpeechRecognition = new SpeechRecognitionAPI();
    recognitionRef.current   = recognition;
    sentenceBufferRef.current = "";

    recognition.lang            = SPEECH_LANG_MAP[languageRef.current] || "en-IN";
    recognition.continuous      = true;  // keep listening; don't auto-stop
    recognition.interimResults  = true;  // get live partial results for display

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];

        if (result.isFinal) {
          // Append this chunk to the running sentence buffer
          sentenceBufferRef.current += result[0].transcript + " ";
          // Reset the debounce — wait for more chunks or the pause timeout
          schedulFlush();
        } else {
          // Interim: show everything already confirmed + current partial
          interimText += result[0].transcript;
        }
      }

      // Show interim text (already-confirmed buffer + in-progress partial)
      const displayInterim = (sentenceBufferRef.current + interimText).trim();
      if (displayInterim && onInterimRef.current) {
        onInterimRef.current(displayInterim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return;  // normal — user is silent
      if (event.error === "aborted")   return;  // normal — we called stop()
      console.warn("[Speech] Error:", event.error);
    };

    recognition.onend = () => {
      // Auto-restart to handle Chrome's ~60 s timeout and "no-speech" stops
      if (enabledRef.current && recognitionRef.current === recognition) {
        setTimeout(() => {
          if (enabledRef.current) {
            recognition.lang = SPEECH_LANG_MAP[languageRef.current] || "en-IN";
            try { recognition.start(); } catch (_) {}
          }
        }, 200);
      }
    };

    try {
      recognition.start();
      console.log(`[Speech] Started [${recognition.lang}]`);
    } catch (err) {
      console.error("[Speech] Failed to start:", err);
    }
  }, [stop, schedulFlush]);

  // ── Start / stop based on enabled flag ────────────────────────────────────
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [enabled, start, stop]);

  // ── Restart with new language ─────────────────────────────────────────────
  useEffect(() => {
    if (enabled && recognitionRef.current) {
      stop();
      setTimeout(start, 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);
}