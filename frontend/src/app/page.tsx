
"use client";

import { FormEvent, useState } from "react";

type ResourceType = "domain" | "url" | "email";

type SearchResult = {
  verdict?: string;
  resource_type?: string;
  normalized_value?: string;
  report_count?: number;
  reports?: unknown[];
  [key: string]: unknown;
};

const API_URL = "http://127.0.0.1:8000";

const verdictLabels: Record<string, string> = {
  unknown: "Aucune donnée connue",
  under_review: "Signalement en cours de vérification",
  reported_confirmed: "Menace signalée comme confirmée",
};

export default function Home() {
  const [resourceType, setResourceType] =
    useState<ResourceType>("domain");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!value.trim()) {
      setError("Saisis une valeur à rechercher.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const params = new URLSearchParams({
        resource_type: resourceType,
        value: value.trim(),
      });

      const response = await fetch(
        `${API_URL}/api/v1/search?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data: SearchResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}. Vérifie que le backend fonctionne et que CORS est configuré.`
          : "Une erreur inattendue est survenue."
      );
    } finally {
      setLoading(false);
    }
  }

  const verdict =
    typeof result?.verdict === "string"
      ? result.verdict
      : "unknown";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-20">
        <div className="mb-10 text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
            Threat Intelligence communautaire
          </p>

          <h1 className="text-4xl font-bold leading-tight sm:text-6xl">
            Une menace vous semble suspecte ?
            <span className="mt-2 block text-cyan-400">
              Vérifiez sa réputation.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Recherchez des domaines, des URLs et des adresses e-mail
            pour consulter les informations disponibles dans HTI.
          </p>
        </div>

        <form
          onSubmit={handleSearch}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-7"
        >
          <label
            htmlFor="resourceType"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Type de ressource
          </label>

          <select
            id="resourceType"
            value={resourceType}
            onChange={(event) =>
              setResourceType(event.target.value as ResourceType)
            }
            className="mb-5 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
          >
            <option value="domain">Nom de domaine</option>
            <option value="url">URL</option>
            <option value="email">Adresse e-mail</option>
          </select>

          <label
            htmlFor="value"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Valeur à analyser
          </label>

          <input
            id="value"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={
              resourceType === "domain"
                ? "exemple.com"
                : resourceType === "url"
                  ? "https://exemple.com/page"
                  : "contact@exemple.com"
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-4 outline-none placeholder:text-slate-600 focus:border-cyan-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full rounded-lg bg-cyan-500 px-5 py-4 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Recherche en cours..." : "Rechercher"}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-800 bg-red-950/50 p-4 text-red-300"
          >
            {error}
          </div>
        )}

        {result && (
          <section
            aria-live="polite"
            className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"
          >
            <p className="text-sm text-slate-400">Résultat de la recherche</p>

            <h2 className="mt-2 break-all text-xl font-semibold">
              {String(result.normalized_value ?? value)}
            </h2>

            <p className="mt-4 font-medium text-cyan-300">
              {verdictLabels[verdict] ?? verdict}
            </p>

            {typeof result.report_count === "number" && (
              <p className="mt-3 text-sm text-slate-400">
                Nombre de signalements : {result.report_count}
              </p>
            )}

            {Array.isArray(result.reports) && (
              <p className="mt-2 text-sm text-slate-400">
                Signalements retournés : {result.reports.length}
              </p>
            )}

            <details className="mt-5">
              <summary className="cursor-pointer text-sm text-slate-400 hover:text-cyan-300">
                Afficher les données techniques
              </summary>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </section>
        )}

        <p className="mt-8 text-center text-sm leading-6 text-slate-500">
          Un résultat inconnu ne signifie pas qu’une ressource est sûre.
          Les données affichées dépendent des informations disponibles
          dans HTI. Aucune ressource n’est visitée automatiquement.
        </p>
      </section>

      <footer className="border-t border-slate-800 px-6 py-6 text-center text-sm text-slate-500">
        HTI — Projet communautaire de Threat Intelligence
      </footer>
    </main>
  );
}
