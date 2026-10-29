"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceLayout from "@/components/WorkspaceLayout";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Stats = {
  total_indicators: number;
  total_reports: number;
  confirmed_reports?: number;
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

type AuditResponse = {
  items: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
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

function statusLabel(status: string) {
  switch (status) {
    case "pending":
      return "En attente";
    case "confirmed":
      return "Confirmé";
    case "rejected":
      return "Rejeté";
    default:
      return status;
  }
}

export default function AdminDashboardPage() {
  const router = useRouter();

  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem("access_token");
    router.replace("/login");
  }, [router]);

  const loadDashboard = useCallback(async () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      handleUnauthorized();
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Vérifier les droits auprès du backend.
      const userResponse = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (userResponse.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!userResponse.ok) {
        throw new Error("Impossible de vérifier ton compte.");
      }

      const user = await userResponse.json();

      if (user.role !== "admin") {
        router.replace("/dashboard");
        return;
      }

      // Charger les statistiques publiques.
      const statsResponse = await fetch(`${API_URL}/api/v1/stats`, {
        cache: "no-store",
      });

      if (!statsResponse.ok) {
        throw new Error("Impossible de charger les statistiques.");
      }

      const statsData = (await statsResponse.json()) as Stats;
      setStats(statsData);

      // Charger le journal d'audit réservé aux administrateurs.
      const auditResponse = await fetch(
        `${API_URL}/api/v1/admin/audit?limit=10&offset=0`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      if (auditResponse.status === 401) {
        handleUnauthorized();
        return;
      }

      if (auditResponse.status === 403) {
        throw new Error(
          "Accès refusé au journal d'audit. Vérifie le rôle du compte."
        );
      }

      if (!auditResponse.ok) {
        throw new Error("Impossible de charger le journal d'audit.");
      }

      const auditData = (await auditResponse.json()) as AuditResponse;

      if (!Array.isArray(auditData.items)) {
        throw new Error("Format du journal d'audit invalide.");
      }

      setAudit(auditData.items);
      setAuditTotal(auditData.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue lors du chargement."
      );
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized, router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <WorkspaceLayout
      title="Administration"
      description="Supervision de la plateforme Hackthus Threat Intelligence"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-cyan-900/60 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/40 p-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-400">
            HTI / Control Center
          </p>

          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">
                Panneau d’administration
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Surveille les indicateurs confirmés et consulte les décisions
                prises par les modérateurs.
              </p>
            </div>

            <button
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="rounded-lg border border-cyan-700 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-950 disabled:opacity-50"
            >
              {loading ? "Actualisation..." : "Actualiser"}
            </button>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Vue d’ensemble
            </h2>
            <span className="text-xs text-slate-500">
              Données confirmées
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
              <p className="text-sm text-slate-400">
                Indicateurs confirmés
              </p>
              <p className="mt-3 text-3xl font-bold text-cyan-300">
                {loading ? "—" : stats?.total_indicators ?? 0}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Indicateurs distincts associés aux signalements confirmés
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
              <p className="text-sm text-slate-400">
                Signalements confirmés
              </p>
              <p className="mt-3 text-3xl font-bold text-emerald-300">
                {loading ? "—" : stats?.confirmed_reports ?? stats?.total_reports ?? 0}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Total fourni par la route statistique actuelle
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
              <p className="text-sm text-slate-400">
                Décisions de modération
              </p>
              <p className="mt-3 text-3xl font-bold text-violet-300">
                {loading ? "—" : auditTotal}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Décisions enregistrées dans le journal d’audit
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <button
            onClick={() => router.push("/admin/moderation")}
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:border-cyan-700 hover:bg-slate-900/80"
          >
            <p className="text-sm font-semibold text-cyan-300">
              MODÉRATION
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              Gérer les signalements
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Consulter les signalements en attente et confirmer ou rejeter
              ceux qui nécessitent une décision.
            </p>
            <span className="mt-4 inline-block text-sm text-cyan-400">
              Ouvrir la modération →
            </span>
          </button>

          <button
            onClick={() => router.push("/profile")}
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:border-cyan-700 hover:bg-slate-900/80"
          >
            <p className="text-sm font-semibold text-cyan-300">
              COMPTE
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              Profil administrateur
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Consulter les informations du compte actuellement connecté.
            </p>
            <span className="mt-4 inline-block text-sm text-cyan-400">
              Ouvrir le profil →
            </span>
          </button>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <div className="flex flex-col justify-between gap-2 border-b border-slate-800 p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Journal d’audit
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Les 10 dernières décisions de modération
              </p>
            </div>
            <span className="text-sm text-slate-500">
              {auditTotal} décision(s) au total
            </span>
          </div>

          {loading ? (
            <p className="p-5 text-sm text-slate-400">
              Chargement du journal...
            </p>
          ) : audit.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">
              Aucune décision de modération enregistrée pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-950/70 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Signalement</th>
                    <th className="px-5 py-3 font-medium">Modérateur</th>
                    <th className="px-5 py-3 font-medium">Ancien statut</th>
                    <th className="px-5 py-3 font-medium">Nouveau statut</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {audit.map((entry) => (
                    <tr key={entry.id} className="text-slate-300">
                      <td className="px-5 py-4 font-mono text-cyan-300">
                        #{entry.report_id}
                      </td>
                      <td className="px-5 py-4">
                        {entry.moderator_username}
                      </td>
                      <td className="px-5 py-4">
                        {statusLabel(entry.old_status)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={
                            entry.new_status === "confirmed"
                              ? "rounded-full bg-emerald-950 px-2.5 py-1 text-xs text-emerald-300"
                              : "rounded-full bg-red-950 px-2.5 py-1 text-xs text-red-300"
                          }
                        >
                          {statusLabel(entry.new_status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-400">
                        {formatDate(entry.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </WorkspaceLayout>
  );
}
