import type { PartyMember, PartyStatus } from "@/data/party";

export function replyToInstruction(
  member: PartyMember,
  text: string
): { status: PartyStatus; say: string } {
  const t = text.trim();
  if (!t) {
    return { status: member.status, say: "もう一回言って？" };
  }
  if (/もう一度|もう一回|再試行|リトライ/.test(t)) {
    return { status: "working", say: "わかった、もう一回やってみる" };
  }
  if (/止めて|停止|やめ/.test(t)) {
    return { status: "stopped", say: "わかった、止まるね" };
  }
  if (/送|投稿|slack|メール/i.test(t)) {
    return {
      status: "need_approval",
      say: "そとにだしていい？",
    };
  }
  return { status: "working", say: `${member.nameJa}: やってみるね` };
}
