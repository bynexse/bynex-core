import { ImageResponse } from "next/og";

export const alt = "Bynex – affärssystem för byggföretag";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 78px",
          color: "#f7f5f0",
          background:
            "radial-gradient(circle at 78% 12%, rgba(185,190,198,0.42), transparent 38%), linear-gradient(135deg, #111214 0%, #1d1f22 56%, #163522 100%)",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              background: "#b9bec6",
              color: "#111214",
              fontSize: 30,
            }}
          >
            B
          </div>
          Bynex
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 970 }}>
          <div
            style={{
              display: "flex",
              marginBottom: 24,
              color: "#b9bec6",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Bygg mer. Administrera mindre.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              lineHeight: 1.02,
              fontWeight: 700,
              letterSpacing: "-0.045em",
            }}
          >
            Affärssystemet för byggföretag
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              color: "#d7dade",
              fontSize: 28,
              lineHeight: 1.35,
            }}
          >
            Tidrapportering · Byggdagbok · ÄTA · Offert · Faktura · Bokföring
          </div>
        </div>
      </div>
    ),
    size,
  );
}
