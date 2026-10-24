
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Tableau de bord", symbol: "▦" },
  { href: "/", label: "Recherche", symbol: "⌕" },
  { href: "/report", label: "Signaler une menace", symbol: "⚑" },
  { href: "/reports", label: "Historique", symbol: "▤" },
];

export default function AppNavigation() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-lg font-black text-cyan-300">
            H
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight text-white">
              HTI
            </span>
            <span className="block text-xs text-slate-400">
              Hackthus Threat Intelligence
            </span>
          </span>
        </Link>

        <nav
          aria-label="Navigation principale"
          className="flex flex-wrap gap-2"
        >
          {navigation.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                    : "border border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <span aria-hidden="true">{item.symbol}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <span className="hidden rounded-full border border-emerald-800/70 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-300 xl:inline-flex">
          ● Community Edition
        </span>
      </div>
    </header>
  );
}
