import { asRecord, pick } from "./parse";

const DEFAULT_BASE = "http://127.0.0.1:8790";

function trueforgeBaseUrl() {
  return (process.env.TRUEFORGE_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

export type McpCatalog = {
  names: string[];
  search: string | null;
  write: string | null;
};

export type McpServerRef = {
  name: string;
  enable_tools?: string[];
  require_approval_for_tools?: string[];
  preload?: boolean;
};

const SEARCH_RE = /search|brave|exa|tavily|bing|web|perplexity/i;
const WRITE_RE = /slack|discord|telegram|gmail|resend|mailgun|twilio|webhook/i;

const LIST_PATHS = [
  "/api/v1/mcp-servers",
  "/api/v1/mcp_servers",
  "/api/v1/connectors",
  "/api/v1/mcp",
];

function headers() {
  const out: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.TRUEFORGE_TOKEN;
  if (token) out.authorization = `Bearer ${token}`;
  return out;
}

function envName(key: string) {
  const value = process.env[key]?.trim();
  return value || null;
}

function namesFromPayload(json: unknown): string[] {
  const rec = asRecord(json);
  const buckets: unknown[] = [
    rec?.data,
    rec?.items,
    rec?.servers,
    rec?.mcp_servers,
    rec?.connectors,
    json,
  ];
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    const names = bucket
      .map((item) => {
        const row = asRecord(item);
        return pick<string>(row, "name", "id", "slug");
      })
      .filter((n): n is string => Boolean(n));
    if (names.length) return [...new Set(names)];
  }
  return [];
}

async function fetchConfiguredNames(): Promise<string[]> {
  for (const path of LIST_PATHS) {
    try {
      const res = await fetch(`${trueforgeBaseUrl()}${path}`, {
        headers: headers(),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const names = namesFromPayload(await res.json().catch(() => ({})));
      if (names.length) return names;
    } catch {
      /* try next path */
    }
  }
  return [];
}

function resolve(env: string | null, names: string[], pattern: RegExp) {
  if (env && names.includes(env)) return env;
  const matched = names.find((name) => pattern.test(name));
  if (matched) return matched;
  return env;
}

export async function listMcpCatalog(): Promise<McpCatalog> {
  const names = await fetchConfiguredNames();
  return {
    names,
    search: resolve(envName("TRUEFORGE_MCP_SEARCH"), names, SEARCH_RE),
    write: resolve(envName("TRUEFORGE_MCP_WRITE"), names, WRITE_RE),
  };
}

export function mcpServersFor(
  _petId: string,
  catalog: McpCatalog,
  mode?: import("@/lib/pet-config").WorkMode
): McpServerRef[] {
  const servers: McpServerRef[] = [];
  if (catalog.search && mode !== "image") {
    servers.push({
      name: catalog.search,
      enable_tools: ["@read-only"],
      preload: false,
    });
  }
  if (catalog.write && (!mode || mode === "agent")) {
    servers.push({
      name: catalog.write,
      enable_tools: ["@all"],
      require_approval_for_tools: ["@write", "@destructive"],
      preload: false,
    });
  }
  return servers;
}
