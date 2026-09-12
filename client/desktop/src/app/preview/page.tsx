"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { publishDeskPreview } from "@/lib/desk-channel";
import { useI18n } from "@/lib/i18n/locale";

type SheetData = {
  title?: string;
  headers: string[];
  rows: string[][];
};

function PreviewBody() {
  const { t, locale } = useI18n();
  const params = useSearchParams();
  const kind = params.get("kind") === "sheet" ? "sheet" : "image";
  const petId = params.get("pet") ?? "";
  const [id, setId] = useState(params.get("id") ?? "");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paint, setPaint] = useState(false);
  const [removeWhat, setRemoveWhat] = useState("");
  const [saved, setSaved] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const src = id ? `/api/agent/artifact?id=${encodeURIComponent(id)}` : "";
  const ja = locale === "ja";

  useEffect(() => {
    if (kind !== "sheet" || !id) return;
    void (async () => {
      const res = await fetch(`/api/agent/artifact?id=${encodeURIComponent(id)}`);
      const json = res.ok
        ? ((await res.json().catch(() => null)) as SheetData | null)
        : null;
      if (json && Array.isArray(json.headers)) {
        setSheet({
          title: json.title,
          headers: json.headers.map(String),
          rows: Array.isArray(json.rows)
            ? json.rows.map((row) =>
                Array.isArray(row) ? row.map((c) => String(c ?? "")) : []
              )
            : [],
        });
        return;
      }
      try {
        const cached = window.localStorage.getItem(`pockassist.preview.${id}`);
        const parsed = cached ? (JSON.parse(cached) as SheetData) : null;
        if (parsed && Array.isArray(parsed.headers)) {
          setSheet({
            title: parsed.title,
            headers: parsed.headers.map(String),
            rows: Array.isArray(parsed.rows)
              ? parsed.rows.map((row) =>
                  Array.isArray(row) ? row.map((c) => String(c ?? "")) : []
                )
              : [],
          });
          return;
        }
      } catch {
        /* ignore */
      }
      setError("not found");
    })();
  }, [kind, id]);

  const fitCanvas = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    setId(params.get("id") ?? "");
  }, [params]);

  useEffect(() => {
    if (paint) fitCanvas();
  }, [paint, id]);

  const paintAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const box = canvas.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * canvas.width;
    const y = ((clientY - box.top) / box.height) * canvas.height;
    ctx.fillStyle = "rgba(220, 50, 80, 0.5)";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(12, canvas.width / 40), 0, Math.PI * 2);
    ctx.fill();
  };

  const maskDataUrl = () => {
    const overlay = canvasRef.current;
    if (!overlay?.width || !overlay.height) return undefined;
    const src = overlay.getContext("2d")?.getImageData(
      0,
      0,
      overlay.width,
      overlay.height
    );
    if (!src) return undefined;
    const canvas = document.createElement("canvas");
    canvas.width = overlay.width;
    canvas.height = overlay.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const out = ctx.createImageData(overlay.width, overlay.height);
    let painted = false;
    for (let i = 0; i < src.data.length; i += 4) {
      const hit = src.data[i + 3] > 12;
      if (hit) painted = true;
      out.data[i] = 0;
      out.data[i + 1] = 0;
      out.data[i + 2] = 0;
      out.data[i + 3] = hit ? 0 : 255;
    }
    if (!painted) return undefined;
    ctx.putImageData(out, 0, 0);
    return canvas.toDataURL("image/png");
  };

  const edit = async (prompt: string, withMask = false) => {
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      const mask = withMask ? maskDataUrl() : undefined;
      const res = await fetch("/api/agent/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          title: prompt.slice(0, 40),
          images: [{ id }],
          mask: mask ? { mime: "image/png", data: mask } : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        url?: string;
        title?: string;
        error?: string;
      };
      if (!res.ok || !json.id || !json.url) {
        setError(json.error || t.talk.editFailed);
        return;
      }
      setId(json.id);
      setPaint(false);
      const next = new URL(window.location.href);
      next.searchParams.set("id", json.id);
      window.history.replaceState(null, "", `${next.pathname}${next.search}`);
      publishDeskPreview({
        kind: "image",
        id: json.id,
        title: json.title,
        url: json.url,
      }, petId);
    } catch {
      setError(t.talk.editFailed);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!id) return;
    setSaved("");
    let dest = "";
    if (window.petassist?.openDirectory) {
      dest = (await window.petassist.openDirectory()) ?? "";
    }
    if (dest) {
      const res = await fetch("/api/agent/artifact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          kind === "sheet" && sheet
            ? {
                kind: "sheet",
                dest,
                title: sheet.title,
                headers: sheet.headers,
                rows: sheet.rows,
              }
            : { dest, id, title: sheet?.title }
        ),
      });
      const json = (await res.json().catch(() => ({}))) as {
        path?: string;
        error?: string;
      };
      if (json.path) {
        setSaved(json.path);
        return;
      }
      if (json.error) setError(json.error);
    }
    if (kind === "sheet" && sheet) {
      const csv = [sheet.headers, ...sheet.rows]
        .map((row) =>
          row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sheet.title || "sheet"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const a = document.createElement("a");
    a.href = src;
    a.download = "image.png";
    a.click();
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#f7f8fb] p-4 text-[#302c55]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-auto truncate text-sm font-semibold">
          {kind === "sheet"
            ? sheet?.title || t.talk.canvasSheet
            : t.talk.canvasImage}
        </p>
        {kind === "image" ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={busy || !id}
              onClick={() =>
                void edit(
                  ja
                    ? "背景を完全に消して、被写体だけを残した透明背景のPNGにして。"
                    : "Remove the background completely. Keep only the subject on a transparent background."
                )
              }
            >
              {t.talk.removeBg}
            </Button>
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const what = removeWhat.trim();
                if (!what) return;
                void edit(
                  ja
                    ? `この画像から「${what}」を自然に消して。他はそのまま。`
                    : `Remove "${what}" from this image. Keep everything else.`
                );
              }}
            >
              <input
                value={removeWhat}
                onChange={(e) => setRemoveWhat(e.target.value)}
                placeholder={t.talk.removeHint}
                className="h-8 w-36 rounded-md border border-slate-200 bg-white px-2 text-[11px] outline-none"
              />
              <Button type="submit" size="sm" className="h-8 text-xs" disabled={busy}>
                {t.talk.removeObject}
              </Button>
            </form>
            <Button
              size="sm"
              variant={paint ? "default" : "outline"}
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => setPaint((on) => !on)}
            >
              {t.talk.paintErase}
            </Button>
            {paint ? (
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={busy}
                onClick={() =>
                  void edit(
                    ja
                      ? "塗った部分だけを自然に消して埋めて。"
                      : "Erase only the painted region and fill it in naturally.",
                    true
                  )
                }
              >
                {t.talk.removeObject}
              </Button>
            ) : null}
          </>
        ) : null}
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={!id}
          onClick={() => void download()}
        >
          {t.talk.downloadFile}
        </Button>
      </div>
      {busy ? (
        <p className="mb-2 text-[12px] text-slate-500">{t.talk.editBusy}</p>
      ) : null}
      {error ? (
        <p className="mb-2 text-[12px] text-red-500">{error}</p>
      ) : null}
      {saved ? (
        <p className="mb-2 truncate text-[12px] text-slate-500">
          {ja ? "保存したよ" : "Saved"} {saved}
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-auto rounded-xl bg-white p-3 shadow-sm">
        {kind === "image" && src ? (
          <div className="relative mx-auto inline-block max-w-full">
            <img
              ref={imgRef}
              src={src}
              alt=""
              className="max-h-[70vh] w-auto max-w-full object-contain"
              onLoad={fitCanvas}
            />
            {paint ? (
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full cursor-crosshair"
                onPointerDown={(e) => {
                  drawing.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  paintAt(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (!drawing.current) return;
                  paintAt(e.clientX, e.clientY);
                }}
                onPointerUp={() => {
                  drawing.current = false;
                }}
              />
            ) : (
              <canvas ref={canvasRef} className="hidden" />
            )}
          </div>
        ) : null}
        {kind === "sheet" && sheet ? (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {sheet.headers.map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, ri) => (
                <tr key={ri}>
                  {sheet.headers.map((_, ci) => (
                    <td
                      key={ci}
                      className="border border-slate-200 px-2 py-1 align-top"
                    >
                      {row[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </main>
  );
}

export default function PreviewPage() {
  return (
    <Suspense>
      <PreviewBody />
    </Suspense>
  );
}
