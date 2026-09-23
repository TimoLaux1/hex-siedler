import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "New Katan",
    short_name: "New Katan",
    description: "Das Hex-Strategiespiel mit Klaus.",
    id: "/new-katan-v4",
    start_url: "/",
    display: "fullscreen",
    background_color: "#f7f2e7",
    theme_color: "#f7f2e7",
    orientation: "landscape",
    icons: [
      { src: "/new-katan-icon-192-v3.png?v=4", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/new-katan-icon-512-v3.png?v=4", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
