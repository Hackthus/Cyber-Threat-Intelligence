
"use client";

import { useCallback, useEffect, useState } from "react";

type Stats = {
  total_indicators: number;
  total_reports: number;
  pending_reports: number;
  confirmed_reports: number;
  rejected_reports: number;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const cards = [
  {
    key: "total_indicators",
    label: "Indicateurs recensés",
    description: "Domaines, URL et e-mails uniques",
    icon: "◈",
    color: "cyan",
  },
  {
    key: "total_reports",
    label: "Signalements totaux",
    description: "Tous les signalements reçus",
    icon: "▤",
    color: "blue",
  },
  {
    key: "pending_reports",
    label: "En attente",
    description: "À examiner",
    icon: "◷",
    color: "amber",
  },
  {
    key: "confirmed_reports",
    label: "Confirmés",
    description: "Signalements validés",
    icon: "✓",
    color: "green",
  },
  {
    key: "rejected_reports",
    label: "Rejetés",
    description: "Signalements rejetés",
    icon: "×",
    color: "red",
  },
] as const;

const styles: Record<string, string> = {
  cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
  blue: "border-blue-500/20 bg-blue-500/10 text-blue-300",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  red: "border-red-500/20 bg-red-500/10 text-red-300",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/v1/stats`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Erreur API : HTTP ${response.status}`);
      }

      const data: Stats = await response.json();

      setStats(data);
      setLastUpdated(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch {
      setError(
        "Impossible de récupérer les statistiques. Vérifie que le backend est démarré."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const totalProcessed =
    (stats?.confirmed_reports ?? 0) + (stats?.rejected_reports ?? 0);

  const confirmationRate =
    totalProcessed > 0
      ? Math.round(
          ((stats?.confirmed_reports ?? 0) / totalProcessed) * 100
        )
      : 0;

  return (
    <main className="min-h-screen px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">
              Threat Intelligence Platform
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Tableau de bord
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Vue d’ensemble des indicateurs et des signalements de la
              communauté Hackthus Threat Intelligence.
            </p>
          </div>

          <button
            onClick={() => void loadStats()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold transition hover:border-cyan-500/50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">↻</span>
            {loading ? "Actualisation..." : "Actualiser"}
          </button>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-50 ${
                    error ? "bg-red-400" : "bg-emerald-400"
                  }`}
                />
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${
                    error ? "bg-red-500" : "bg-emerald-400"
                  }`}
                />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {error ? "API indisponible" : "Vue d'ensemble HTI"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {error
                    ? "La connexion au service doit être vérifiée."
                    : "Statistiques issues de la base de données"}
                </p>
              </div>
            </div>

            {lastUpdated && !error && (
              <p className="text-xs text-slate-500">
                Dernière actualisation : {lastUpdated}
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-300"
            >
              {error}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Statistiques principales</h2>
            <span className="text-xs text-slate-500">Données en direct</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <article
                key={card.key}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-400">{card.label}</p>
                    <p className="mt-3 text-4xl font-bold tracking-tight">
                      {loading && !stats ? (
                        <span className="text-2xl text-slate-600">...</span>
                      ) : stats ? (
                        stats[card.key].toLocaleString("fr-FR")
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>

                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl font-bold ${styles[card.color]}`}
                  >
                    {card.icon}
                  </span>
                </div>

                <p className="mt-4 text-xs text-slate-500">
                  {card.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold">État des signalements</h2>
            <p className="mt-1 text-sm text-slate-400">
              Répartition selon le statut de validation.
            </p>

            <div className="mt-6 space-y-5">
              {(
                [
                  {
                    label: "En attente",
                    key: "pending_reports",
                    color: "bg-amber-400",
                  },
                  {
                    label: "Confirmés",
                    key: "confirmed_reports",
                    color: "bg-emerald-400",
                  },
                  {
                    label: "Rejetés",
                    key: "rejected_reports",
                    color: "bg-red-400",
                  },
                ] as const
              ).map((item) => {
                const value = stats?.[item.key] ?? 0;
                const percentage =
                  stats && stats.total_reports > 0
                    ? (value / stats.total_reports) * 100
                    : 0;

                return (
                  <div key={item.key}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-300">{item.label}</span>
                      <span className="font-semibold tabular-nums">
                        {loading && !stats ? "..." : value}
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-slate-800"
                      role="progressbar"
                      aria-label={item.label}
                      aria-valuenow={Math.round(percentage)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold">Validation communautaire</h2>
            <p className="mt-1 text-sm text-slate-400">
              Indicateur calculé sur les signalements déjà traités.
            </p>

            <div className="mt-6 flex items-center gap-5">
              <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4 border-cyan-500/30">
                <span className="text-2xl font-bold text-cyan-300">
                  {stats && totalProcessed > 0 ? `${confirmationRate}%` : "—"}
                </span>
                <span className="text-[10px] text-slate-500">Confirmés</span>
              </div>

              <div className="space-y-2 text-sm">
                <p className="text-slate-300">
                  <span className="font-semibold text-emerald-300">
                    {stats?.confirmed_reports ?? "—"}
                  </span>{" "}
                  confirmés
                </p>
                <p className="text-slate-300">
                  <span className="font-semibold text-red-300">
                    {stats?.rejected_reports ?? "—"}
                  </span>{" "}
                  rejetés
                </p>
                <p className="text-xs leading-5 text-slate-500">
                  Les signalements en attente ne sont pas comptés comme des
                  menaces confirmées.
                </p>
              </div>
            </div>
          </article>
        </section>

        <footer className="border-t border-slate-800 pt-5 text-center text-xs text-slate-500">
          HTI · Hackthus Threat Intelligence · Community Edition
        </footer>
      </div>
    </main>
  );
}
