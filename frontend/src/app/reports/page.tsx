
"use client";

import { useCallback, useEffect, useState } from "react";

type ReportItem = {
  id: number;
  indicator_id: number;
  resource_type: "url" | "domain" | "email" | string;
  value: string;
  threat_type: string;
  description: string;
  report_status: "pending" | "confirmed" | "rejected" | string;
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

function formatDate(value: string | null) {
  if (!value) return "Date inconnue";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Date inconnue";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsResponse | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");


  
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(offset),
      });

      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (resourceTypeFilter) {
        params.set("resource_type", resourceTypeFilter);
      }

      const response = await fetch(
        `${API_URL}/api/v1/reports?${params.toString()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const result: ReportsResponse = await response.json();
      setData(result);
    } catch {
      setError(
        "Impossible de charger les signalements. Vérifie que le backend est démarré et que la route API existe."
      );
    } finally {
      setLoading(false);
    }
  }, [offset, search, statusFilter, resourceTypeFilter]);


  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    setOffset(0);
  }, [search, statusFilter, resourceTypeFilter]);


  return (
    <main className="min-h-screen px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">
              Cyber Threat Intelligence
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Historique des signalements
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Consulte les ressources signalées par la communauté, leur
              catégorie et leur statut de validation.
            </p>
          </div>

          <button
            onClick={() => void loadReports()}
            disabled={loading}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold hover:border-cyan-500/50 disabled:opacity-50"
          >
            {loading ? "Chargement..." : "↻ Actualiser"}
          </button>
        </header>


        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="report-search"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Rechercher
              </label>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setOffset(0);
                  setSearch(searchInput.trim());
                }}
              >
                <input
                  id="report-search"
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Domaine, URL, IP, menace..."
                  maxLength={200}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  Rechercher
                </button>
              </form>
            </div>

            <div>
              <label
                htmlFor="report-status"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Statut
              </label>
              <select
                id="report-status"
                value={statusFilter}
                onChange={(event) => {
                  setOffset(0);
                  setStatusFilter(event.target.value);
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-cyan-500"
              >
                <option value="">Tous les statuts</option>
                <option value="pending">En attente</option>
                <option value="confirmed">Confirmés</option>
                <option value="rejected">Rejetés</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="report-resource-type"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Type de ressource
              </label>
              <select
                id="report-resource-type"
                value={resourceTypeFilter}
                onChange={(event) => {
                  setOffset(0);
                  setResourceTypeFilter(event.target.value);
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-cyan-500"
              >
                <option value="">Tous les types</option>
                <option value="url">URL</option>
                <option value="domain">Domaine</option>
                <option value="email">E-mail</option>
                <option value="ip">Adresse IP</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setStatusFilter("");
              setResourceTypeFilter("");
              setOffset(0);
            }}
            className="mt-4 text-sm text-cyan-400 hover:text-cyan-300"
          >
            Réinitialiser les filtres
          </button>
        </section>


        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Signalements enregistrés</p>
            <p className="mt-3 text-3xl font-bold">
              {data ? data.total.toLocaleString("fr-FR") : loading ? "..." : "—"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Résultats affichés</p>
            <p className="mt-3 text-3xl font-bold">
              {data ? data.items.length : loading ? "..." : "—"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-400">Page actuelle</p>
            <p className="mt-3 text-3xl font-bold">
              {Math.floor(offset / 20) + 1}
            </p>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <div>
              <h2 className="font-semibold">Tous les signalements</h2>
              <p className="mt-1 text-xs text-slate-500">
                Les plus récents apparaissent en premier.
              </p>
            </div>
            <span className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400">
              API CTI
            </span>
          </div>

          {loading && !data ? (
            <p className="p-8 text-center text-sm text-slate-400">
              Chargement des signalements...
            </p>
          ) : data && data.items.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-semibold">Aucun signalement sur cette page</p>
              <p className="mt-2 text-sm text-slate-400">
                Les nouveaux signalements apparaîtront ici.
              </p>
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-slate-950/60 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-4 font-medium">Ressource</th>
                      <th className="px-5 py-4 font-medium">Menace</th>
                      <th className="px-5 py-4 font-medium">Description</th>
                      <th className="px-5 py-4 font-medium">Statut</th>
                      <th className="px-5 py-4 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.items.map((report) => (
                      <tr
                        key={report.id}
                        onClick={() => {
                          window.location.href = `/reports/${report.id}`;
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            window.location.href = `/reports/${report.id}`;
                          }
                        }}
                        tabIndex={0}
                        role="link"
                        aria-label={`Voir les détails du signalement ${report.id}`}
                        className="cursor-pointer transition hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-500"
                      >
                        <td className="px-5 py-4">
                          <p className="max-w-xs break-all font-medium text-cyan-300">
                            {report.value}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {report.resource_type} · ID {report.indicator_id}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300">
                            {report.threat_type}
                          </span>
                        </td>
                        <td className="max-w-sm px-5 py-4 text-slate-400">
                          <p className="line-clamp-3 whitespace-pre-wrap">
                            {report.description}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
                              statusStyles[report.report_status] ??
                              "border-slate-700 bg-slate-800 text-slate-300"
                            }`}
                          >
                            {statusLabels[report.report_status] ??
                              report.report_status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-400">
                          {formatDate(report.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
                <p className="text-xs text-slate-500">
                  {data.total === 0
                    ? "Aucun résultat"
                    : `Résultats ${offset + 1} à ${
                        offset + data.items.length
                      } sur ${data.total}`}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOffset((current) => Math.max(0, current - 20))}
                    disabled={offset === 0 || loading}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Précédent
                  </button>
                  <button
                    onClick={() => setOffset((current) => current + 20)}
                    disabled={
                      loading || offset + data.items.length >= data.total
                    }
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <p className="text-center text-xs text-slate-600">
          Cyber Threat Intelligence · Community Edition
        </p>
      </div>
    </main>
  );
}
