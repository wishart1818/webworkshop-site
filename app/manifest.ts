import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WebWorkshop",
    short_name: "WebWorkshop",
    description: "Modern websites for contractors and local businesses.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f2",
    theme_color: "#07100d",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
