import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "New Katan",
    short_name: "New Katan",
    description: "Das Hex-Strategiespiel mit Klaus.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f2e7",
    theme_color: "#1f6b57",
    orientation: "landscape",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
