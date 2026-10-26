"use client";

import { useCallback, useEffect, useState } from "react";

type Stats = {
  total_indicators: number;
  total_reports: number;
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

type ReportsResponse = {
  items: ReportItem[];
  total: number;
  limit: number;
  offset: number;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const PAGE_SIZE = 20;

const cards = [
  {
    key: "total_indicators",
    label: "Indicateurs confirmés",
    description:
      "Indicateurs distincts associés aux signalements confirmés",
    icon: "◈",
    color: "cyan",
  },
  {
    key: "total_reports",
    label: "Signalements confirmés",
    description:
      "Nombre de signalements validés par la communauté",
    icon: "▤",
    color: "blue",
  },
  {
    key: "my_reports",
    label: "Mes signalements",
    description:
      "Nombre total de signalements associés à ton compte",
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
  confirmed:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-300",
};

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return value.toLocaleString("fr-FR");
}

function formatReportDate(value: string | null): string {
  if (!value) return "Date inconnue";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

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
      typeof data.total_reports === "number"
        ? data.total_reports
        : 0,
  };
}

function isReportsResponse(value: unknown): value is ReportsResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;

  return (
    Array.isArray(result.items) &&
    typeof result.total === "number" &&
    typeof result.limit === "number" &&
    typeof result.offset === "number"
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [recentReports, setRecentReports] = useState<ReportItem[]>([]);
  const [myReportsTotal, setMyReportsTotal] = useState<number | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState("");

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/v1/stats`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Erreur API : HTTP ${response.status}`);
      }

      const result: unknown = await response.json();

      if (typeof result !== "object" || result === null) {
        throw new Error("Format de statistiques invalide");
      }

      const normalized = normalizeStats(result as Partial<Stats>);

      setStats(normalized);
      setLastUpdated(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch (err) {
      console.error("Erreur lors du chargement des statistiques :", err);
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
        setMyReportsTotal(null);
        setReportsError(
          "Tu dois te connecter pour consulter tes signalements."
        );
        return;
      }

      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: "0",
      });

      const response = await fetch(
        `${API_URL}/api/v1/reports/mine?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        setRecentReports([]);
        setMyReportsTotal(null);
        setReportsError(
          "Ta session a expiré ou n'est plus valide. Reconnecte-toi."
        );
        return;
      }

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const result: unknown = await response.json();

      if (!isReportsResponse(result)) {
        throw new Error("Format de réponse inattendu");
      }

      setRecentReports(result.items);
      setMyReportsTotal(result.total);
    } catch (err) {
      console.error("Erreur lors du chargement des signalements :", err);
      setRecentReports([]);
      setMyReportsTotal(null);
      setReportsError(
        "Impossible de charger tes signalements. Vérifie que le backend fonctionne et que ta connexion est valide."
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

  const confirmedReports = stats?.total_reports ?? 0;
  const myReportsCount = myReportsTotal ?? 0;

  return (
    <main className="min-h-screen px-4 py-8 text-slate-100 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
              Cyber Threat Intelligence
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Tableau de bord
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Vue d’ensemble des indicateurs de menace, des
              signalements de la communauté et de ton activité.
            </p>

            {lastUpdated && (
              <p className="mt-3 text-xs text-slate-500">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
                Dernière mise à jour à {lastUpdated}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={refreshDashboard}
            disabled={loading || reportsLoading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/60 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">↻</span>
            {loading || reportsLoading ? "Actualisation..." : "Actualiser"}
          </button>
        </header>

        <section aria-labelledby="stats-title">
          <div className="mb-4">
            <h2
              id="stats-title"
              className="text-lg font-semibold text-white"
            >
              Vue d’ensemble
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Les chiffres clés de la plateforme et de ton compte.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
            >
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadStats()}
                className="mt-3 font-semibold underline underline-offset-4"
              >
                Réessayer
              </button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => {
              const value =
                card.key === "my_reports"
                  ? myReportsTotal ?? undefined
                  : stats?.[card.key];

              const accent =
                card.color === "cyan"
                  ? "text-cyan-300"
                  : card.color === "blue"
                    ? "text-blue-300"
                    : "text-emerald-300";

              const iconBackground =
                card.color === "cyan"
                  ? "border-cyan-400/20 bg-cyan-400/10"
                  : card.color === "blue"
                    ? "border-blue-400/20 bg-blue-400/10"
                    : "border-emerald-400/20 bg-emerald-400/10";

              const isPersonal = card.key === "my_reports";
              const isValueLoading = isPersonal
                ? reportsLoading
                : loading && !stats;

              return (
                <article
                  key={card.key}
                  className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900 sm:p-6"
                >
                  <div
                    aria-hidden="true"
                    className={`absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full opacity-20 blur-2xl ${
                      card.color === "cyan"
                        ? "bg-cyan-400"
                        : card.color === "blue"
                          ? "bg-blue-400"
                          : "bg-emerald-400"
                    }`}
                  />

                  <div className="relative flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-400">
                        {card.label}
                      </p>

                      <p
                        className={`mt-4 text-3xl font-bold tracking-tight sm:text-4xl ${accent}`}
                      >
                        {isValueLoading
                          ? "..."
                          : isPersonal && reportsError
                            ? "—"
                            : formatNumber(value)}
                      </p>
                    </div>

                    <span
                      aria-hidden="true"
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xl ${iconBackground} ${accent}`}
                    >
                      {card.icon}
                    </span>
                  </div>

                  <p className="relative mt-4 text-xs leading-5 text-slate-500">
                    {card.description}
                  </p>

                  {isPersonal && reportsError && !reportsLoading && (
                    <p className="mt-2 text-xs text-amber-300">
                      Statistique indisponible
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-lg text-emerald-300"
              >
                ✓
              </span>

              <div>
                <h2 className="font-semibold text-white">
                  Signalements confirmés
                </h2>

                <p className="mt-1 text-sm leading-5 text-slate-400">
                  Signalements validés et comptabilisés par la plateforme.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-end justify-between gap-4">
              <p className="text-3xl font-bold text-emerald-300">
                {loading && !stats
                  ? "..."
                  : formatNumber(stats?.total_reports)}
              </p>

              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                Confirmés
              </span>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{
                  width:
                    !loading && confirmedReports > 0 ? "100%" : "0%",
                }}
              />
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              Les signalements en attente ou rejetés ne sont pas inclus
              dans ce total.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-lg text-cyan-300"
              >
                ◈
              </span>

              <div>
                <h2 className="font-semibold text-white">
                  Indicateurs de menace
                </h2>

                <p className="mt-1 text-sm leading-5 text-slate-400">
                  Indicateurs distincts associés aux signalements confirmés.
                </p>
              </div>
            </div>

            <p className="mt-6 text-3xl font-bold text-cyan-300">
              {loading && !stats
                ? "..."
                : formatNumber(stats?.total_indicators)}
            </p>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              Nombre d’indicateurs distincts comptabilisés par l’API.
            </p>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Mes signalements
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Consulte les signalements associés à ton compte et leur statut.
              </p>
            </div>

            <span className="inline-flex w-fit items-center rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-300">
              {reportsLoading
                ? "Chargement..."
                : reportsError
                  ? "Indisponible"
                  : `${myReportsCount.toLocaleString("fr-FR")} résultat(s)`}
            </span>
          </div>

          {reportsError ? (
            <div className="p-6">
              <p role="alert" className="text-sm leading-6 text-amber-300">
                {reportsError}
              </p>

              <button
                type="button"
                onClick={() => void loadRecentReports()}
                disabled={reportsLoading}
                className="mt-4 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-500/50 hover:bg-slate-800 disabled:opacity-50"
              >
                Réessayer
              </button>
            </div>
          ) : reportsLoading ? (
            <div
              role="status"
              className="space-y-4 p-6"
              aria-label="Chargement des signalements"
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse border-b border-slate-800 pb-4 last:border-0"
                >
                  <div className="h-4 w-2/5 rounded bg-slate-800" />
                  <div className="mt-3 h-3 w-1/3 rounded bg-slate-800" />
                  <div className="mt-3 h-3 w-4/5 rounded bg-slate-800" />
                </div>
              ))}
            </div>
          ) : recentReports.length === 0 ? (
            <div className="p-8 text-center sm:p-12">
              <span
                aria-hidden="true"
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-2xl text-slate-400"
              >
                ▤
              </span>

              <h3 className="mt-4 font-semibold text-white">
                Aucun signalement pour le moment
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                Les signalements associés à ton compte apparaîtront ici
                dès qu’ils seront disponibles.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {recentReports.map((report) => (
                <article
                  key={report.id}
                  className="flex flex-col gap-4 p-5 transition hover:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-semibold text-cyan-300">
                      {report.value}
                    </p>

                    <p className="mt-2 text-xs text-slate-500">
                      {report.resource_type} · {report.threat_type}
                    </p>

                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                      {report.description || "Aucune description"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-row flex-wrap items-center gap-3 sm:flex-col sm:items-end">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
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

        <footer className="border-t border-slate-800 pt-5 text-center text-xs text-slate-500">
          Hackthus Threat Intelligence · Community Edition
        </footer>
      </div>
    </main>
  );
}
