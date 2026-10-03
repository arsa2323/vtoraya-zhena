import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Вторая жена — кавказская кухня",
  description: "Меню, доставка и самовывоз кафе Вторая жена",
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
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
