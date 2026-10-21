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
        sizes: "706x803",
        type: "image/png",
      },
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
