import type { MetadataRoute } from "next";

const logo = "https://res.cloudinary.com/azrvy9ub/image/upload/f_png,c_pad,b_rgb:ffffff,w_512,h_512/v1794349210/1793911899888.jpg";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Digi Biashara",
    short_name: "Digi Biashara",
    description: "Business management for Kenyan businesses",
    start_url: "/open",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#fff8f0",
    theme_color: "#0755e8",
    icons: [
      {
        src: "https://res.cloudinary.com/azrvy9ub/image/upload/f_png,c_pad,b_rgb:ffffff,w_192,h_192/v1794349210/1793911899888.jpg",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "https://res.cloudinary.com/azrvy9ub/image/upload/f_png,c_pad,b_rgb:ffffff,w_512,h_512/v1794349210/1793911899888.jpg",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: logo,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    categories: ["business", "finance", "productivity"],
    lang: "en",
  };
}
