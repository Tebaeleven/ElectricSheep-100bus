import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";

export const MAX_LIST = 300;
export const MAX_READ = 512 * 1024;
export const MAX_READ_CAP = 2 * 1024 * 1024;
export const MAX_WRITE = 8 * 1024 * 1024;
export const MAX_PDF_CHARS = 400_000;
export const MAX_PPTX_SLIDES = 80;

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff"]);
const TEXT_EXT = new Set([".txt", ".md", ".csv", ".json", ".log", ".tsv"]);

export function looksBinary(buf: Buffer) {
  const n = Math.min(buf.length, 800);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export function mimeFor(file: string) {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".csv": "text/csv",
      ".log": "text/plain",
      ".pdf": "application/pdf",
      ".pptx":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    }[ext] ?? "application/octet-stream"
  );
}

export function globMatch(rel: string, pattern: string) {
  const name = rel.replace(/\\/g, "/");
  const pat = pattern.trim() || "**/*";
  const body = pat.startsWith("**/") ? pat.slice(3) : pat;
  const brace = body.match(/^(.*)\.\{([^}]+)\}$/);
  const alts = brace
    ? brace[2]!.split(",").map((e) => `${brace[1]}.${e.trim()}`)
    : [body];
  return alts.some((alt) => {
    const re = new RegExp(
      `^${alt.replace(/\./g, "\\.").replace(/\*/g, "[^/]*")}$`,
      "i"
    );
    return re.test(name) || re.test(path.basename(name));
  });
}

export async function walkFiles(root: string, pattern: string, cap = MAX_LIST) {
  const out: string[] = [];
  const walk = async (dir: string) => {
    if (out.length >= cap) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= cap) return;
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(root, full);
      if (globMatch(rel, pattern)) out.push(full);
    }
  };
  const st = await fs.stat(root);
  if (st.isFile()) {
    if (globMatch(path.basename(root), pattern)) out.push(root);
    return out;
  }
  await walk(root);
  return out;
}

