import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threadform — Embroidery Studio",
  description: "Turn artwork into editable embroidery. Plan satin and tatami stitches, inspect the sewing sequence, and export machine files.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
