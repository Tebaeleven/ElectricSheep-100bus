import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Locale } from "@/lib/i18n/types";

const execFileAsync = promisify(execFile);

export type MailSummary = {
  id: string;
  subject: string;
  sender: string;
  snippet?: string;
};

function asError(err: unknown, locale: Locale) {
  const raw = err instanceof Error ? `${err.message} ${err}` : String(err);
  if (/NOT_RUNNING/i.test(raw)) {
    return locale === "ja"
      ? "メール.app が開いていないよ。開いてからまた言ってね。"
      : "Mail.app isn’t open. Open it, then ask again.";
  }
  const denied = /not authorized|-1743|10002|許可|denied|osascript is not allowed/i.test(
    raw
  );
  if (denied) {
    return locale === "ja"
      ? "メール.app を操作する許可がまだないよ。システム設定のプライバシーで、このアプリからメールを操作してね。"
      : "Mail.app isn’t allowed yet. In Privacy settings, let this app control Mail.";
  }
  return locale === "ja"
    ? "メール.app に届かなかったよ。メールが起動してるか見てみて。"
    : "Couldn’t reach Mail.app. Is Mail running?";
}

async function osascript(source: string, timeoutMs = 12_000) {
  const { stdout } = await execFileAsync("osascript", ["-e", source], {
    timeout: timeoutMs,
    maxBuffer: 2_000_000,
  });
  return stdout.trim();
}

function escapeAS(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function listUnreadMail(locale: Locale): Promise<MailSummary[]> {
  const source = `
tell application "System Events"
  if not (exists process "Mail") then error "NOT_RUNNING"
end tell
tell application "Mail"
  set outLines to {}
  try
    set theMsgs to (messages of inbox whose read status is false)
  on error
    return ""
  end try
  set lim to 12
  set i to 0
  repeat with m in theMsgs
    set i to i + 1
    if i > lim then exit repeat
    set theId to id of m as string
    set theSub to subject of m
    set theFrom to sender of m
    set theContent to content of m
    if (count of theContent) > 180 then
      set theContent to text 1 thru 180 of theContent
    end if
    set end of outLines to theId & tab & theSub & tab & theFrom & tab & theContent
  end repeat
  set AppleScript's text item delimiters to linefeed
  return outLines as string
end tell`;
  try {
    const raw = await osascript(source, 8_000);
    if (!raw) return [];
    return raw
      .split("\n")
      .map((line) => line.split("\t"))
      .filter((parts) => parts[0])
      .map((parts) => ({
        id: parts[0]!.trim(),
        subject: (parts[1] ?? "").trim() || "(no subject)",
        sender: (parts[2] ?? "").trim(),
        snippet: (parts.slice(3).join("\t") ?? "").trim().slice(0, 180),
      }));
  } catch (err) {
    throw new Error(asError(err, locale));
  }
}

export async function readMail(
  id: string,
  locale: Locale
): Promise<{ id: string; subject: string; sender: string; body: string }> {
  const source = `
tell application "Mail"
  set theMsg to first message of inbox whose id is ${Number(id) || 0}
  set theBody to content of theMsg
  if (count of theBody) > 4000 then
    set theBody to text 1 thru 4000 of theBody
  end if
  return (id of theMsg as string) & tab & (subject of theMsg) & tab & (sender of theMsg) & tab & theBody
end tell`;
  try {
    const raw = await osascript(source);
    const parts = raw.split("\t");
    return {
      id: (parts[0] ?? id).trim(),
      subject: (parts[1] ?? "").trim(),
      sender: (parts[2] ?? "").trim(),
      body: parts.slice(3).join("\t").slice(0, 4000),
    };
  } catch (err) {
    throw new Error(asError(err, locale));
  }
}

export async function sendMailReply(args: {
  id: string;
  text: string;
  locale: Locale;
}) {
  const body = escapeAS(args.text);
  const source = `
tell application "Mail"
  set theMsg to first message of inbox whose id is ${Number(args.id) || 0}
  set theReply to reply theMsg without opening window
  tell theReply
    set content to "${body}"
    send
  end tell
end tell`;
  try {
    await osascript(source, 20_000);
    return {
      ok: true,
      posted: true,
      delivered: true,
      id: args.id,
    };
  } catch (err) {
    throw new Error(asError(err, args.locale));
  }
}
