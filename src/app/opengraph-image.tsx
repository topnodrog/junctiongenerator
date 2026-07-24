import { ImageResponse } from "next/og";

export const alt = "Junction Generator — make mining useful";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: "28px",
          padding: "76px 84px",
          background: "radial-gradient(circle at 80% 15%, rgba(88,228,178,.18), transparent 35%), #070b0d",
          color: "#effbf6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "32px",
              border: "2px solid #58e4b2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              fontWeight: 800,
              color: "#9fffd9",
            }}
          >
            JG
          </div>
          <div style={{ display: "flex", fontSize: "30px", fontWeight: 700 }}>Junction Generator</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "28px", fontSize: "78px", fontWeight: 700, lineHeight: .96, letterSpacing: "-4px" }}>
          <span>What if mining</span>
          <span style={{ color: "#58e4b2" }}>did useful work?</span>
        </div>
        <div style={{ display: "flex", fontSize: "23px", color: "#93aaa1", maxWidth: "850px", lineHeight: 1.4 }}>
          A community-owned network turning local AI inference into independently verifiable useful compute.
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: "17px", color: "#58e4b2", letterSpacing: "2px" }}>
          LOCAL/PRIVATE TESTNET • BUILDING IN PUBLIC
        </div>
      </div>
    ),
    { ...size },
  );
}
