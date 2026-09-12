import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Locale } from "@/lib/i18n/types";
import type { PetGrants } from "@/lib/grants";
import {
  MAX_LIST,
  MAX_READ,
  MAX_READ_CAP,
  copyFile,
  looksBinary,
  mimeFor,
  movePath,
  processImageFile,
  replaceInFile,
  slidesFromFolder,
  toCsv,
  walkFiles,
  writeBase64,
  writePdfFile,
  writePptxFile,
  writeUtf8,
  type PptxSlideIn,
} from "./files";
import { inspectShellCommand } from "./shell-policy";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = { workspace: 60_000, full_access: 120_000 };

function childEnv(): Record<string, string> {
  const keep = ["PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL", "TERM"];
  const env: Record<string, string> = {};
  for (const key of keep) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

export const DESK_READ_TOOLS = ["list_dir", "read_file", "glob_files"] as const;
export const DESK_ARCHIVE_TOOLS = ["zip_files"] as const;
export const DESK_WRITE_TOOLS = [
  "write_file",
  "append_file",
  "write_json",
  "write_csv",
  "write_pdf",
  "write_pptx",
  "process_image",
  "copy_file",
  "mkdir",
  "move_file",
  "edit_file",
  "zip_files",
  "run_command",
] as const;
export const DESK_TOOLS = [...DESK_READ_TOOLS, ...DESK_WRITE_TOOLS] as const;

export function isDeskTool(name: string) {
  return (DESK_TOOLS as readonly string[]).includes(name);
}

export function isDeskWriteTool(name: string) {
  return (DESK_WRITE_TOOLS as readonly string[]).includes(name);
}

export function isSharedDeskWrite(name: string) {
  return (DESK_ARCHIVE_TOOLS as readonly string[]).includes(name);
}

function normalize(p: string) {
  return path.resolve(p);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function zipArg(rel: string) {
  return rel.startsWith("-") ? `./${rel}` : rel;
}

function commonDir(paths: string[]) {
  if (!paths.length) return "";
  const parts = paths.map((p) => normalize(p).split(path.sep));
  const first = parts[0] ?? [];
  let i = 0;
  while (i < first.length && parts.every((p) => p[i] === first[i])) i += 1;
  if (i === 0) return "";
  const joined = first.slice(0, i).join(path.sep);
  return joined || path.sep;
}

function collectZipSources(args: Record<string, unknown>) {
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) out.push(value.trim());
  };
  if (Array.isArray(args.paths)) for (const p of args.paths) push(p);
  if (Array.isArray(args.files)) for (const p of args.files) push(p);
  push(args.source);
  if (!asString(args.dest)) push(args.path);
  return [...new Set(out)].slice(0, MAX_LIST);
}

export function lexicalInside(target: string, roots: string[]) {
  if (!roots.length) return false;
  const t = normalize(target);
  return roots.some((root) => {
    const r = normalize(root);
    return t === r || t.startsWith(`${r}${path.sep}`);
  });
}

async function realpathDeep(p: string) {
  let cur = normalize(p);
  const tail: string[] = [];
  for (let i = 0; i < 40; i++) {
    try {
      const real = await fs.realpath(cur);
      return tail.length ? path.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) break;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
  return normalize(p);
}

export async function realpathInside(target: string, roots: string[]) {
  const real = await realpathDeep(target);
  const realRoots = await Promise.all(roots.map((root) => realpathDeep(root)));
  if (!lexicalInside(real, realRoots)) return { ok: false as const, path: real };
  return { ok: true as const, path: real };
}

export function pathsFromArgs(
  name: string,
  args: Record<string, unknown>,
  folders: string[]
) {
  const fallback = folders[0] ?? "";
  if (name === "run_command") {
    return [asString(args.cwd) || fallback || process.cwd()];
  }
  if (name === "process_image" || name === "copy_file" || name === "move_file") {
    return [asString(args.source), asString(args.dest)].filter(Boolean);
  }
  if (name === "mkdir" || name === "edit_file") {
    return [asString(args.path) || fallback].filter(Boolean);
  }
  if (name === "zip_files") {
    const out: string[] = [];
    if (Array.isArray(args.paths)) {
      for (const p of args.paths) if (typeof p === "string" && p.trim()) out.push(p.trim());
    }
    if (Array.isArray(args.files)) {
      for (const p of args.files) if (typeof p === "string" && p.trim()) out.push(p.trim());
    }
    if (asString(args.source)) out.push(asString(args.source));
    if (asString(args.path)) out.push(asString(args.path));
    if (asString(args.dest)) out.push(asString(args.dest));
    return out.length ? out : fallback ? [fallback] : [];
  }
  if (name === "write_pdf") {
    return [asString(args.path) || fallback, asString(args.from_file)].filter(
      Boolean
    );
  }
  if (name === "write_pptx") {
    const out: string[] = [];
    if (asString(args.path)) out.push(asString(args.path));
    if (asString(args.from_folder)) out.push(asString(args.from_folder));
    const slides = Array.isArray(args.slides) ? args.slides : [];
    for (const slide of slides) {
      if (!slide || typeof slide !== "object") continue;
      const rec = slide as Record<string, unknown>;
      if (asString(rec.image)) out.push(asString(rec.image));
      if (asString(rec.from_file)) out.push(asString(rec.from_file));
    }
    return out.length ? out : fallback ? [fallback] : [];
  }
  return [asString(args.path) || fallback].filter(Boolean);
}

export function deskCallLeavesWorkspace(
  name: string,
  rawArgs: string,
  grants: PetGrants
) {
  if (!isDeskTool(name)) return false;
  if (grants.sandbox !== "workspace") return false;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    args = {};
  }
  const targets = pathsFromArgs(name, args, grants.folders);
  if (!targets.length) return true;
  return targets.some((target) => !lexicalInside(target, grants.folders));
}

