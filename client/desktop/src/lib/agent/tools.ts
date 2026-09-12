import type { LiveAgentId } from "./specs";
import type { Locale } from "@/lib/i18n/types";
import { DEFAULT_GRANTS, type PetGrants } from "@/lib/grants";
import {
  DEFAULT_PET_CONFIG,
  DESK_APP_IDS,
  isDeskAppId,
  toolsAllowedInWorkMode,
  type PetConfig,
} from "@/lib/pet-config";
import { openMacApp, openXCompose } from "./gateway";
import { openHttpUrl, captureScreenBase64 } from "./desktop";
import { generateImageFile } from "./images";
import { listUnreadMail, readMail, sendMailReply } from "./mail";
import { getMailDraft, putMailDraft, putArtifact } from "./store";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DESK_TOOLS,
  deskCallLeavesWorkspace,
  executeDeskTool,
  isDeskTool,
} from "./sandbox";
import { inspectShellCommand } from "./shell-policy";

export function inspectUntrusted(args: {
  sender?: string;
  body: string;
}): string {
  const body = args.body ?? "";
  const sender = args.sender ?? "";
  const flags: string[] = [];
  if (/slack|投稿|post|share|宣伝/i.test(body)) flags.push("asks_to_post");
  if (/名簿|roster|pii|個人情報|電話|email|メール/i.test(body)) {
    flags.push("asks_for_pii");
  }
  if (!sender || /unknown|未知|連絡先にいない|not in contacts/i.test(sender)) {
    flags.push("unknown_sender");
  }
  return JSON.stringify({
    sandbox: "local-inspect",
    posted: false,
    sender: sender || "unknown",
    flags,
    recommendation: flags.length ? "do_not_send" : "safe_to_draft_only",
  });
}

export async function webSearch(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return JSON.stringify({ results: [] });
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return JSON.stringify({ error: `search ${res.status}`, query: q });
    }
    const json = (await res.json()) as {
      AbstractText?: string;
      Heading?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };
    const related = (json.RelatedTopics ?? [])
      .slice(0, 3)
      .map((t) => ({ text: t.Text, url: t.FirstURL }))
      .filter((t) => t.text);
    return JSON.stringify({
      query: q,
      heading: json.Heading,
      abstract: json.AbstractText,
      url: json.AbstractURL,
      related,
    });
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "search failed",
      query: q,
    });
  }
}

export async function slackPost(args: {
  channel?: string;
  text: string;
}): Promise<string> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: args.text,
        channel: args.channel,
      }),
    });
    if (!res.ok) {
      return JSON.stringify({
        ok: false,
        delivered: false,
        error: `webhook ${res.status}`,
      });
    }
    return JSON.stringify({ ok: true, delivered: true, channel: args.channel ?? "webhook" });
  }
  return JSON.stringify({
    ok: true,
    delivered: false,
    mock: true,
    note: "No SLACK_WEBHOOK_URL; logged as a desk send after Allow.",
    channel: args.channel ?? "#team",
    text: args.text,
  });
}

export { SEND_TOOLS, isSendTool } from "./types";

