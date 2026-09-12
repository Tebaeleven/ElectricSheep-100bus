import { NextResponse } from "next/server";
import { stripDataUrl } from "@/lib/desk-actions";

type Body = {
  message?: string;
  lang?: "ja" | "en";
  imageBase64?: string;
  imageMime?: string;
  openedUrls?: string[];
  didScreenshot?: boolean;
};

function ruleReply(message: string, lang: "ja" | "en", ctx: Body): string {
  if (ctx.didScreenshot) {
    return lang === "ja"
      ? "画面、撮れたよ。なにが写ってる？"
      : "Got the screenshot. What’s on it?";
  }
  if (ctx.openedUrls?.length) {
    return lang === "ja" ? "リンク、開いたよ。" : "I opened the link.";
  }

  const raw = message.trim();
  const m = raw.toLowerCase();

  // Greetings first — never answer these with mood/care stock lines.
  if (
    /^(こんにちは|こんにちわ|こんばんは|おはよう|おはようござ|やあ|はろー|ハロー|hi+|hello|hey|good\s*(morning|afternoon|evening))\b/i.test(
      raw
    ) ||
    /^(こんにちは|こんにちわ|こんばんは|おはよう|hi|hello|hey)[!！。．\s]*$/i.test(
      raw
    )
  ) {
    if (/おはよう|morning/i.test(m)) {
      return lang === "ja" ? "おはよう。きょうもそばにいるよ。" : "Good morning. I’m here.";
    }
    if (/こんばんは|evening/i.test(m)) {
      return lang === "ja" ? "こんばんは。きょうはどう？" : "Good evening. How’s it going?";
    }
    return lang === "ja" ? "こんにちは。きょうはどう？" : "Hi! How’s it going?";
  }

  if (/^(ありがとう|ありがと|サンキュー|thanks|thank you)/i.test(raw)) {
    return lang === "ja" ? "どういたしまして。" : "You’re welcome.";
  }

  if (/^(バイバイ|じゃあね|またね|おやすみ|bye|good\s*night)/i.test(raw)) {
    return lang === "ja" ? "またね。いってらっしゃい。" : "See you. Take care.";
  }

  if (/^(だれ|誰|お前|おまえ|きみ|君は|あなたは|who are you)/i.test(raw)) {
    return lang === "ja"
      ? "おばけちゃん。話したり、ちょっと手伝ったりするよ。"
      : "I’m Obake. I chat with you, and I can help a little.";
  }

  if (/[?？]|なに|何|どう|どこ|いつ|なぜ|なんで|教えて|tell me|what|where|when|why|how/.test(m)) {
    return lang === "ja"
      ? "うん、きいたよ。もうすこし具体的に教えて？"
      : "Got it — can you tell me a bit more?";
  }

  if (/つら|つらい|さびし|寂し|sad|alone|lonely|pain/.test(m)) {
    return lang === "ja"
      ? "つらいんだね。そばにいるよ。"
      : "That sounds hard. I’m here with you.";
  }

  if (/げんき|元気|good|fine|great/.test(m) && m.length < 40) {
    return lang === "ja" ? "げんきでよかった。" : "Glad you’re feeling good.";
  }

  if (/^(ふつう|普通|okay|ok|normal)[!！。．\s]*$/i.test(raw)) {
    return lang === "ja" ? "ふつう、だね。また話そう。" : "Okay. We can talk anytime.";
  }

  // Echo-aware default: acknowledge their words instead of a random care line.
  const short = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
  return lang === "ja"
    ? `「${short}」だね。もっと話して？`
    : `You said “${short}”. Tell me more?`;
}

async function llmReply(
  message: string,
  lang: "ja" | "en",
  ctx: Body
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const system =
    lang === "ja"
      ? [
          "あなたはかわいいお化けの対話コンパニオン「おばけちゃん」。",
          "必ずユーザーのいまの発言の内容に直接答える。あいさつにはあいさつで返す。",
          "相手が元気かどうか聞いていないのに「だいじょうぶ」「ゆっくりでいいよ」などのケア定型句を使わない。",
          "短くやさしく日本語で。操縦やモーターの話はしない。",
          "ユーザーのURLはすでにブラウザで開かれていることがある。スクリーンショット画像があれば、写っている内容に短く触れてよい。",
        ].join("")
      : [
          "You are Obake, a cute floating ghost dialogue companion.",
          "Always answer the user’s actual words. Greet when greeted.",
          "Do not use generic care lines like “it’s okay / take your time” unless they sound distressed.",
          "Reply briefly and kindly. Never talk about motors or robot control.",
          "The client may already have opened URLs. If a screenshot is attached, briefly react to what you see.",
        ].join(" ");

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text: message }];

  if (ctx.imageBase64) {
    const { mime, base64 } = stripDataUrl(ctx.imageBase64);
    const useMime = ctx.imageMime || mime || "image/jpeg";
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${useMime};base64,${base64}` },
    });
  }

  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const message = (body.message ?? "").trim();
    const lang = body.lang === "en" ? "en" : "ja";
    if (!message && !body.imageBase64) {
      return NextResponse.json(
        { failed: true, reply: lang === "ja" ? "……。" : "…" },
        { status: 400 }
      );
    }
    const fromLlm = await llmReply(message || "(screenshot)", lang, body);
    const reply = fromLlm ?? ruleReply(message || "(screenshot)", lang, body);
    return NextResponse.json({
      reply,
      failed: false,
      openedUrls: body.openedUrls ?? [],
      didScreenshot: Boolean(body.didScreenshot),
      usedLlm: Boolean(fromLlm),
    });
  } catch {
    return NextResponse.json({ failed: true, reply: "……。" }, { status: 500 });
  }
}
