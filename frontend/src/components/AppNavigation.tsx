"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type UserProfile = {
  id: number;
  username: string;
  email: string;
  role: "user" | "moderator" | "admin";
};

type NavigationItem = {
  href: string;
  label: string;
  symbol: string;
  roles?: UserProfile["role"][];
};

const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", symbol: "▦" },
  { href: "/", label: "Recherche", symbol: "⌕" },
  { href: "/report", label: "Signaler", symbol: "⚑" },
  { href: "/reports", label: "Mes signalements", symbol: "▤" },

  {
    href: "/admin/moderation",
    label: "Modération",
    symbol: "✓",
    roles: ["moderator", "admin"],
  },
  {
    href: "/admin",
    label: "Administration",
    symbol: "⚙",
    roles: ["admin"],
  },
];

function AppNavigationContent() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const checkSession = useCallback(async () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      setUser(null);
      setSessionChecked(true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/me`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem("access_token");
          setUser(null);
        }
        setSessionChecked(true);
        return;
      }

      const profile: unknown = await response.json();

      if (
        typeof profile === "object" &&
        profile !== null &&
        "id" in profile &&
        "username" in profile &&
        "email" in profile &&
        "role" in profile &&
        typeof profile.id === "number" &&
        typeof profile.username === "string" &&
        typeof profile.email === "string" &&
        ["user", "moderator", "admin"].includes(String(profile.role))
      ) {
        setUser(profile as UserProfile);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Impossible de vérifier la session :", error);
    } finally {
      setSessionChecked(true);
    }
  }, []);

  useEffect(() => {
    void checkSession();

    const handleStorage = () => {
      void checkSession();
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [checkSession, pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  function handleLogout() {
    localStorage.removeItem("access_token");
    setUser(null);
    setMobileMenuOpen(false);
    router.replace("/login");
    router.refresh();
  }

  function navigationLinkClass(active: boolean) {
    return [
      "flex shrink-0 items-center justify-center gap-2 rounded-lg",
      "border px-2.5 py-2 text-sm font-medium whitespace-nowrap",
      "transition-colors duration-200",
      active
        ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-300"
        : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-100",
    ].join(" ");
  }

  const visibleNavigation = navigation.filter(
    (item) =>
      !item.roles ||
      (user !== null && item.roles.includes(user.role))
  );

  function renderNavigation(mobile = false) {
    return (
      <nav
        aria-label={mobile ? "Navigation mobile" : "Navigation principale"}
        className={
          mobile
            ? "flex flex-col gap-1"
            : "hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex"
        }
      >
        {visibleNavigation.map((item) => {
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
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur-xl">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[76px] items-center justify-between gap-3">
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

          {renderNavigation()}

          <div className="hidden shrink-0 items-center justify-end gap-2 xl:flex">
            {!sessionChecked ? (
              <div
                className="h-10 w-24 animate-pulse rounded-lg bg-slate-800"
                aria-label="Chargement de la session"
              />
            ) : user ? (
              <>
                <span className="max-w-36 truncate px-2 text-sm text-slate-400">
                  {user.username}
                </span>
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

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-200 transition hover:border-cyan-400/50 hover:bg-slate-900 xl:hidden"
          >
            <span aria-hidden="true" className="text-xl">
              {mobileMenuOpen ? "×" : "☰"}
            </span>
          </button>
        </div>

        {mobileMenuOpen && (
          <div
            id="mobile-navigation"
            className="border-t border-slate-800 py-4 xl:hidden"
          >
            {renderNavigation(true)}

            <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-4">
              {!sessionChecked ? (
                <div className="h-10 animate-pulse rounded-lg bg-slate-800" />
              ) : user ? (
                <>
                  <div className="px-3 py-2 text-sm text-slate-400">
                    Connecté : {user.username} · {user.role}
                  </div>
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