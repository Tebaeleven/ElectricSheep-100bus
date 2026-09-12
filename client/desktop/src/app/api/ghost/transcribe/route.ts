import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  audioBase64?: string;
  mime?: string;
  lang?: "ja" | "en";
};

export async function POST(req: Request) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY missing", text: "" },
        { status: 503 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let bytes: Buffer;
    let mime = "audio/webm";
    let lang: "ja" | "en" = "ja";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("audio");
      const langField = form.get("lang");
      if (langField === "en") lang = "en";
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "audio required", text: "" },
          { status: 400 }
        );
      }
      mime = file.type || "audio/webm";
      bytes = Buffer.from(await file.arrayBuffer());
    } else {
      const body = (await req.json()) as Body;
      if (body.lang === "en") lang = "en";
      if (body.mime) mime = body.mime;
      const raw = (body.audioBase64 || "").replace(/^data:[^;]+;base64,/, "");
      if (!raw) {
        return NextResponse.json(
          { ok: false, error: "audio required", text: "" },
          { status: 400 }
        );
      }
      bytes = Buffer.from(raw, "base64");
    }

    if (!bytes.length) {
      return NextResponse.json(
        { ok: false, error: "empty audio", text: "" },
        { status: 400 }
      );
    }

    const ext = mime.includes("mp4") || mime.includes("m4a")
      ? "m4a"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("wav")
          ? "wav"
          : "webm";
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(bytes)], { type: mime }),
      `speech.${ext}`
    );
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1");
    form.append("language", lang === "en" ? "en" : "ja");

    const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );
    const res = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `transcribe ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ""}`,
          text: "",
        },
        { status: 502 }
      );
    }
    const data = (await res.json()) as { text?: string };
    const text = (data.text || "").trim();
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "transcribe failed",
        text: "",
      },
      { status: 500 }
    );
  }
}
