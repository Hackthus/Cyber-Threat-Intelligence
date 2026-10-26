
"use client";

import { useCallback, useEffect, useState } from "react";

type Stats = {
  total_indicators: number;
  total_reports: number;
  confirmed_reports: number;
};

type ReportItem = {
  id: number;
  indicator_id: number;
  resource_type: string;
  value: string;
  threat_type: string;
  description: string;
  report_status: string;
  created_at: string | null;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const cards = [
  {
    key: "total_indicators",
    label: "Indicateurs confirmés",
    description: "Indicateurs associés aux signalements confirmés",
    icon: "◈",
    color: "cyan",
  },
  {
    key: "total_reports",
    label: "Signalements confirmés",
    description: "Nombre de signalements validés",
    icon: "▤",
    color: "blue",
  },
  {
    key: "confirmed_reports",
    label: "Total confirmés",
    description: "Signalements validés",
    icon: "✓",
    color: "green",
  },
] as const;

const statusLabels: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  rejected: "Rejeté",
};

const statusStyles: Record<string, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  confirmed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-300",
};

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("fr-FR");
}

function formatReportDate(value: string | null): string {
  if (!value) return "Date inconnue";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date inconnue";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeStats(data: Partial<Stats>): Stats {
  return {
    total_indicators:
      typeof data.total_indicators === "number"
        ? data.total_indicators
        : 0,
    total_reports:
      typeof data.total_reports === "number" ? data.total_reports : 0,
    confirmed_reports:
      typeof data.confirmed_reports === "number"
        ? data.confirmed_reports
        : 0,
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [recentReports, setRecentReports] = useState<ReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState("");

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

      const data: Partial<Stats> = await response.json();

      setStats(normalizeStats(data));
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

  const loadRecentReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError("");

    try {
      const token = localStorage.getItem("access_token");

      if (!token) {
        setRecentReports([]);
        setReportsError(
          "Tu dois te connecter pour consulter tes signalements."
        );
        return;
      }

      const response = await fetch(`${API_URL}/api/v1/reports/mine`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("access_token");
        setRecentReports([]);
        setReportsError(
          "Ta session a expiré ou n'est plus valide. Reconnecte-toi."
        );
        return;
      }

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const result: unknown = await response.json();

      if (!Array.isArray(result)) {
        throw new Error("Format de réponse inattendu");
      }

      setRecentReports(result as ReportItem[]);
    } catch {
      setReportsError(
        "Impossible de charger tes signalements. Vérifie que le backend est démarré."
      );
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(() => {
    void loadStats();
    void loadRecentReports();
  }, [loadStats, loadRecentReports]);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  return (
    <main className="min-h-screen px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* En-tête */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-400">
              Hackthus Threat Intelligence
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Tableau de bord
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Vue d’ensemble des indicateurs de menace et de tes signalements.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshDashboard}
            disabled={loading || reportsLoading}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium transition hover:border-cyan-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading || reportsLoading ? "Chargement..." : "Actualiser"}
          </button>
        </header>

        {/* Statistiques publiques */}
        <section aria-labelledby="stats-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 id="stats-title" className="text-xl font-semibold">
              Statistiques publiques
            </h2>
            {lastUpdated && (
              <p className="text-xs text-slate-500">
                Dernière mise à jour : {lastUpdated}
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
            >
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadStats()}
                className="mt-2 font-semibold underline"
              >
                Réessayer
              </button>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => {
              const value = stats?.[card.key];

              const accent =
                card.color === "cyan"
                  ? "text-cyan-300"
                  : card.color === "blue"
                    ? "text-blue-300"
                    : "text-emerald-300";

              return (
                <article
                  key={card.key}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-slate-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-400">
                        {card.label}
                      </p>
                      <p className={`mt-3 text-3xl font-bold ${accent}`}>
                        {loading && !stats ? "..." : formatNumber(value)}
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-xl ${accent}`}
                    >
                      {card.icon}
                    </span>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    {card.description}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* État des données publiques */}
        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold">
              État des signalements publics
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Seuls les signalements confirmés sont comptabilisés dans les
              statistiques publiques.
            </p>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-300">
                  Signalements confirmés
                </span>
                <span className="font-semibold text-emerald-300">
                  {loading && !stats
                    ? "..."
                    : formatNumber(stats?.confirmed_reports)}
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{
                    width:
                      stats && stats.confirmed_reports > 0 ? "100%" : "0%",
                  }}
                />
              </div>
            </div>

            <p className="mt-5 text-xs leading-5 text-slate-500">
              Les signalements en attente ou rejetés ne sont pas exposés dans
              les statistiques publiques.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold">
              Indicateurs de menace
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Indicateurs associés aux signalements confirmés.
            </p>

            <p className="mt-6 text-3xl font-bold text-cyan-300">
              {loading && !stats
                ? "..."
                : formatNumber(stats?.total_indicators)}
            </p>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              Nombre d’indicateurs comptabilisés par l’API.
            </p>
          </article>
        </section>

        {/* Mes signalements */}
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="flex flex-col gap-2 border-b border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Mes signalements</h2>
              <p className="mt-1 text-sm text-slate-400">
                Historique personnel et statut de tes signalements.
              </p>
            </div>

            <span className="text-sm text-slate-500">
              {recentReports.length} résultat(s)
            </span>
          </div>

          {reportsError ? (
            <div className="p-6">
              <p role="alert" className="text-sm text-amber-300">
                {reportsError}
              </p>
              <button
                type="button"
                onClick={() => void loadRecentReports()}
                className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
              >
                Réessayer
              </button>
            </div>
          ) : reportsLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Chargement de tes signalements...
            </div>
          ) : recentReports.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-semibold">Aucun signalement récent</p>
              <p className="mt-2 text-sm text-slate-400">
                Les nouveaux signalements apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {recentReports.map((report) => (
                <article
                  key={report.id}
                  className="flex flex-col gap-3 p-5 transition hover:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-all font-medium text-cyan-300">
                      {report.value}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {report.resource_type} · {report.threat_type}
                    </p>

                    <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                      {report.description || "Aucune description"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        statusStyles[report.report_status] ??
                        "border-slate-700 bg-slate-800 text-slate-300"
                      }`}
                    >
                      {statusLabels[report.report_status] ??
                        report.report_status}
                    </span>

                    <time
                      dateTime={report.created_at ?? undefined}
                      className="text-xs text-slate-500"
                    >
                      {formatReportDate(report.created_at)}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Pied de page */}
        <footer className="border-t border-slate-800 pt-5 text-center text-xs text-slate-500">
          Cyber Threat Intelligence · Community Edition
        </footer>
      </div>
    </main>
  );
}
