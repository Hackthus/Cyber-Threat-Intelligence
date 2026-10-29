"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Role = "user" | "moderator" | "admin";

type Profile = {
  username: string;
  role: Role;
};

type NavigationItem = {
  href: string;
  label: string;
  symbol: string;
  roles?: Role[];
};

type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};

const navigation: NavigationGroup[] = [
  {
    title: "ESPACE PERSONNEL",
    items: [
      { href: "/profile", label: "Mon profil", symbol: "◉" },
      { href: "/dashboard", label: "Vue d’ensemble", symbol: "▦" },
      { href: "/", label: "Recherche CTI", symbol: "⌕" },
      { href: "/report", label: "Signaler une menace", symbol: "⚑" },
      { href: "/reports", label: "Mes signalements", symbol: "▤" },
    ],
  },
  {
    title: "SÉCURITÉ",
    items: [
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
    ],
  },
];

type WorkspaceLayoutProps = {
  children: ReactNode;
  title?: string;
  description?: string;
};

export default function WorkspaceLayout({
  children,
  title,
  description,
}: WorkspaceLayoutProps) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const token = localStorage.getItem("access_token");

      if (!token) {
        if (!cancelled) setChecked(true);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (response.status === 401) {
          localStorage.removeItem("access_token");
          if (!cancelled) setProfile(null);
          return;
        }

        if (!response.ok) return;

        const data: unknown = await response.json();

        if (
          typeof data === "object" &&
          data !== null &&
          "username" in data &&
          "role" in data &&
          typeof data.username === "string" &&
          ["user", "moderator", "admin"].includes(String(data.role))
        ) {
          if (!cancelled) {
            setProfile({
              username: data.username,
              role: data.role as Role,
            });
          }
        }
      } catch (error) {
        console.error("Impossible de charger le profil :", error);
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  const initials = profile?.username.slice(0, 2).toUpperCase() ?? "CT";

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8 lg:px-8">
      <aside className="h-fit w-full shrink-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 lg:sticky lg:top-24 lg:w-64">
        <div className="mb-5 flex items-center gap-3 border-b border-slate-800 px-2 pb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 font-bold text-cyan-300">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {checked ? profile?.username ?? "Visiteur" : "Chargement…"}
            </p>
            <p className="mt-1 text-xs capitalize text-slate-500">
              {profile?.role ?? "Espace CTI"}
            </p>
          </div>
        </div>

        <nav aria-label="Navigation de l’espace de travail" className="space-y-5">
          {navigation.map((group) => {
            const items = group.items.filter(
              (item) =>
                !item.roles ||
                (profile !== null && item.roles.includes(profile.role)),
            );

            if (items.length === 0) return null;

            return (
              <section key={group.title}>
                <h2 className="mb-2 px-3 text-[10px] font-bold tracking-[0.18em] text-slate-500">
                  {group.title}
                </h2>
                <div className="space-y-1">
                  {items.map((item) => {
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
                        className={[
                          "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition",
                          active
                            ? "border-cyan-400/20 bg-cyan-400/10 font-semibold text-cyan-300"
                            : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/70 hover:text-white",
                        ].join(" ")}
                      >
                        <span aria-hidden="true" className="w-5 text-center">
                          {item.symbol}
                        </span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </nav>

        <div className="mt-6 rounded-xl border border-cyan-400/10 bg-cyan-400/5 p-3">
          <p className="text-xs font-semibold text-cyan-300">
            Hackthus Threat Intelligence
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Partager les informations, comprendre les menaces.
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {(title || description) && (
          <header className="mb-6">
            {title && (
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {title}
              </h1>
            )}
            {description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {description}
              </p>
            )}
          </header>
        )}
        {children}
      </main>
    </div>
  );
}
