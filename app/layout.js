import "./globals.css";

export const metadata = {
  title: "Al-Markazul-Athari-QUIZ",
  icons: {
    icon: "/quiz-app-icon.png",
    apple: "/quiz-app-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en">
      <body>{children}</body>
    </html>
  );
}
