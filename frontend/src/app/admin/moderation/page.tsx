
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceLayout from "@/components/WorkspaceLayout";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const PAGE_SIZE = 10;

type Report = {
  id: number;
  indicator_id?: number;
  resource_type?: string;
  value?: string;
  threat_type: string;
  description: string;
  report_status: string;
  created_at: string | null;
};

type PageData<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

type AuditEntry = {
  id: number;
  report_id: number;
  moderator_id: number;
  moderator_username: string;
  old_status: string;
  new_status: string;
  created_at: string | null;
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

function getErrorMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail;
  }
  return fallback;
}

export default function ModerationPage() {
  const router = useRouter();

  const [reports, setReports] = useState<Report[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);

  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const getToken = useCallback(() => {
    return localStorage.getItem("access_token");
  }, []);

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    router.replace("/login");
  }, [router]);

  const loadPendingReports = useCallback(async () => {
    const token = getToken();

    if (!token) {
      handleUnauthorized();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/v1/admin/reports/pending`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.status === 403) {
        throw new Error(
          "Accès refusé : seuls les modérateurs et administrateurs peuvent consulter cette page."
        );
      }

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data: unknown = await response.json();

      // L'API peut renvoyer une liste ou un objet paginé.
      const items = Array.isArray(data)
        ? data
        : typeof data === "object" &&
            data !== null &&
            "items" in data &&
            Array.isArray(data.items)
          ? data.items
          : null;

      if (!items) {
        throw new Error("Format de réponse des signalements invalide.");
      }

      setReports(items as Report[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les signalements."
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, handleUnauthorized]);

  const loadAudit = useCallback(async () => {
    const token = getToken();

    if (!token) return;

    setAuditLoading(true);

    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(auditOffset),
      });

      const response = await fetch(
        `${API_URL}/api/v1/admin/audit?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.status === 403) {
        setIsAdmin(false);
        setAudit([]);
        setAuditTotal(0);
        return;
      }

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data = (await response.json()) as PageData<AuditEntry>;

      if (!Array.isArray(data.items) || typeof data.total !== "number") {
        throw new Error("Format de réponse de l'audit invalide.");
      }

      setAudit(data.items);
      setAuditTotal(data.total);
      setIsAdmin(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Historique d'audit : ${err.message}`
          : "Impossible de charger l'audit."
      );
    } finally {
      setAuditLoading(false);
    }
  }, [auditOffset, getToken, handleUnauthorized]);

  useEffect(() => {
    void loadPendingReports();
  }, [loadPendingReports]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  async function moderateReport(
    reportId: number,
    status: "confirmed" | "rejected"
  ) {
    const token = getToken();

    if (!token) {
      handleUnauthorized();
      return;
    }

    const action = status === "confirmed" ? "confirmer" : "rejeter";

    if (!window.confirm(`Veux-tu vraiment ${action} le signalement #${reportId} ?`)) {
      return;
    }

    setBusyId(reportId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/v1/admin/reports/${reportId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ report_status: status }),
        }
      );

      const data: unknown = await response.json().catch(() => ({}));

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.status === 403) {
        throw new Error("Tu n'as pas les droits nécessaires.");
      }

      if (response.status === 409) {
        throw new Error(
          "Ce signalement a déjà été traité. Actualise la liste."
        );
      }

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, `Erreur HTTP ${response.status}`)
        );
      }

      setMessage(`Signalement #${reportId} : décision enregistrée.`);
      await loadPendingReports();
      await loadAudit();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "La modération a échoué."
      );
    } finally {
      setBusyId(null);
    }
  }

  function changeAuditPage(direction: -1 | 1) {
    setAuditOffset((offset) =>
      Math.max(
        0,
        Math.min(
          offset + direction * PAGE_SIZE,
          Math.max(0, auditTotal - 1)
        )
      )
    );
  }

  return (
    <WorkspaceLayout
      title="Centre de modération"
      description="Examine les signalements communautaires et suis les décisions enregistrées dans l'audit."
    >

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-300"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-emerald-300"
          >
            {message}
          </div>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                Signalements en attente
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {reports.length} signalement(s) chargé(s)
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadPendingReports()}
              disabled={loading}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:border-cyan-500 disabled:opacity-50"
            >
              Actualiser
            </button>
          </div>

          {loading ? (
            <p className="py-8 text-slate-400">Chargement des signalements…</p>
          ) : reports.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-slate-400">
              Aucun signalement en attente, ou aucun résultat accessible.
            </p>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <article
                  key={report.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-500">
                        Signalement #{report.id}
                      </p>
                      <h3 className="mt-1 break-all text-lg font-semibold text-white">
                        {report.value ?? `Indicateur #${report.indicator_id ?? "?"}`}
                      </h3>
                    </div>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                      En attente
                    </span>
                  </div>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Type de menace</dt>
                      <dd className="mt-1 text-sm">{report.threat_type}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Date de création</dt>
                      <dd className="mt-1 text-sm">{formatDate(report.created_at)}</dd>
                    </div>
                  </dl>

                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                    {report.description}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void moderateReport(report.id, "confirmed")}
                      className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === report.id ? "Traitement…" : "Confirmer"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void moderateReport(report.id, "rejected")}
                      className="rounded-lg border border-red-700 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Rejeter
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {isAdmin && (
          <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="text-xl font-semibold">Historique d'audit</h2>
              <p className="mt-1 text-sm text-slate-400">
                {auditTotal} décision(s) enregistrée(s)
              </p>
            </div>

            {auditLoading ? (
              <p className="py-6 text-slate-400">Chargement de l'audit…</p>
            ) : audit.length === 0 ? (
              <p className="text-slate-400">Aucune décision à afficher.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Rapport</th>
                        <th className="px-3 py-3">Modérateur</th>
                        <th className="px-3 py-3">Décision</th>
                        <th className="px-3 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((entry) => (
                        <tr key={entry.id} className="border-b border-slate-800/70">
                          <td className="px-3 py-3">#{entry.report_id}</td>
                          <td className="px-3 py-3">{entry.moderator_username}</td>
                          <td className="px-3 py-3">
                            {entry.old_status} → {entry.new_status}
                          </td>
                          <td className="px-3 py-3">{formatDate(entry.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-400">
                    Page {Math.floor(auditOffset / PAGE_SIZE) + 1} sur{" "}
                    {Math.max(1, Math.ceil(auditTotal / PAGE_SIZE))}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => changeAuditPage(-1)}
                      disabled={auditOffset === 0 || auditLoading}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40"
                    >
                      Précédent
                    </button>
                    <button
                      type="button"
                      onClick={() => changeAuditPage(1)}
                      disabled={auditOffset + PAGE_SIZE >= auditTotal || auditLoading}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        <p className="mt-6 text-xs leading-5 text-slate-500">
          L'API contrôle les permissions à chaque requête. L'affichage de
          l'historique est réservé aux administrateurs.
        </p>
    </WorkspaceLayout>
  );
}