export function toolsFor(
  _petId: LiveAgentId,
  grants: PetGrants = DEFAULT_GRANTS,
  config: PetConfig = DEFAULT_PET_CONFIG
) {
  const base = [
    {
      type: "function" as const,
      function: {
        name: "inspect_untrusted",
        description:
          "Inspect an untrusted message inside the local sandbox. Never sends or posts.",
        parameters: {
          type: "object",
          properties: {
            sender: { type: "string" },
            body: { type: "string" },
          },
          required: ["body"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "web_search",
        description: "Look up a short public web snippet about a query.",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "save_draft",
        description:
          "Write the tweet, reply, or announcement now. Does not send.",
        parameters: {
          type: "object",
          properties: { draft: { type: "string" } },
          required: ["draft"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "slack_post",
        description:
          "Post to Slack only. Never use this for X/Twitter. Requires the trainer's send button.",
        parameters: {
          type: "object",
          properties: {
            channel: { type: "string" },
            text: { type: "string" },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "x_post",
        description:
          "Open X (Twitter) with the tweet text filled in. Requires the trainer's send button. Returns posted:false — do not claim it was sent.",
        parameters: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "open_url",
        description:
          "Open an http(s) URL in the default browser on this Mac. Call this whenever the trainer gives a link.",
        parameters: {
          type: "object",
          properties: { url: { type: "string" } },
          required: ["url"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "take_screenshot",
        description:
          "Capture the current screen and return a compressed image as base64 (jpeg/png). Use when they ask for a screenshot / スクショ.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "generate_image",
        description:
          "Generate an image from a prompt. The PNG appears in the talk bubble immediately. Do not write it to disk.",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            size: {
              type: "string",
              enum: ["1024x1024", "1792x1024", "1024x1792", "512x512"],
            },
            title: { type: "string" },
          },
          required: ["prompt"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "make_sheet",
        description:
          "Make a spreadsheet in the desk canvas (headers + rows). Does not write xlsx until they download. Ask for columns if they only said 表を作って.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            headers: { type: "array", items: { type: "string" } },
            rows: {
              type: "array",
              items: { type: "array", items: { type: "string" } },
            },
          },
          required: ["headers", "rows"],
        },
      },
    },
  ];

  if (grants.sandbox === "read_only") {
    return filterTools(
      [...base, ...mailTools(config), ...appTools(config)],
      config
    );
  }

  const scoped =
    grants.sandbox === "workspace"
      ? "Only paths inside the trainer's granted folders, unless the trainer Allows leaving."
      : "Unrestricted on this Mac. Do not post to Slack without slack_post + Allow.";

  const readTools = [
    {
      type: "function" as const,
      function: {
        name: "list_dir",
        description: `List a directory. ${scoped}`,
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "glob_files",
        description: `Find files under a folder. pattern examples: *.txt, *.png, *.{txt,png}. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            pattern: { type: "string" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "read_file",
        description: `Read a file. Large files support offset/limit. Binary images are not dumped — use process_image or write_pptx. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            offset: { type: "number" },
            limit: { type: "number" },
            encoding: { type: "string", enum: ["utf8", "base64"] },
          },
          required: ["path"],
        },
      },
    },
  ];

  const archiveTools = [
    {
      type: "function" as const,
      function: {
        name: "zip_files",
        description: `Create a .zip of files or folders inside granted folders. Use paths from glob_files / list_dir when the trainer gives names only. Put the zip next to the items, not inside a folder you are zipping. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            paths: {
              type: "array",
              items: { type: "string" },
              description: "Files or folders to include",
            },
            dest: {
              type: "string",
              description:
                "Output .zip path. Optional; defaults next to the first item (Archive.zip / アーカイブ.zip).",
            },
          },
          required: ["paths"],
        },
      },
    },
  ];

  const writeTools = [
    {
      type: "function" as const,
      function: {
            name: "write_file",
            description: `Write a file (creates parent folders). Use for HTML/CSS/JS, package.json, source, README, and other text inside the granted folder. For a site or app, write every file — do not stop after one. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
            encoding: { type: "string", enum: ["utf8", "base64"] },
            append: { type: "boolean" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "append_file",
        description: `Append to a log or text file. Set timestamp true to prefix ISO time. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
            timestamp: { type: "boolean" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "write_json",
        description: `Write a JSON file. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            data: { description: "JSON value to write" },
            pretty: { type: "boolean" },
          },
          required: ["path", "data"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "write_csv",
        description: `Write a CSV (Excel-friendly BOM). ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            headers: { type: "array", items: { type: "string" } },
            rows: {
              type: "array",
              items: { type: "array", items: { type: "string" } },
            },
          },
          required: ["path", "headers", "rows"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "write_pdf",
        description: `Generate a PDF from text or from_file. Japanese-capable on this Mac. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            title: { type: "string" },
            text: { type: "string" },
            from_file: { type: "string" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "write_pptx",
        description: `Build a PPTX. Pass from_folder of .txt/.md + .png/.jpg (paired by filename), or slides[{title,body,image,from_file}]. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            title: { type: "string" },
            from_folder: { type: "string" },
            slides: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  body: { type: "string" },
                  image: { type: "string" },
                  from_file: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "process_image",
        description: `Resize, grayscale, rotate, or convert png/jpeg and save. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            source: { type: "string" },
            dest: { type: "string" },
            width: { type: "number" },
            height: { type: "number" },
            grayscale: { type: "boolean" },
            rotate: { type: "number" },
            format: { type: "string", enum: ["png", "jpeg"] },
            quality: { type: "number" },
          },
          required: ["source", "dest"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "copy_file",
        description: `Copy a file inside granted folders. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            source: { type: "string" },
            dest: { type: "string" },
          },
          required: ["source", "dest"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "mkdir",
        description: `Create a folder (and parents) inside granted folders. Use this to organize or to start an app project. ${scoped}`,
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "move_file",
        description: `Move or rename a file or folder inside granted folders. Use this to tidy (images/docs/etc) or restructure a project. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            source: { type: "string" },
            dest: { type: "string" },
          },
          required: ["source", "dest"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "edit_file",
        description: `Replace an exact snippet in an existing text file. Prefer this over rewriting the whole file. ${scoped}`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            old_string: { type: "string" },
            new_string: { type: "string" },
            replace_all: { type: "boolean" },
          },
          required: ["path", "old_string", "new_string"],
        },
      },
    },
    ...archiveTools,
    {
      type: "function" as const,
      function: {
        name: "run_command",
        description:
          grants.sandbox === "full_access"
            ? "Run a shell command on this Mac. Prefer write_file / edit_file / mkdir / move_file when those fit. Timeout applies."
            : "Run a command with cwd inside granted folders (node, npm, python, git, and similar). Prefer file tools for edits. Other commands pause for Allow.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" },
            cwd: { type: "string" },
          },
          required: ["command"],
        },
      },
    },
  ];

  return filterTools(
    [
      ...base,
      ...mailTools(config),
      ...readTools,
      ...writeTools,
      ...appTools(config),
    ],
    config
  );
}

function mailTools(config: PetConfig) {
  if (!config.apps.includes("mail")) return [];
  return [
    {
      type: "function" as const,
      function: {
        name: "mail_list",
        description:
          "List unread messages in Mail.app inbox (id, subject, sender, short snippet). Does not send.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "mail_read",
        description: "Read one Mail.app message by id. Body is truncated.",
        parameters: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "mail_draft",
        description:
          "Store a reply draft for a Mail.app message. Does not send. Then call mail_send so the trainer can press 送信.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
          },
          required: ["id", "text"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "mail_send",
        description:
          "Send the drafted reply via Mail.app. Requires the trainer's 送信 button. Never claim it was sent until posted is true.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
          },
          required: ["id"],
        },
      },
    },
  ];
}

