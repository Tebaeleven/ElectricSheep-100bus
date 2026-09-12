import type { DeskArtifact } from "@/lib/agent/types";

export function previewUrl(
  artifact: Pick<DeskArtifact, "kind" | "id">,
  petId?: string
) {
  const params = new URLSearchParams({
    kind: artifact.kind,
    id: artifact.id,
  });
  if (petId) params.set("pet", petId);
  return `/preview?${params.toString()}`;
}

export function openPreview(
  artifact: DeskArtifact | Pick<DeskArtifact, "kind" | "id">,
  petId?: string
) {
  if (typeof window === "undefined") return;
  if ("headers" in artifact && artifact.kind === "sheet") {
    try {
      window.localStorage.setItem(
        `pockassist.preview.${artifact.id}`,
        JSON.stringify({
          title: artifact.title,
          headers: artifact.headers,
          rows: artifact.rows,
        })
      );
    } catch {
      /* ignore */
    }
  }
  if (window.petassist?.openPreview) {
    void window.petassist.openPreview({
      id: artifact.id,
      kind: artifact.kind,
      petId,
    });
    return;
  }
  const href = new URL(
    previewUrl(artifact, petId),
    window.location.origin
  ).toString();
  window.open(href, "_blank", "noopener,noreferrer");
}
