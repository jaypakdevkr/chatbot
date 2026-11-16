import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Morrow — AI 어시스턴트",
  description: "무엇이든 편하게 물어보세요. Morrow가 함께 생각해 드릴게요.",
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