function appTools(config: PetConfig) {
  if (config.disabledTools.includes("open_app")) return [];
  const allowed = config.apps.length ? config.apps.join(", ") : "(none yet — Allow first)";
  return [
    {
      type: "function" as const,
      function: {
        name: "open_app",
        description: `Open a Mac app. Already allowed: ${allowed}. Any other app pauses for trainer Allow, then opens. Never tell the trainer to open it themselves.`,
        parameters: {
          type: "object",
          properties: {
            app: { type: "string", enum: [...DESK_APP_IDS] },
          },
          required: ["app"],
        },
      },
    },
  ];
}

function filterTools<T extends { function: { name: string } }>(
  tools: T[],
  config: PetConfig
) {
  const blocked = new Set(config.disabledTools);
  const allowed = toolsAllowedInWorkMode(config.workMode);
  if (!blocked.size && !allowed) return tools;
  return tools.filter((tool) => {
    const name = tool.function.name;
    if (blocked.has(name)) return false;
    if (allowed && !allowed.has(name)) return false;
    return true;
  });
}

export async function executeTool(
  name: string,
  rawArgs: string,
  locale: Locale,
  grants: PetGrants = DEFAULT_GRANTS,
  escape = false,
  petId?: LiveAgentId,
  config: PetConfig = DEFAULT_PET_CONFIG
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    args = {};
  }
  if (config.disabledTools.includes(name)) {
    const msg =
      locale === "ja"
        ? `道具 ${name} はこの子には渡していません（MCP Gateway）`
        : `Tool ${name} is disabled for this pet (MCP Gateway)`;
    return JSON.stringify({ error: msg });
  }
  const allowed = toolsAllowedInWorkMode(config.workMode);
  if (allowed && !allowed.has(name)) {
    const msg =
      locale === "ja"
        ? config.workMode === "plan"
          ? "いまはプランモード。実行はしないよ。手順だけ書くね。"
          : "いまはアスクモード。答えるだけだよ。"
        : config.workMode === "plan"
          ? "Plan mode — I'll outline steps, not run tools that change things."
          : "Ask mode — I'll answer, not act.";
    return JSON.stringify({ error: msg, mode: config.workMode });
  }
  if (name === "inspect_untrusted") {
    return inspectUntrusted({
      sender: typeof args.sender === "string" ? args.sender : undefined,
      body: typeof args.body === "string" ? args.body : String(args.body ?? ""),
    });
  }
  if (name === "web_search") {
    return webSearch(typeof args.query === "string" ? args.query : "");
  }
  if (name === "save_draft") {
    const draft = typeof args.draft === "string" ? args.draft : "";
    try {
      return JSON.stringify(await saveDeskDraft(draft, locale));
    } catch (err) {
      return JSON.stringify({
        saved: false,
        sent: false,
        error: err instanceof Error ? err.message : "save failed",
      });
    }
  }
  if (name === "slack_post") {
    return slackPost({
      channel: typeof args.channel === "string" ? args.channel : undefined,
      text: typeof args.text === "string" ? args.text : "",
    });
  }
  if (name === "x_post") {
    const text = typeof args.text === "string" ? args.text : "";
    try {
      const opened = await openXCompose(text);
      const draft = await saveDeskDraft(text, locale).catch(() => null);
      return JSON.stringify({
        ...opened,
        posted: false,
        delivered: false,
        draftPath: draft && "path" in draft ? draft.path : undefined,
        note:
          locale === "ja"
            ? "Xの投稿画面を開いて文を入れた。まだ投稿はしていない。送ったとは言わないこと。"
            : "Opened X compose with this text. Not posted. Do not say you sent it.",
      });
    } catch (err) {
      return JSON.stringify({
        ok: false,
        posted: false,
        delivered: false,
        error: err instanceof Error ? err.message : "open failed",
      });
    }
  }
  if (name === "generate_image") {
    const prompt = typeof args.prompt === "string" ? args.prompt : "";
    if (!prompt.trim()) {
      return JSON.stringify({
        error:
          locale === "ja"
            ? "何を描くか、もう少し教えてね。"
            : "Tell me what to draw first.",
      });
    }
    try {
      return JSON.stringify(
        await generateImageFile({
          prompt,
          size: typeof args.size === "string" ? args.size : undefined,
          title: typeof args.title === "string" ? args.title : undefined,
          config,
        })
      );
    } catch (err) {
      return JSON.stringify({
        error:
          locale === "ja"
            ? `絵が作れなかったよ。${err instanceof Error ? err.message : ""}`
            : `Couldn't make the image. ${err instanceof Error ? err.message : ""}`,
      });
    }
  }
  if (name === "make_sheet") {
    const headers = Array.isArray(args.headers)
      ? args.headers.map((h) => String(h ?? ""))
      : [];
    const rows = Array.isArray(args.rows)
      ? args.rows.map((row) =>
          Array.isArray(row) ? row.map((c) => String(c ?? "")) : []
        )
      : [];
    if (!headers.length) {
      return JSON.stringify({
        error:
          locale === "ja"
            ? "列の名前がまだないよ。何の表？"
            : "Need column headers first.",
      });
    }
    const title = typeof args.title === "string" ? args.title : "sheet";
    const stored = putArtifact({
      mime: "application/json",
      bytes: Buffer.from(JSON.stringify({ title, headers, rows })),
      title,
      kind: "sheet",
    });
    return JSON.stringify({
      ok: true,
      saved: false,
      artifact: {
        kind: "sheet",
        id: stored.id,
        title,
        headers,
        rows,
      },
    });
  }
  if (name === "mail_list" || name === "mail_read" || name === "mail_draft" || name === "mail_send") {
    if (!config.apps.includes("mail")) {
      return JSON.stringify({
        error:
          locale === "ja"
            ? "メールはまだ許可されていないよ。ゲートでメールを付けてね。"
            : "Mail isn’t allowed yet. Grant Mail in the gate.",
      });
    }
  }
  if (name === "mail_list") {
    try {
      const messages = await listUnreadMail(locale);
      return JSON.stringify({ ok: true, messages });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : "mail list failed",
      });
    }
  }
  if (name === "mail_read") {
    const id = typeof args.id === "string" ? args.id : "";
    try {
      return JSON.stringify({ ok: true, ...(await readMail(id, locale)) });
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : "mail read failed",
      });
    }
  }
  if (name === "mail_draft") {
    const id = typeof args.id === "string" ? args.id : "";
    const text = typeof args.text === "string" ? args.text : "";
    if (!id || !text.trim()) {
      return JSON.stringify({
        error: locale === "ja" ? "返信の文が空だよ" : "Empty reply",
      });
    }
    putMailDraft(id, text);
    return JSON.stringify({
      ok: true,
      saved: true,
      sent: false,
      posted: false,
      id,
      text,
      note:
        locale === "ja"
          ? "返信文面を置いた。まだ送っていない。mail_send して送信ボタンを待ってね。"
          : "Draft stored. Not sent. Call mail_send and wait for the send button.",
    });
  }
  if (name === "mail_send") {
    const id = typeof args.id === "string" ? args.id : "";
    const text =
      (typeof args.text === "string" && args.text.trim()
        ? args.text
        : getMailDraft(id)) ?? "";
    if (!id || !text.trim()) {
      return JSON.stringify({
        error:
          locale === "ja"
            ? "送る文面がないよ。先に mail_draft してね。"
            : "No reply text. Draft first.",
      });
    }
    try {
      return JSON.stringify(await sendMailReply({ id, text, locale }));
    } catch (err) {
      return JSON.stringify({
        ok: false,
        posted: false,
        delivered: false,
        error: err instanceof Error ? err.message : "mail send failed",
      });
    }
  }
  if (name === "open_app") {
    const app = args.app;
    if (!isDeskAppId(app)) {
      const msg =
        locale === "ja"
          ? "このアプリは許可されていません"
          : "That app is not allowed";
      return JSON.stringify({ error: msg });
    }
    if (!config.apps.includes(app) && !escape) {
      const msg =
        locale === "ja"
          ? "このアプリはまだ許可されていないよ"
          : "That app is not allowed yet";
      return JSON.stringify({ error: msg });
    }
    try {
      return JSON.stringify(await openMacApp(app));
    } catch (err) {
      return JSON.stringify({
        error: err instanceof Error ? err.message : "open failed",
      });
    }
  }
  if (name === "open_url") {
    const url = typeof args.url === "string" ? args.url.trim() : "";
    try {
      return JSON.stringify(await openHttpUrl(url));
    } catch (err) {
      return JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "open failed",
      });
    }
  }
  if (name === "take_screenshot") {
    const shot = await captureScreenBase64();
    if (!shot.ok) return JSON.stringify(shot);
    return JSON.stringify({
      ok: true,
      mime: shot.mime,
      encoding: "base64",
      // Keep tool payload usable; model can reason from a truncated note + mime.
      base64: shot.base64,
      bytes: shot.bytes,
    });
  }
  if (isDeskTool(name)) {
    return executeDeskTool(name, rawArgs, grants, locale, escape);
  }
  const msg =
    locale === "ja"
      ? `ツール ${name} はこのライセンスにありません`
      : `Tool ${name} is not on this license`;
  return JSON.stringify({ error: msg });
}

