import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lily",
  description: "Lily 배포 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
