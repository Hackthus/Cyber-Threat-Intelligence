
"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Tableau de bord", symbol: "▦" },
  { href: "/", label: "Recherche", symbol: "⌕" },
  { href: "/report", label: "Signaler une menace", symbol: "⚑" },
  { href: "/reports", label: "Historique", symbol: "▤" },
];

function AppNavigationContent() {
  const pathname = usePathname();
  const router = useRouter();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkSession = () => {
      setIsAuthenticated(
        Boolean(localStorage.getItem("access_token"))
      );
      setSessionChecked(true);
    };

    checkSession();

    window.addEventListener("storage", checkSession);

    return () => {
      window.removeEventListener("storage", checkSession);
    };
  }, [pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  function handleLogout() {
    localStorage.removeItem("access_token");
    setIsAuthenticated(false);
    setMobileMenuOpen(false);
    router.replace("/login");
    router.refresh();
  }

  function navigationLinkClass(active: boolean) {
    return [
      "flex items-center gap-2 rounded-lg border px-3 py-2.5",
      "text-sm font-medium transition-colors duration-200",
      active
        ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-300"
        : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-100",
    ].join(" ");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur-xl">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[76px] items-center justify-between gap-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex min-w-0 shrink-0 items-center gap-3"
            aria-label="Cyber Threat Intelligence - Accueil"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-lg font-black tracking-tight text-cyan-300">
              CTI
            </span>

            <span className="min-w-0">
              <span className="block whitespace-nowrap text-sm font-bold tracking-tight text-white sm:text-base">
                Cyber Threat Intelligence
              </span>
              <span className="hidden text-xs text-slate-500 sm:block">
                Community Threat Intelligence Platform
              </span>
            </span>
          </Link>

          {/* Navigation desktop */}
          <nav
            aria-label="Navigation principale"
            className="hidden items-center gap-1 xl:flex"
          >
            {navigation.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={navigationLinkClass(active)}
                >
                  <span aria-hidden="true">{item.symbol}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Actions du compte */}
          <div className="hidden shrink-0 items-center justify-end gap-2 xl:flex">
            {!sessionChecked ? (
              <div
                className="h-10 w-24 animate-pulse rounded-lg bg-slate-800"
                aria-label="Chargement de la session"
              />
            ) : isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-cyan-300"
                >
                  Mon espace
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-cyan-400/50 hover:text-white"
                >
                  Connexion
                </Link>

                <Link
                  href="/register"
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                >
                  Inscription
                </Link>
              </>
            )}
          </div>

          {/* Bouton du menu mobile et tablette */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={
              mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"
            }
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-200 transition hover:border-cyan-400/50 hover:bg-slate-900 xl:hidden"
          >
            <span aria-hidden="true" className="text-xl">
              {mobileMenuOpen ? "×" : "☰"}
            </span>
          </button>
        </div>

        {/* Navigation mobile et tablette */}
        {mobileMenuOpen && (
          <div
            id="mobile-navigation"
            className="border-t border-slate-800 py-4 xl:hidden"
          >
            <nav
              aria-label="Navigation mobile"
              className="flex flex-col gap-1"
            >
              {navigation.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={navigationLinkClass(active)}
                  >
                    <span aria-hidden="true">{item.symbol}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-4">
              {!sessionChecked ? (
                <div className="h-10 animate-pulse rounded-lg bg-slate-800" />
              ) : isAuthenticated ? (
                <>
                  <Link
                    href="/dashboard"
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-900"
                  >
                    Mon espace
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-lg border border-slate-700 px-4 py-2.5 text-left text-sm font-medium text-slate-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                  >
                    Déconnexion
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="rounded-lg border border-slate-700 px-4 py-2.5 text-center text-sm font-medium text-slate-300 hover:border-cyan-400/50 hover:text-white"
                  >
                    Connexion
                  </Link>

                  <Link
                    href="/register"
                    className="rounded-lg bg-cyan-500 px-4 py-2.5 text-center text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                  >
                    Inscription
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export default function AppNavigation() {
  return (
    <Suspense
      fallback={
        <header className="min-h-[76px] border-b border-slate-800 bg-slate-950" />
      }
    >
      <AppNavigationContent />
    </Suspense>
  );
}
