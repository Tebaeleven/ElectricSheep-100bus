import { ImageResponse } from "next/og";

export const alt =
  "Petassist, stuck on the desk — research only, drafts only, this folder only. You don’t have to hand over extra.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#eef3f9",
          color: "#302c55",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 8,
            color: "#6d7f99",
            fontWeight: 600,
          }}
        >
          PETASSIST
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            marginTop: 18,
            color: "#6d7f99",
            fontWeight: 600,
          }}
        >
          「Stickable」AI agents
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 52,
            fontWeight: 700,
            marginTop: 16,
            maxWidth: 980,
            lineHeight: 1.15,
          }}
        >
          Petassist, stuck on the desk
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            marginTop: 24,
            color: "#5a6478",
            maxWidth: 920,
          }}
        >
          Research only. Drafts only. This folder only.
        </div>
      </div>
    ),
    { ...size }
  );
}
