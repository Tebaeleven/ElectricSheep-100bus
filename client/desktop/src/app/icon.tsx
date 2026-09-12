import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#302c55",
          borderRadius: 10,
          color: "#ffd4e0",
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: -1,
        }}
      >
        P
      </div>
    ),
    { ...size }
  );
}
