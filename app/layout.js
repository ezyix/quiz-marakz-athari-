import "./globals.css";

export const metadata = {
  title: "Al-Markazul-Athari-QUIZ",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en">
      <body>{children}</body>
    </html>
  );
}
