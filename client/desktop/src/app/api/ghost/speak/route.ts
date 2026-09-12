import { NextResponse } from "next/server";

type Body = { text?: string; lang?: "ja" | "en" };

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json({ skipped: true }, { status: 204 });
  }
  try {
    const body = (await req.json()) as Body;
    const text = (body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }
    const voiceId =
      process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
        }),
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "tts_failed" }, { status: 502 });
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "tts_error" }, { status: 500 });
  }
}
