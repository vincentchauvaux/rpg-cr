import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple Touch Icon — dé D20 stylisé. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f1419",
          borderRadius: 36,
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#c9a227",
            transform: "rotate(45deg)",
            border: "4px solid #8b6914",
          }}
        >
          <div
            style={{
              display: "flex",
              transform: "rotate(-45deg)",
              color: "#1a1510",
              fontSize: 48,
              fontWeight: 700,
              fontFamily: "Georgia, serif",
              lineHeight: 1,
            }}
          >
            20
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
