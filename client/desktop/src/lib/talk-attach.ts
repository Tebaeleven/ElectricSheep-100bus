import type { TalkAttachment } from "@/lib/talk";

const MAX_EDGE = 1280;
const MAX_ATTACH = 4;

export function newAttachId() {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function fileToAttachment(file: File): Promise<TalkAttachment> {
  if (file.type.startsWith("image/")) {
    const dataUrl = await compressImageFile(file);
    return {
      id: newAttachId(),
      name: file.name || "image",
      mime: "image/jpeg",
      kind: "image",
      dataUrl,
    };
  }
  const text = await readTextFile(file);
  return {
    id: newAttachId(),
    name: file.name || "file",
    mime: file.type || "application/octet-stream",
    kind: "file",
    text,
  };
}

export async function dataUrlToAttachment(
  dataUrl: string,
  name = "image"
): Promise<TalkAttachment> {
  return {
    id: newAttachId(),
    name,
    mime: "image/jpeg",
    kind: "image",
    dataUrl: dataUrl.startsWith("data:")
      ? dataUrl
      : await urlToJpegDataUrl(dataUrl),
    url: dataUrl.startsWith("data:") ? undefined : dataUrl,
  };
}

export function attachmentPayload(atts: TalkAttachment[]) {
  return atts.slice(0, MAX_ATTACH).map((att) => ({
    id: att.id,
    name: att.name,
    mime: att.mime,
    kind: att.kind,
    dataUrl: att.dataUrl,
    url: att.url,
    text: att.text?.slice(0, 8000),
  }));
}

export function imagePayloads(atts: TalkAttachment[]) {
  return atts
    .filter((att) => att.kind === "image")
    .map((att) => {
      const data = att.dataUrl?.includes(",")
        ? att.dataUrl.slice(att.dataUrl.indexOf(",") + 1)
        : undefined;
      const artifactId = artifactIdFromUrl(att.url ?? att.dataUrl ?? "");
      return {
        mime: att.mime || "image/jpeg",
        data,
        id: artifactId,
      };
    })
    .filter((row) => row.data || row.id);
}

function artifactIdFromUrl(url: string) {
  try {
    const parsed = new URL(url, "http://127.0.0.1");
    return parsed.searchParams.get("id") ?? undefined;
  } catch {
    return undefined;
  }
}

async function compressImageFile(file: File) {
  const src = await fileToDataUrl(file);
  return compressDataUrl(src);
}

async function urlToJpegDataUrl(url: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const src = await fileToDataUrl(new File([blob], "image", { type: blob.type }));
  return compressDataUrl(src);
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function compressDataUrl(src: string) {
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(src);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

async function readTextFile(file: File) {
  const looksText =
    file.type.startsWith("text/") ||
    /json|csv|markdown|xml|javascript|typescript/i.test(file.type) ||
    /\.(txt|md|csv|json|html|css|js|ts|py)$/i.test(file.name);
  if (!looksText || file.size > 200_000) return undefined;
  const raw = await file.text();
  return raw.slice(0, 8000);
}
