
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";

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

const resourceLabels: Record<string, string> = {
  domain: "Nom de domaine",
  url: "URL",
  email: "Adresse e-mail",
  ip: "Adresse IP",
};

const statusLabels: Record<string, string> = {
  pending: "En attente de vérification",
  confirmed: "Confirmé après vérification",
  rejected: "Rejeté après vérification",
};

function ReportSuccessContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [report, setReport] = useState<ReportDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadReport() {
      setLoading(true);
      setError("");
      setReport(null);

      if (!id || !/^[1-9]\d*$/.test(id)) {
        setError("La référence du signalement est invalide.");
        setLoading(false);
        return;
      }

      const token = localStorage.getItem("access_token");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      try {
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

        if (response.status === 401) {
          localStorage.removeItem("access_token");

          if (!cancelled) {
            window.location.href = "/login";
          }

          return;
        }

        if (response.status === 403) {
          throw new Error(
            "Tu n'es pas autorisé à consulter ce signalement."
          );
        }

        if (response.status === 404) {
          throw new Error("Ce signalement est introuvable.");
        }

        if (!response.ok) {
          throw new Error(`Erreur du serveur : HTTP ${response.status}.`);
        }

        const data: ReportDetails = await response.json();

        if (!cancelled) {
          setReport(data);
        }
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Une erreur est survenue lors du chargement."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 mt-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
            Cyber Threat Intelligence
          </p>

          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            Confirmation du signalement
          </h1>

          <p className="mt-4 leading-7 text-slate-400">
            Consulte les informations enregistrées par la plateforme.
          </p>
        </header>

        {loading && (
          <p role="status" className="rounded-xl bg-slate-900 p-5">
            Chargement du signalement...
          </p>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="rounded-xl border border-red-800 bg-red-950/40 p-5 text-red-300"
          >
            {error}
          </div>
        )}

        {!loading && report && (
          <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-emerald-300">
              Signalement enregistré
            </h2>

            <div>
              <p className="text-sm text-slate-400">Référence</p>
              <p className="font-semibold">#{report.id}</p>
            </div>

            <div>
              <p className="text-sm text-slate-400">Type de ressource</p>
              <p>
                {resourceLabels[report.resource_type] ??
                  report.resource_type}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-400">
                Ressource signalée
              </p>
              <p className="break-all font-mono">{report.value}</p>
            </div>

            <div>
              <p className="text-sm text-slate-400">Menace suspectée</p>
              <p>{report.threat_type}</p>
            </div>

            <div>
              <p className="text-sm text-slate-400">Description</p>
              <p className="whitespace-pre-wrap break-words">
                {report.description}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-400">Statut actuel</p>
              <p className="mt-1 font-semibold text-amber-300">
                {statusLabels[report.report_status] ??
                  report.report_status}
              </p>
            </div>

            <p className="border-t border-slate-800 pt-4 text-sm leading-6 text-slate-400">
              Un signalement enregistré ne constitue pas, à lui seul,
              une preuve que la menace est réelle. Le statut reflète
              l’état actuel de son traitement.
            </p>
          </section>
        )}

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/report"
            className="rounded-lg bg-cyan-500 px-5 py-3 text-center font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Faire un autre signalement
          </Link>

          <Link
            href="/"
            className="rounded-lg border border-slate-700 px-5 py-3 text-center font-semibold hover:bg-slate-900"
          >
            Retour à la recherche
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ReportSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
          <p>Chargement du signalement...</p>
        </main>
      }
    >
      <ReportSuccessContent />
    </Suspense>
  );
}
