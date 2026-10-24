
"use client";

import { FormEvent, useState } from "react";

type ResourceType = "domain" | "url" | "email";

type ReportResponse = {
  id: number;
  indicator_id: number;
  report_status: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export default function ReportPage() {
  const [resourceType, setResourceType] =
    useState<ResourceType>("domain");
  const [value, setValue] = useState("");
  const [threatType, setThreatType] = useState("phishing");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<ReportResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(null);

    if (value.trim().length < 3) {
      setError("La ressource doit contenir au moins 3 caractères.");
      return;
    }

    if (description.trim().length < 10) {
      setError("La description doit contenir au moins 10 caractères.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/v1/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resource_type: resourceType,
          value: value.trim(),
          threat_type: threatType,
          description: description.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          typeof data.detail === "string"
            ? data.detail
            : "Les données envoyées sont invalides.";
        throw new Error(message);
      }

      setSuccess(data as ReportResponse);
      setValue("");
      setDescription("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'envoyer le signalement. Vérifie la connexion à l'API."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <a
          href="/"
          className="text-sm text-cyan-400 hover:text-cyan-300"
        >
          ← Retour à la recherche
        </a>

        <header className="mb-8 mt-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
            Cyber Threat Intelligence
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            Signaler une ressource suspecte
          </h1>
          <p className="mt-4 leading-7 text-slate-400">
            Partage une ressource potentiellement malveillante pour
            aider la communauté à mieux identifier les menaces.
            Chaque signalement reste en attente de vérification.
          </p>
        </header>

        {success && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-emerald-800 bg-emerald-950/40 p-5"
          >
            <h2 className="font-semibold text-emerald-300">
              Signalement enregistré
            </h2>
            <p className="mt-2 text-sm text-slate-200">
              Référence du signalement : #{success.id}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Statut : {success.report_status}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Ce résultat ne signifie pas que la menace a été confirmée.
            </p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-300"
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8"
        >
          <div>
            <label
              htmlFor="resourceType"
              className="mb-2 block text-sm font-medium"
            >
              Type de ressource
            </label>
            <select
              id="resourceType"
              value={resourceType}
              onChange={(event) =>
                setResourceType(event.target.value as ResourceType)
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            >
              <option value="domain">Nom de domaine</option>
              <option value="url">URL</option>
              <option value="email">Adresse e-mail</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="value"
              className="mb-2 block text-sm font-medium"
            >
              Ressource à signaler
            </label>
            <input
              id="value"
              required
              minLength={3}
              maxLength={2048}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={
                resourceType === "domain"
                  ? "exemple.com"
                  : resourceType === "url"
                    ? "https://exemple.com/page"
                    : "contact@exemple.com"
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label
              htmlFor="threatType"
              className="mb-2 block text-sm font-medium"
            >
              Type de menace suspectée
            </label>
            <select
              id="threatType"
              value={threatType}
              onChange={(event) => setThreatType(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            >
              <option value="phishing">Phishing / hameçonnage</option>
              <option value="malware">Malware</option>
              <option value="spam">Spam</option>
              <option value="scam">Arnaque</option>
              <option value="other">Autre / non déterminé</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-medium"
            >
              Description
            </label>
            <textarea
              id="description"
              required
              minLength={10}
              maxLength={2000}
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Décris les indices observés et explique pourquoi cette ressource te paraît suspecte."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-500"
            />
            <p className="mt-2 text-xs text-slate-500">
              {description.length}/2000 caractères. N’inclus aucun mot de
              passe, jeton d’accès ou renseignement confidentiel.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Envoi en cours..." : "Envoyer le signalement"}
          </button>

          <p className="text-xs leading-5 text-slate-500">
            Le signalement sera enregistré comme étant en attente de
            vérification. La plateforme ne visite pas automatiquement la ressource
            soumise.
          </p>
        </form>
      </div>
    </main>
  );
}
