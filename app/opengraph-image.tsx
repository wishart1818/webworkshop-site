/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { siteUrl } from "@/lib/site";

export const alt = "WebWorkshop, modern websites for contractors and local businesses";
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
          background: "#07100d",
          color: "#ffffff",
          padding: "54px 62px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.22)",
            paddingBottom: "28px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <img
              alt=""
              height="118"
              src={`${siteUrl}/brand/webworkshop-full.png`}
              style={{
                height: "118px",
                objectFit: "contain",
                width: "252px",
              }}
              width="252"
            />
          </div>
          <div style={{ color: "#36c7b3", fontSize: "18px", fontWeight: 800 }}>
            Independent web design studio
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "48px" }}>
          <div style={{ display: "flex", maxWidth: "760px", flexDirection: "column", gap: "24px" }}>
            <span style={{ color: "#36c7b3", fontSize: "22px", fontWeight: 800 }}>Web design studio</span>
            <span style={{ fontSize: "76px", fontWeight: 800, letterSpacing: "0", lineHeight: 0.95 }}>
              Better websites for local businesses.
            </span>
          </div>
          <div
            style={{
              width: "210px",
              height: "210px",
              display: "flex",
              alignItems: "flex-end",
              border: "2px solid #36c7b3",
              padding: "20px",
              color: "rgba(255,255,255,0.72)",
              fontSize: "18px",
              fontWeight: 700,
              lineHeight: 1.35,
            }}
          >
            Roofing, landscaping, HVAC, plumbing, and local services.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
