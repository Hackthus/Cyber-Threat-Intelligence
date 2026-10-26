
"use client";

import { FormEvent, useState } from "react";

type ResourceType = "domain" | "url" | "email" | "ip";

type SearchResult = {
  found?: boolean;
  resource_type?: string;
  value?: string;
  report_count?: number;
  confirmed_count?: number;
  verdict?: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const verdictLabels: Record<string, string> = {
  unknown: "Aucune donnée connue",
  under_review: "Signalements en attente de vérification",
  reported_confirmed: "Au moins un signalement confirmé",
};

const verdictStyles: Record<string, string> = {
  unknown: "border-slate-700 bg-slate-800 text-slate-200",
  under_review: "border-amber-700 bg-amber-950/40 text-amber-300",
  reported_confirmed:
    "border-red-700 bg-red-950/40 text-red-300",
};

const resourceLabels: Record<string, string> = {
  domain: "Nom de domaine",
  url: "URL",
  email: "Adresse e-mail",
  ip: "Adresse IP",
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

    const searchedValue = value.trim();

    if (!searchedValue) {
      setError("Saisis une valeur à rechercher.");
      setResult(null);
      return;
    }

    if (searchedValue.length < 3) {
      setError("La valeur doit contenir au moins 3 caractères.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const params = new URLSearchParams({
        resource_type: resourceType,
        value: searchedValue,
      });

      const response = await fetch(
        `${API_URL}/api/v1/search?${params.toString()}`
      );

      if (!response.ok) {
        if (response.status === 422) {
          throw new Error(
            "La valeur ou le type de ressource est invalide."
          );
        }

        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data: SearchResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Vérifie que le backend fonctionne et que CORS est configuré.`
          : "Une erreur inattendue est survenue."
      );
    } finally {
      setLoading(false);
    }
  }

  const verdict = result?.verdict ?? "unknown";

  const verdictStyle =
    verdictStyles[verdict] ?? verdictStyles.unknown;

  const verdictLabel =
    verdictLabels[verdict] ?? verdict;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 sm:pt-20">
        <div className="mb-10 text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
            Cyber Threat Intelligence communautaire
          </p>

          <h1 className="text-4xl font-bold leading-tight sm:text-6xl">
            Une menace vous semble suspecte ?
            <span className="mt-2 block text-cyan-400">
              Vérifiez sa réputation.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400">
            Recherchez des domaines, des URLs et des adresses e-mail
            pour consulter les signalements disponibles dans Cyber
            Threat Intelligence.
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
            <option value="ip">Adresse IP (IPv4 / IPv6)</option>
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
                  : resourceType === "email"
                    ? "contact@exemple.com"
                    : "192.0.2.1 ou 2001:db8::1"
            }
            maxLength={2048}
            autoComplete="off"
            spellCheck={false}
            required
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
            <p className="font-semibold">Recherche impossible</p>
            <p className="mt-1 text-sm leading-6">{error}</p>
          </div>
        )}

        {result && (
          <section
            aria-live="polite"
            className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400">
                Résultat de la recherche
              </p>

              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                {resourceLabels[result.resource_type ?? resourceType] ??
                  result.resource_type ??
                  resourceType}
              </span>
            </div>

            <h2 className="mt-3 break-all text-xl font-semibold sm:text-2xl">
              {result.value ?? value.trim()}
            </h2>

            <div
              className={`mt-5 rounded-xl border p-4 ${verdictStyle}`}
            >
              <p className="font-semibold">{verdictLabel}</p>

              <p className="mt-1 text-sm leading-6 opacity-90">
                {verdict === "reported_confirmed"
                  ? "La base contient au moins un signalement avec le statut confirmé. Vérifie le contexte avant de prendre une décision."
                  : verdict === "under_review"
                    ? "Des signalements existent, mais aucun n'est actuellement confirmé selon les statuts utilisés par la plateforme."
                    : "Aucun signalement n'a été trouvé pour cette ressource dans les données consultées."}
              </p>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-sm text-slate-400">
                  Signalements au total
                </p>
                <p className="mt-2 text-3xl font-bold">
                  {result.report_count ?? 0}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-sm text-slate-400">
                  Signalements confirmés
                </p>
                <p className="mt-2 text-3xl font-bold text-cyan-300">
                  {result.confirmed_count ?? 0}
                </p>
              </div>
            </div>

            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-slate-400 hover:text-cyan-300">
                Afficher les données techniques
              </summary>

              <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </section>
        )}

        <p className="mt-8 text-center text-sm leading-6 text-slate-500">
          Un résultat inconnu ne signifie pas qu’une ressource est sûre.
          Les verdicts reflètent les signalements présents dans la
          plateforme. Aucune ressource n’est visitée automatiquement
          par cette recherche.
        </p>
      </section>

      <footer className="border-t border-slate-800 px-6 py-6 text-center text-sm text-slate-500">
        Cyber Threat Intelligence · Plateforme communautaire
      </footer>
    </main>
  );
}
