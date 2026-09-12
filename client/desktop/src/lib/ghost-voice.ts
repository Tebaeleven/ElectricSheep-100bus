const VOICE_KEY = "ghost.voice.sample.v1";
const WAKE_KEY = "ghost.wake.words.v2";

export function loadWakeWords(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WAKE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((w): w is string => typeof w === "string" && w.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveWakeWords(words: string[]) {
  localStorage.setItem(WAKE_KEY, JSON.stringify(words.map((w) => w.trim()).filter(Boolean)));
}

export function loadVoiceSample(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export function saveVoiceSample(dataUrl: string | null) {
  if (dataUrl) localStorage.setItem(VOICE_KEY, dataUrl);
  else localStorage.removeItem(VOICE_KEY);
}

export function speakMechanical(
  text: string,
  lang: "ja" | "en",
  onEnd?: () => void
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "ja" ? "ja-JP" : "en-US";
  // Slightly lower pitch / slower rate for a soft mechanical feel
  u.pitch = 0.72;
  u.rate = 0.88;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export async function speakReply(
  text: string,
  lang: "ja" | "en",
  onEnd?: () => void
): Promise<void> {
  try {
    const res = await fetch("/api/ghost/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (res.ok && res.status !== 204 && res.headers.get("content-type")?.includes("audio")) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        onEnd?.();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        speakMechanical(text, lang, onEnd);
      };
      await audio.play();
      return;
    }
  } catch {
    /* fall through */
  }
  speakMechanical(text, lang, onEnd);
}