export async function executeDeskTool(
  name: string,
  rawArgs: string,
  grants: PetGrants,
  locale: Locale,
  escape = false
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    args = {};
  }
  const confine = grants.sandbox === "workspace" && !escape;
  const roots = grants.folders;

  const fail = (error: string) => JSON.stringify({ error });
  const deny =
    locale === "ja"
      ? (p: string) => `許可フォルダの外です: ${p}`
      : (p: string) => `Outside granted folders: ${p}`;

  const resolve = async (input: string) => {
    if (!input) {
      return {
        ok: false as const,
        error: locale === "ja" ? "パスが空です" : "Empty path",
      };
    }
    if (!confine) return { ok: true as const, path: normalize(input) };
    if (!roots.length) {
      return {
        ok: false as const,
        error:
          locale === "ja"
            ? "フォルダが渡されていません"
            : "No folder has been granted",
      };
    }
    const checked = await realpathInside(input, roots);
    if (!checked.ok) {
      return { ok: false as const, error: deny(checked.path) };
    }
    return { ok: true as const, path: checked.path };
  };

  try {
    if (name === "list_dir") {
      const input = asString(args.path) || roots[0] || "";
      const resolved = await resolve(input);
      if (!resolved.ok) return fail(resolved.error);
      const entries = await fs.readdir(resolved.path, { withFileTypes: true });
      return JSON.stringify({
        path: resolved.path,
        entries: entries.slice(0, MAX_LIST).map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "dir" : e.isSymbolicLink() ? "symlink" : "file",
        })),
        truncated: entries.length > MAX_LIST,
      });
    }

    if (name === "glob_files") {
      const input = asString(args.path) || roots[0] || "";
      const pattern = asString(args.pattern) || "**/*";
      const resolved = await resolve(input);
      if (!resolved.ok) return fail(resolved.error);
      const files = await walkFiles(resolved.path, pattern, MAX_LIST);
      const kept: string[] = [];
      for (const file of files) {
        const checked = await resolve(file);
        if (checked.ok) kept.push(checked.path);
      }
      return JSON.stringify({
        path: resolved.path,
        pattern,
        files: kept,
        truncated: files.length >= MAX_LIST,
      });
    }

    if (name === "read_file") {
      const resolved = await resolve(asString(args.path));
      if (!resolved.ok) return fail(resolved.error);
      const offset = Math.max(0, Number(args.offset) || 0);
      const want = Math.min(
        MAX_READ_CAP,
        Math.max(1, Number(args.limit) || MAX_READ)
      );
      const buf = await fs.readFile(resolved.path);
      const slice = buf.subarray(offset, offset + want);
      const binary = looksBinary(buf);
      if (binary && asString(args.encoding) !== "base64") {
        return JSON.stringify({
          path: resolved.path,
          binary: true,
          bytes: buf.length,
          mime: mimeFor(resolved.path),
          note:
            locale === "ja"
              ? "バイナリです。加工は process_image / copy_file / write_pptx を使ってください"
              : "Binary file. Use process_image, copy_file, or write_pptx.",
        });
      }
      return JSON.stringify({
        path: resolved.path,
        encoding: binary ? "base64" : "utf8",
        bytes: buf.length,
        offset,
        truncated: offset + slice.length < buf.length,
        content: binary ? slice.toString("base64") : slice.toString("utf8"),
      });
    }

    if (name === "write_file" || name === "append_file") {
      const resolved = await resolve(asString(args.path));
      if (!resolved.ok) return fail(resolved.error);
      const content = typeof args.content === "string" ? args.content : "";
      const encoding = asString(args.encoding) || "utf8";
      const append = name === "append_file" || args.append === true;
      if (encoding === "base64") {
        if (append) return fail("base64 append is not supported");
        return JSON.stringify(await writeBase64(resolved.path, content));
      }
      let text = content;
      if (name === "append_file" && args.timestamp === true) {
        const stamp = new Date().toISOString();
        text = text.endsWith("\n") || text === "" ? text : `${text}\n`;
        text = `[${stamp}] ${text}`;
        if (!text.endsWith("\n")) text += "\n";
      }
      return JSON.stringify(await writeUtf8(resolved.path, text, append));
    }

    if (name === "write_json") {
      const resolved = await resolve(asString(args.path));
      if (!resolved.ok) return fail(resolved.error);
      const pretty = args.pretty !== false;
      const data =
        typeof args.data === "string"
          ? JSON.parse(args.data)
          : (args.data ?? {});
      const body = pretty ? `${JSON.stringify(data, null, 2)}\n` : JSON.stringify(data);
      return JSON.stringify(await writeUtf8(resolved.path, body, false));
    }

    if (name === "write_csv") {
      const resolved = await resolve(asString(args.path));
      if (!resolved.ok) return fail(resolved.error);
      const headers = Array.isArray(args.headers)
        ? args.headers.map((h) => String(h))
        : [];
      const rows = Array.isArray(args.rows)
        ? args.rows.map((row) =>
            Array.isArray(row) ? row.map((c) => String(c ?? "")) : [String(row)]
          )
        : [];
      if (!headers.length) {
        return fail(locale === "ja" ? "headers が空です" : "headers is empty");
      }
      return JSON.stringify(
        await writeUtf8(resolved.path, toCsv(headers, rows), false)
      );
    }

    if (name === "write_pdf") {
      const resolved = await resolve(asString(args.path));
      if (!resolved.ok) return fail(resolved.error);
      let text = typeof args.text === "string" ? args.text : "";
      const fromFile = asString(args.from_file);
      if (fromFile) {
        const src = await resolve(fromFile);
        if (!src.ok) return fail(src.error);
        text = (await fs.readFile(src.path)).toString("utf8");
      }
      if (!text.trim()) {
        return fail(locale === "ja" ? "本文が空です" : "Empty PDF text");
      }
      return JSON.stringify(
        await writePdfFile({
          dest: resolved.path,
          title: asString(args.title) || undefined,
          text,
        })
      );
    }

    if (name === "write_pptx") {
      const destInput =
        asString(args.path) ||
        (asString(args.from_folder)
          ? path.join(asString(args.from_folder), "deck.pptx")
          : "");
      const resolved = await resolve(destInput);
      if (!resolved.ok) return fail(resolved.error);
      let slides: PptxSlideIn[] = [];
      const fromFolder = asString(args.from_folder);
      if (fromFolder) {
        const folder = await resolve(fromFolder);
        if (!folder.ok) return fail(folder.error);
        slides = await slidesFromFolder(folder.path);
      }
      if (Array.isArray(args.slides)) {
        const extra: PptxSlideIn[] = [];
        for (const slide of args.slides) {
          if (!slide || typeof slide !== "object") continue;
          const rec = slide as Record<string, unknown>;
          const image = asString(rec.image);
          const from_file = asString(rec.from_file);
          let imagePath: string | undefined;
          let fromPath: string | undefined;
          if (image) {
            const img = await resolve(image);
            if (!img.ok) return fail(img.error);
            imagePath = img.path;
          }
          if (from_file) {
            const src = await resolve(from_file);
            if (!src.ok) return fail(src.error);
            fromPath = src.path;
          }
          extra.push({
            title: asString(rec.title) || undefined,
            body: typeof rec.body === "string" ? rec.body : undefined,
            image: imagePath,
            from_file: fromPath,
          });
        }
        slides = extra.length ? extra : slides;
      }
      return JSON.stringify(
        await writePptxFile({
          dest: resolved.path.endsWith(".pptx")
            ? resolved.path
            : `${resolved.path}.pptx`,
          title: asString(args.title) || undefined,
          slides,
        })
      );
    }

    if (name === "process_image") {
      const source = await resolve(asString(args.source));
      if (!source.ok) return fail(source.error);
      const dest = await resolve(asString(args.dest) || source.path);
      if (!dest.ok) return fail(dest.error);
      return JSON.stringify(
        await processImageFile({
          source: source.path,
          dest: dest.path,
          width: Number(args.width) || undefined,
          height: Number(args.height) || undefined,
          grayscale: args.grayscale === true,
          rotate: Number(args.rotate) || undefined,
          format: args.format === "jpeg" || args.format === "jpg" ? "jpeg" : args.format === "png" ? "png" : undefined,
          quality: Number(args.quality) || undefined,
        })
      );
    }

    if (name === "copy_file") {
      const source = await resolve(asString(args.source));
      if (!source.ok) return fail(source.error);
      const dest = await resolve(asString(args.dest));
      if (!dest.ok) return fail(dest.error);
      return JSON.stringify(await copyFile(source.path, dest.path));
    }

    if (name === "mkdir") {
      const resolved = await resolve(asString(args.path));
      if (!resolved.ok) return fail(resolved.error);
      await fs.mkdir(resolved.path, { recursive: true });
      return JSON.stringify({ ok: true, path: resolved.path, dir: true });
    }

    if (name === "move_file") {
      const source = await resolve(asString(args.source));
      if (!source.ok) return fail(source.error);
      const destInput = asString(args.dest);
      if (!destInput) {
        return fail(locale === "ja" ? "移動先が空です" : "Empty destination");
      }
      const destResolved = await resolve(destInput);
      if (!destResolved.ok) return fail(destResolved.error);
      let destPath = destResolved.path;
      try {
        const st = await fs.stat(destPath);
        if (st.isDirectory()) {
          destPath = path.join(destPath, path.basename(source.path));
        }
      } catch {
        /* dest does not exist yet */
      }
      if (confine) {
        const checked = await realpathInside(path.dirname(destPath), roots);
        if (!checked.ok) return fail(deny(destPath));
      }
      return JSON.stringify(await movePath(source.path, destPath));
    }

    if (name === "edit_file") {
      const resolved = await resolve(asString(args.path));
      if (!resolved.ok) return fail(resolved.error);
      const oldString = typeof args.old_string === "string" ? args.old_string : "";
      const newString = typeof args.new_string === "string" ? args.new_string : "";
      try {
        return JSON.stringify(
          await replaceInFile(
            resolved.path,
            oldString,
            newString,
            args.replace_all === true
          )
        );
      } catch (err) {
        return fail(err instanceof Error ? err.message : "edit failed");
      }
    }

    if (name === "zip_files") {
      const inputs = collectZipSources(args);
      if (!inputs.length) {
        return fail(
          locale === "ja"
            ? "圧縮するパスが空です"
            : "No paths to zip"
        );
      }

      const resolvedSrc: string[] = [];
      for (const input of inputs) {
        const candidates = path.isAbsolute(input)
          ? [input]
          : roots.length
            ? roots.flatMap((root) => [
                path.join(root, input),
                path.join(root, path.basename(input)),
              ])
            : [path.resolve(input)];
        let lastError =
          locale === "ja" ? `見つかりません: ${input}` : `Not found: ${input}`;
        let found = "";
        for (const candidate of candidates) {
          const resolved = await resolve(candidate);
          if (!resolved.ok) {
            lastError = resolved.error;
            continue;
          }
          try {
            await fs.access(resolved.path);
            found = resolved.path;
            break;
          } catch {
            lastError =
              locale === "ja"
                ? `見つかりません: ${resolved.path}`
                : `Not found: ${resolved.path}`;
          }
        }
        if (!found) return fail(lastError);
        resolvedSrc.push(found);
      }

      const parents = resolvedSrc.map((src) => path.dirname(src));
      const cwd = commonDir(parents);
      if (!cwd || cwd === path.sep) {
        return fail(
          locale === "ja"
            ? "同じ許可フォルダの中だけをまとめてください"
            : "Zip items from the same granted folder"
        );
      }

      const destIn = asString(args.dest);
      const defaultName =
        resolvedSrc.length === 1
          ? `${path.basename(resolvedSrc[0]!)}.zip`
          : locale === "ja"
            ? "アーカイブ.zip"
            : "Archive.zip";
      const grantRoot =
        roots.find((root) =>
          resolvedSrc.every((src) => lexicalInside(src, [root]))
        ) || cwd;
      let destInput = destIn || path.join(cwd, defaultName);
      if (!destInput.toLowerCase().endsWith(".zip")) destInput = `${destInput}.zip`;
      if (!path.isAbsolute(destInput)) destInput = path.join(cwd, destInput);
      if (
        confine &&
        roots.length &&
        !lexicalInside(destInput, roots)
      ) {
        destInput = path.join(grantRoot, defaultName);
      }

      const dest = await resolve(destInput);
      if (!dest.ok) return fail(dest.error);

      const rels: string[] = [];
      for (const src of resolvedSrc) {
        const rel = path.relative(cwd, src);
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
          return fail(
            locale === "ja"
              ? "同じフォルダから圧縮できません"
              : "Cannot zip from different folders"
          );
        }
        rels.push(zipArg(rel));
      }

      try {
        await fs.access("/usr/bin/zip");
      } catch {
        return fail(
          locale === "ja"
            ? "この Mac に zip がありません"
            : "zip is not available on this Mac"
        );
      }

      await fs.mkdir(path.dirname(dest.path), { recursive: true });
      try {
        const st = await fs.lstat(dest.path);
        if (st.isDirectory()) {
          return fail(
            locale === "ja"
              ? "同じ名前のフォルダがあります"
              : "A folder already exists at the zip path"
          );
        }
        await fs.unlink(dest.path);
      } catch {
        /* dest does not exist yet */
      }

      const destRel = path.relative(cwd, dest.path);
      const exclude =
        destRel && !destRel.startsWith("..") && !path.isAbsolute(destRel)
          ? ["-x", zipArg(destRel)]
          : [];
      const timeout =
        grants.sandbox === "full_access" || escape
          ? TIMEOUT_MS.full_access
          : TIMEOUT_MS.workspace;
      try {
        await execFileAsync(
          "/usr/bin/zip",
          ["-r", "-q", dest.path, ...rels, ...exclude],
          {
            cwd,
            timeout,
            maxBuffer: 32 * 1024,
            env: childEnv() as NodeJS.ProcessEnv,
          }
        );
      } catch (err) {
        const e = err as { message?: string; stderr?: string };
        return fail(
          typeof e.stderr === "string" && e.stderr.trim()
            ? e.stderr.trim()
            : e.message || "zip failed"
        );
      }
      const st = await fs.stat(dest.path);
      return JSON.stringify({
        ok: true,
        path: dest.path,
        bytes: st.size,
        files: rels,
      });
    }

    if (name === "run_command") {
      const command = typeof args.command === "string" ? args.command : "";
      if (!command.trim()) {
        return fail(locale === "ja" ? "コマンドが空です" : "Empty command");
      }
      if (grants.sandbox === "read_only") {
        return fail(
          locale === "ja"
            ? "コマンドはフォルダを渡してからにしてね"
            : "Commands need a granted folder first."
        );
      }
      const verdict = inspectShellCommand(command);
      if (verdict.ok === false && (verdict.fatal || !escape)) {
        return fail(
          locale === "ja" && verdict.fatal
            ? `そのコマンドは使えないよ。${verdict.reason}`
            : verdict.reason
        );
      }
      const cwdInput =
        asString(args.cwd) || roots[0] || process.cwd();
      const resolved = await resolve(cwdInput);
      if (!resolved.ok) return fail(resolved.error);
      const timeout =
        grants.sandbox === "full_access" || escape
          ? TIMEOUT_MS.full_access
          : TIMEOUT_MS.workspace;
      const shell = process.env.SHELL || "/bin/zsh";
      try {
        const { stdout, stderr } = await execFileAsync(shell, ["-lc", command], {
          cwd: resolved.path,
          timeout,
          maxBuffer: 32 * 1024,
          env: childEnv() as NodeJS.ProcessEnv,
        });
        return JSON.stringify({
          ok: true,
          cwd: resolved.path,
          stdout: stdout.slice(0, 32 * 1024),
          stderr: stderr.slice(0, 32 * 1024),
        });
      } catch (err) {
        const e = err as {
          message?: string;
          stdout?: string;
          stderr?: string;
          killed?: boolean;
        };
        return JSON.stringify({
          ok: false,
          cwd: resolved.path,
          timeout: Boolean(e.killed),
          error: e.message,
          stdout: typeof e.stdout === "string" ? e.stdout.slice(0, 32 * 1024) : "",
          stderr: typeof e.stderr === "string" ? e.stderr.slice(0, 32 * 1024) : "",
        });
      }
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : "desk tool failed");
  }

  return fail(
    locale === "ja"
      ? `ツール ${name} はこのライセンスにありません`
      : `Tool ${name} is not on this license`
  );
}
