export type SandboxMode = "read_only" | "workspace" | "full_access";

export type PetGrants = {
  sandbox: SandboxMode;
  folders: string[];
};

export const DEFAULT_GRANTS: PetGrants = {
  sandbox: "read_only",
  folders: [],
};

export function isSandboxMode(value: unknown): value is SandboxMode {
  return (
    value === "read_only" || value === "workspace" || value === "full_access"
  );
}

export function parseGrants(raw: unknown): PetGrants {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GRANTS };
  const rec = raw as Record<string, unknown>;
  const folders = Array.isArray(rec.folders)
    ? rec.folders.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    : [];
  return {
    sandbox: isSandboxMode(rec.sandbox) ? rec.sandbox : "read_only",
    folders: [...new Set(folders)],
  };
}

export function needsLocalRuntime(grants: PetGrants) {
  return grants.sandbox === "workspace" || grants.sandbox === "full_access";
}

export function folderLabel(folder: string) {
  const parts = folder.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 2) return folder;
  return parts.slice(-2).join("/");
}
