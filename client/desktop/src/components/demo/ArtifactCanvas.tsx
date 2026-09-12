"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DeskArtifact } from "@/lib/agent/types";
import { useI18n } from "@/lib/i18n/locale";
import { useDesk } from "@/lib/hooks/use-desk";
import type { PetGrants } from "@/lib/grants";
import { cn } from "@/lib/utils";

type ArtifactCanvasProps = {
  artifact: DeskArtifact;
  grants: PetGrants;
  onClose: () => void;
  className?: string;
};

export function ArtifactCanvas({
  artifact,
  grants,
  onClose,
  className,
}: ArtifactCanvasProps) {
  const { locale, t } = useI18n();
  const desk = useDesk();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const ja = locale === "ja";

  const download = async () => {
    setBusy(true);
    setSaved(null);
    try {
      let dest = grants.folders[0] ?? "";
      if (!dest && desk.available) {
        dest = (await window.petassist?.openDirectory()) ?? "";
      }
      if (dest) {
        const res = await fetch("/api/agent/artifact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            artifact.kind === "sheet"
              ? {
                  kind: "sheet",
                  dest,
                  title: artifact.title,
                  headers: artifact.headers,
                  rows: artifact.rows,
                }
              : { dest, id: artifact.id, title: artifact.title }
          ),
        });
        const json = (await res.json()) as { path?: string; error?: string };
        if (json.path) {
          setSaved(json.path);
          return;
        }
      }
      if (artifact.kind === "image") {
        const a = document.createElement("a");
        a.href = artifact.url;
        a.download = `${artifact.title || "image"}.png`;
        a.click();
        return;
      }
      const csv = [artifact.headers, ...artifact.rows]
        .map((row) =>
          row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${artifact.title || "sheet"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-[220px] w-full max-w-sm shrink-0 flex-col rounded-xl border border-slate-200 bg-[#f7f8fb] p-2",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-semibold text-[#302c55]">
          {artifact.title || (artifact.kind === "image" ? t.talk.canvasImage : t.talk.canvasSheet)}
        </p>
        <button
          type="button"
          className="text-[10px] text-slate-400 hover:text-slate-700"
          onClick={onClose}
        >
          {t.talk.canvasHide}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-white p-1">
        {artifact.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artifact.url}
            alt={artifact.title ?? ""}
            className="mx-auto max-h-64 w-auto max-w-full object-contain"
          />
        ) : (
          <table className="w-full border-collapse text-[10px] text-[#302c55]">
            <thead>
              <tr>
                {artifact.headers.map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="border border-slate-200 bg-slate-50 px-1 py-0.5 text-left font-semibold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {artifact.rows.map((row, ri) => (
                <tr key={ri}>
                  {artifact.headers.map((_, ci) => (
                    <td
                      key={ci}
                      className="border border-slate-200 px-1 py-0.5 align-top"
                    >
                      {row[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={busy}
          onClick={() => void download()}
        >
          {t.talk.downloadFile}
        </Button>
        {saved ? (
          <p className="truncate text-[10px] text-slate-500">
            {ja ? "保存したよ" : "Saved"} {saved}
          </p>
        ) : null}
      </div>
    </div>
  );
}
