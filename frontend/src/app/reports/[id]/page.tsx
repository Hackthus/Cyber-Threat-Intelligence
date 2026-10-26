
"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ReportDetails = {
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

const statusLabels: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  rejected: "Rejeté",
};

function formatDate(value: string | null): string {
  if (!value) return "Date inconnue";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

function ReportDetailsContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [report, setReport] = useState<ReportDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = String(params.id);

    if (!/^[1-9]\d*$/.test(id)) {
      setError("Identifiant de signalement invalide.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadReport() {
      try {
        // Récupérer le token de la session courante.
        const token = localStorage.getItem("access_token");

        if (!token) {
          router.replace("/login");
          return;
        }

        // Appel authentifié de l'API.
        const response = await fetch(
          `${API_URL}/api/v1/reports/${encodeURIComponent(id)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            cache: "no-store",
            signal: controller.signal,
          }
        );

        // Token absent, invalide ou expiré.
        if (response.status === 401) {
          localStorage.removeItem("access_token");
          router.replace("/login");
          return;
        }

        // L'utilisateur est connecté mais n'est pas autorisé.
        if (response.status === 403) {
          throw new Error(
            "Tu n'es pas autorisé à consulter ce signalement."
          );
        }

        if (response.status === 404) {
          throw new Error("Signalement introuvable.");
        }

        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status}`);
        }

        const result: ReportDetails = await response.json();
        setReport(result);
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Impossible de charger le signalement."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      controller.abort();
    };
  }, [params.id, router]);

  return (
    <main className="min-h-screen px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <button
          type="button"
          onClick={() => router.push("/reports")}
          className="rounded-xl border border-slate-700 px-4 py-2 text-sm hover:border-cyan-500"
        >
          ← Retour à l’historique
        </button>

        <header>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">
            Cyber Threat Intelligence
          </p>

          <h1 className="mt-3 text-3xl font-bold">
            Détails du signalement
          </h1>
        </header>

        {loading ? (
          <p className="rounded-xl border border-slate-800 p-6 text-slate-400">
            Chargement du signalement...
          </p>
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl border border-red-900 bg-red-950/30 p-6 text-red-300"
          >
            <p>{error}</p>

            <button
              type="button"
              onClick={() => router.push("/reports")}
              className="mt-4 rounded-lg border border-red-800 px-4 py-2 text-sm hover:bg-red-900/30"
            >
              Retour à mes signalements
            </button>
          </div>
        ) : report ? (
          <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div>
              <p className="text-sm text-slate-400">
                Ressource signalée
              </p>

              <p className="mt-2 break-all text-lg font-semibold text-cyan-300">
                {report.value}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {report.resource_type} · Indicateur #{report.indicator_id}
              </p>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <p className="text-sm text-slate-400">
                Type de menace
              </p>

              <p className="mt-2 font-medium">
                {report.threat_type}
              </p>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <p className="text-sm text-slate-400">
                Description
              </p>

              <p className="mt-2 whitespace-pre-wrap break-words leading-7">
                {report.description}
              </p>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <p className="text-sm text-slate-400">
                Statut
              </p>

              <p className="mt-2 font-medium">
                {statusLabels[report.report_status] ??
                  report.report_status}
              </p>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <p className="text-sm text-slate-400">
                Date de création
              </p>

              <p className="mt-2">
                {formatDate(report.created_at)}
              </p>
            </div>

            <p className="border-t border-slate-800 pt-4 text-xs text-slate-500">
              Identifiant du signalement : #{report.id}
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default function ReportDetailsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-10 text-slate-400">
          Chargement du signalement...
        </main>
      }
    >
      <ReportDetailsContent />
    </Suspense>
  );
}
