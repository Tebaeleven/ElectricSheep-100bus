/** Mic permission + MediaRecorder helpers for Electron / browser. */

let heldStream: MediaStream | null = null;

export type MicReady =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "unsupported" | "denied" | "error"; detail?: string };

export async function ensureMicPermission(): Promise<boolean> {
  const ready = await readyMicStream();
  return ready.ok;
}

export async function readyMicStream(): Promise<MicReady> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "unsupported" };
  }

  // Ask Electron main first (shows OS prompt when status is "not-determined").
  try {
    const bridge = window.petassist;
    if (bridge?.requestMic) {
      const res = await bridge.requestMic();
      if (!res?.ok) {
        return { ok: false, reason: "denied", detail: res?.status };
      }
    }
  } catch {
    /* continue to getUserMedia */
  }

  try {
    if (heldStream?.getAudioTracks().some((t) => t.readyState === "live")) {
      return { ok: true, stream: heldStream };
    }
    heldStream?.getTracks().forEach((t) => t.stop());
    heldStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    return { ok: true, stream: heldStream };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const denied = /Permission|NotAllowed|denied/i.test(detail);
    return {
      ok: false,
      reason: denied ? "denied" : "error",
      detail,
    };
  }
}

export function releaseMicPermission() {
  heldStream?.getTracks().forEach((t) => t.stop());
  heldStream = null;
}

export function pickRecorderMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const mime of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(mime)
    ) {
      return mime;
    }
  }
  return "audio/webm";
}

export async function transcribeBlob(
  blob: Blob,
  lang: "ja" | "en"
): Promise<{ ok: boolean; text: string; error?: string }> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  const audioBase64 = btoa(binary);
  const res = await fetch("/api/ghost/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64,
      mime: blob.type || "audio/webm",
      lang,
    }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    text?: string;
    error?: string;
  };
  return {
    ok: Boolean(data.ok && data.text?.trim()),
    text: (data.text || "").trim(),
    error: data.error,
  };
}
