import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans_KR({
  weight: ["400", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-sans-kr",
  adjustFontFallback: false,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Lily — 레포 하나로 피는 배포",
  description: "Lily 배포 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={plex.variable}>
      <body>{children}</body>
    </html>
  );
}
