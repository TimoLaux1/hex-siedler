import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "New Katan",
    short_name: "New Katan",
    description: "Das Hex-Strategiespiel mit Klaus.",
    id: "/new-katan-v2",
    start_url: "/",
    display: "fullscreen",
    background_color: "#f7f2e7",
    theme_color: "#f7f2e7",
    orientation: "landscape",
    icons: [
      { src: "/new-katan-icon-192-v2.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/new-katan-icon-512-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
