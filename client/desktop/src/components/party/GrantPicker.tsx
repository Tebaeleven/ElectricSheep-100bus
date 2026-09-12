"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/locale";
import { folderLabel, type PetGrants, type SandboxMode } from "@/lib/grants";
import { cn } from "@/lib/utils";

type GrantPickerProps = {
  grants: PetGrants;
  deskAvailable: boolean;
  onChange: (next: PetGrants) => void;
};

export function GrantPicker({
  grants,
  deskAvailable,
  onChange,
}: GrantPickerProps) {
  const { t } = useI18n();
  const [fullOpen, setFullOpen] = useState(false);
  const [paste, setPaste] = useState("");

  const addPath = (folder: string) => {
    const path = folder.trim();
    if (!path) return;
    const sandbox: SandboxMode =
      grants.sandbox === "read_only" ? "workspace" : grants.sandbox;
    onChange({
      sandbox,
      folders: [...new Set([...grants.folders, path])],
    });
  };

  const pickFolder = async () => {
    const picked = deskAvailable
      ? await window.petassist?.openDirectory()
      : null;
    if (picked) {
      addPath(picked);
      return;
    }
  };

  const setMode = async (sandbox: SandboxMode) => {
    if (sandbox === "full_access") {
      setFullOpen(true);
      return;
    }
    setFullOpen(false);
    onChange({ ...grants, sandbox });
    if (sandbox === "workspace" && grants.folders.length === 0) {
      await pickFolder();
    }
  };

  const confirmFull = () => {
    onChange({ ...grants, sandbox: "full_access" });
    setFullOpen(false);
  };

  return (
    <div className="relative mt-3">
      <p className="mb-1 text-[11px] font-semibold text-slate-500">
        {t.grants.heading}
      </p>
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["read_only", t.grants.readOnly],
            ["workspace", t.grants.workspace],
            ["full_access", t.grants.fullAccess],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            size="sm"
            variant={grants.sandbox === id ? "default" : "outline"}
            className={cn(
              id === "full_access" &&
                grants.sandbox === "full_access" &&
                "bg-orange-500 text-white hover:opacity-90"
            )}
            onClick={() => void setMode(id)}
          >
            {label}
          </Button>
        ))}
      </div>
      {grants.sandbox === "full_access" ? (
        <Badge variant="destructive" className="mt-2">
          {t.grants.fullAccess}
        </Badge>
      ) : null}
      {(grants.sandbox === "workspace" || grants.folders.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {grants.folders.map((folder) => (
            <span
              key={folder}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700"
              title={folder}
            >
              <span className="truncate">{folderLabel(folder)}</span>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700"
                onClick={() =>
                  onChange({
                    ...grants,
                    folders: grants.folders.filter((p) => p !== folder),
                  })
                }
              >
                {t.grants.remove}
              </button>
            </span>
          ))}
          <Button size="sm" variant="secondary" onClick={() => void pickFolder()}>
            {t.grants.addFolder}
          </Button>
        </div>
      )}
      {!deskAvailable && grants.sandbox !== "read_only" ? (
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            addPath(paste);
            setPaste("");
          }}
        >
          <input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={t.grants.pathPlaceholder}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none"
          />
          <Button type="submit" size="sm" className="h-8 px-2 text-xs">
            {t.grants.pastePath}
          </Button>
        </form>
      ) : null}

      {/* Inline confirm — AlertDialog portals behind PetGateSheet (z-80). */}
      {fullOpen ? (
        <div
          className="relative z-[90] mt-2 rounded-xl border border-orange-200 bg-orange-50 p-2.5 shadow-sm"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p className="text-[11px] font-semibold text-[#302c55]">
            {t.grants.fullTitle}
          </p>
          <p className="mt-1 text-[10px] leading-snug text-slate-600">
            {t.grants.fullBody}
          </p>
          <div className="mt-2 flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 text-xs"
              onClick={() => setFullOpen(false)}
            >
              {t.grants.cancel}
            </Button>
            <Button
              size="sm"
              className="h-8 flex-1 bg-orange-500 text-xs text-white hover:opacity-90"
              onClick={confirmFull}
            >
              {t.grants.confirm}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