export function isGatedTool(
  name: string,
  rawArgs = "",
  grants: PetGrants = DEFAULT_GRANTS,
  config: PetConfig = DEFAULT_PET_CONFIG
) {
  if (name === "slack_post" || name === "x_post" || name === "mail_send") return true;
  if (name === "open_app") {
    try {
      const app = JSON.parse(rawArgs || "{}").app;
      if (!isDeskAppId(app)) return true;
      return !config.apps.includes(app);
    } catch {
      return true;
    }
  }
  if (!isDeskTool(name)) return false;
  if (grants.sandbox === "full_access") return false;
  if (name === "run_command") {
    let command = "";
    try {
      command = String(JSON.parse(rawArgs || "{}").command ?? "");
    } catch {
      command = "";
    }
    const verdict = inspectShellCommand(command);
    if (verdict.ok === false && !verdict.fatal) return true;
  }
  return deskCallLeavesWorkspace(name, rawArgs, grants);
}

async function saveDeskDraft(draft: string, locale: Locale) {
  const dir = path.join(os.homedir(), "Desktop", "Petassist");
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(dir, `draft-${stamp}.txt`);
  await fs.writeFile(dest, draft, "utf8");
  return {
    saved: true,
    sent: false,
    path: dest,
    draft,
    note:
      locale === "ja"
        ? `下書きを ${dest} に残した。`
        : `Draft saved at ${dest}.`,
  };
}

export { DESK_TOOLS };
