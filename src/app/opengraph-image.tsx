import { ImageResponse } from "next/og";

export const alt = "Junction Generator — Proof-of-Useful-Compute Layer-1 blockchain";
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
          justifyContent: "center",
          alignItems: "center",
          gap: "36px",
          background: "linear-gradient(135deg, #030209 0%, #0d0a24 60%, #1a0d33 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #00f2fe, #9b51e0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "38px",
              fontWeight: 800,
              color: "#030209",
            }}
          >
            JG
          </div>
          <div style={{ fontSize: "56px", fontWeight: 800 }}>Junction Generator</div>
        </div>
        <div style={{ display: "flex", fontSize: "34px", color: "#8b8aa0", textAlign: "center", maxWidth: "900px" }}>
          Mining compute redirected to real AI work
        </div>
        <div style={{ display: "flex", fontSize: "26px", color: "#00f2fe" }}>
          Proof-of-Useful-Compute • Layer-1 testnet live
        </div>
      </div>
    ),
    { ...size }
  );
}