export async function writeUtf8(
  dest: string,
  content: string,
  append: boolean
) {
  if (Buffer.byteLength(content, "utf8") > MAX_WRITE) {
    throw new Error(`Content exceeds ${MAX_WRITE} bytes`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (append) await fs.appendFile(dest, content, "utf8");
  else await fs.writeFile(dest, content, "utf8");
  const st = await fs.stat(dest);
  return { ok: true, path: dest, bytes: st.size, appended: append };
}

export async function writeBase64(dest: string, b64: string) {
  const buf = Buffer.from(b64, "base64");
  if (buf.length > MAX_WRITE) {
    throw new Error(`Content exceeds ${MAX_WRITE} bytes`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buf);
  return { ok: true, path: dest, bytes: buf.length, encoding: "base64" };
}

export function toCsv(headers: string[], rows: string[][]) {
  const esc = (cell: string) => {
    if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((row) => row.map((c) => esc(String(c ?? ""))).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

async function pickPdfFont() {
  if (process.env.PETASSIST_PDF_FONT) {
    try {
      await fs.access(process.env.PETASSIST_PDF_FONT);
      return process.env.PETASSIST_PDF_FONT;
    } catch {
      /* fall through */
    }
  }
  const known = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
  ];
  for (const file of known) {
    try {
      await fs.access(file);
      return file;
    } catch {
      /* next */
    }
  }
  try {
    const dir = "/System/Library/Fonts";
    const names = await fs.readdir(dir);
    const hit = names.find((n) => n.includes("W3") && n.includes("ttc") && n.includes("角"));
    if (hit) return path.join(dir, hit);
  } catch {
    /* ignore */
  }
  return null;
}

export async function writePdfFile(opts: {
  dest: string;
  title?: string;
  text: string;
}) {
  const { default: PDFDocument } = await import("pdfkit");
  const body =
    opts.text.length > MAX_PDF_CHARS
      ? `${opts.text.slice(0, MAX_PDF_CHARS)}\n\n[truncated]`
      : opts.text;
  await fs.mkdir(path.dirname(opts.dest), { recursive: true });
  const doc = new PDFDocument({ size: "A4", margin: 56, autoFirstPage: true });
  const stream = createWriteStream(opts.dest);
  doc.pipe(stream);
  const font = await pickPdfFont();
  if (font) doc.font(font);
  if (opts.title?.trim()) {
    doc.fontSize(18).text(opts.title.trim(), { align: "left" });
    doc.moveDown(0.6);
  }
  doc.fontSize(11).text(body, { align: "left" });
  doc.end();
  await once(stream, "finish");
  const st = await fs.stat(opts.dest);
  return { ok: true, path: opts.dest, bytes: st.size, font: font ?? "Helvetica" };
}

export type PptxSlideIn = {
  title?: string;
  body?: string;
  image?: string;
  from_file?: string;
};

export async function slidesFromFolder(folder: string) {
  const files = await walkFiles(folder, "*.{txt,md,png,jpg,jpeg}", MAX_LIST);
  const groups = new Map<string, { text?: string; image?: string }>();
  const order: string[] = [];
  for (const file of files.sort()) {
    const ext = path.extname(file).toLowerCase();
    const stem = path.basename(file, ext);
    if (!groups.has(stem)) {
      groups.set(stem, {});
      order.push(stem);
    }
    const row = groups.get(stem)!;
    if (TEXT_EXT.has(ext) || ext === ".md") row.text = file;
    if (IMAGE_EXT.has(ext)) row.image = file;
  }
  const slides: PptxSlideIn[] = [];
  for (const stem of order) {
    const row = groups.get(stem)!;
    let body = "";
    if (row.text) {
      const buf = await fs.readFile(row.text);
      body = buf.subarray(0, 32 * 1024).toString("utf8");
    }
    slides.push({
      title: stem,
      body: body || undefined,
      image: row.image,
    });
  }
  return slides;
}

export async function writePptxFile(opts: {
  dest: string;
  title?: string;
  slides: PptxSlideIn[];
}) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const slides = opts.slides.slice(0, MAX_PPTX_SLIDES);
  if (!slides.length) throw new Error("No slides to write");
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = opts.title || path.basename(opts.dest, ".pptx");
  pres.author = "Petassist";
  for (const spec of slides) {
    const slide = pres.addSlide();
    const title = spec.title?.trim() || "";
    let body = spec.body ?? "";
    if (spec.from_file) {
      const buf = await fs.readFile(spec.from_file);
      body = buf.subarray(0, 32 * 1024).toString("utf8");
    }
    if (title) {
      slide.addText(title, {
        x: 0.45,
        y: 0.28,
        w: 12.4,
        h: 0.55,
        fontSize: 22,
        bold: true,
        color: "302c55",
      });
    }
    const y0 = title ? 1.0 : 0.4;
    if (spec.image && body.trim()) {
      slide.addImage({ path: spec.image, x: 0.45, y: y0, w: 6.3, h: 5.6 });
      slide.addText(body, {
        x: 6.95,
        y: y0,
        w: 5.9,
        h: 5.6,
        fontSize: 14,
        color: "302c55",
        valign: "top",
      });
    } else if (spec.image) {
      slide.addImage({ path: spec.image, x: 0.9, y: y0, w: 11.5, h: 5.8 });
    } else {
      slide.addText(body || title || " ", {
        x: 0.55,
        y: y0,
        w: 12.2,
        h: 5.8,
        fontSize: 16,
        color: "302c55",
        valign: "top",
      });
    }
  }
  await fs.mkdir(path.dirname(opts.dest), { recursive: true });
  await pres.writeFile({ fileName: opts.dest });
  const st = await fs.stat(opts.dest);
  return { ok: true, path: opts.dest, bytes: st.size, slides: slides.length };
}

export async function processImageFile(opts: {
  source: string;
  dest: string;
  width?: number;
  height?: number;
  grayscale?: boolean;
  rotate?: number;
  format?: "png" | "jpeg";
  quality?: number;
}) {
  const { Jimp } = await import("jimp");
  const image = await Jimp.read(opts.source);
  const w = opts.width && opts.width > 0 ? Math.round(opts.width) : 0;
  const h = opts.height && opts.height > 0 ? Math.round(opts.height) : 0;
  if (w && h) image.resize({ w, h });
  else if (w) {
    image.resize({ w, h: Math.max(1, Math.round(image.height * (w / image.width))) });
  } else if (h) {
    image.resize({ w: Math.max(1, Math.round(image.width * (h / image.height))), h });
  }
  if (opts.grayscale) image.greyscale();
  if (opts.rotate) image.rotate(opts.rotate);
  let dest = opts.dest;
  if (opts.format === "jpeg" && !/\.jpe?g$/i.test(dest)) {
    dest = dest.replace(/\.[^.]+$/, "") + ".jpg";
  }
  if (opts.format === "png" && !/\.png$/i.test(dest)) {
    dest = dest.replace(/\.[^.]+$/, "") + ".png";
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (opts.format === "jpeg" || /\.jpe?g$/i.test(dest)) {
    const quality = Math.min(100, Math.max(30, opts.quality ?? 85));
    const buf = await image.getBuffer("image/jpeg", { quality });
    await fs.writeFile(dest, buf);
  } else {
    if (!path.extname(dest)) dest = `${dest}.png`;
    await image.write(dest as `${string}.${string}`);
  }
  const st = await fs.stat(dest);
  return {
    ok: true,
    path: dest,
    bytes: st.size,
    width: image.width,
    height: image.height,
  };
}

export async function copyFile(source: string, dest: string) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(source, dest);
  const st = await fs.stat(dest);
  return { ok: true, path: dest, bytes: st.size };
}

export async function movePath(source: string, dest: string) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.rename(source, dest);
  } catch {
    await fs.copyFile(source, dest);
    await fs.rm(source, { recursive: true, force: true });
  }
  const st = await fs.stat(dest);
  return { ok: true, path: dest, bytes: st.size, moved: true };
}

export async function replaceInFile(
  dest: string,
  oldString: string,
  newString: string,
  replaceAll = false
) {
  if (!oldString) throw new Error("old_string is empty");
  const text = await fs.readFile(dest, "utf8");
  const hits = text.split(oldString).length - 1;
  if (hits === 0) {
    throw new Error("old_string was not found in the file");
  }
  if (!replaceAll && hits > 1) {
    throw new Error(`old_string matched ${hits} times; pass replace_all or a unique snippet`);
  }
  const next = replaceAll
    ? text.split(oldString).join(newString)
    : text.replace(oldString, newString);
  await fs.writeFile(dest, next, "utf8");
  const st = await fs.stat(dest);
  return { ok: true, path: dest, bytes: st.size, replacements: replaceAll ? hits : 1 };
}
