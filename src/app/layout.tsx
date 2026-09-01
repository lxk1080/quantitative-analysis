import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "量化分析",
  description: "本地前复权日线与技术指标选股工具",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
