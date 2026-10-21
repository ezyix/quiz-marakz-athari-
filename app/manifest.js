export default function manifest() {
  return {
    name: "Al Markazul Athari Quiz Admin",
    short_name: "Quiz Admin",
    description: "Admin dashboard for the Al Markazul Athari quiz.",
    start_url: "/admin",
    display: "standalone",
    background_color: "#f4f6f3",
    theme_color: "#397fcf",
    icons: [
      {
        src: "/logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
