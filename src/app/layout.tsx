import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mirasphere Studio",
  description: "Branded story videos, cartoons and AI presenters — generated in-house.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <nav className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-8 px-6 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Mira<span className="text-violet-400">sphere</span> Studio
            </Link>
            <div className="flex gap-5 text-sm text-slate-300">
              <Link href="/" className="hover:text-white">Videos</Link>
              <Link href="/new" className="hover:text-white">New video</Link>
              <Link href="/voices" className="hover:text-white">Voices</Link>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
