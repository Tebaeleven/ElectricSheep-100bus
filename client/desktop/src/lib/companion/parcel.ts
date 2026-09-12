export async function fileToParcel(file: File): Promise<{
  name: string;
  mime: string;
  data: string;
} | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1280;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    let quality = 0.82;
    let blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (blob && blob.size > 650_000) {
      quality = 0.68;
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
    }
    if (!blob || blob.size > 700_000) return null;
    const data = await blobToDataUrl(blob);
    return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", data };
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read"));
    reader.onerror = () => reject(reader.error ?? new Error("read"));
    reader.readAsDataURL(blob);
  });
}
