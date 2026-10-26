
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export default function LoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.set("username", identifier.trim());
      formData.set("password", password);

      const response = await fetch(
        `${API_URL}/api/v1/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Connexion impossible. Vérifie tes identifiants."
        );
      }

      if (
        typeof data.access_token !== "string" ||
        !data.access_token
      ) {
        throw new Error("Le serveur n'a pas renvoyé de jeton valide.");
      }

      // Stockage temporaire pour les appels authentifiés du frontend.
      localStorage.setItem("access_token", data.access_token);

      router.push("/dashboard");
    } catch (err) {
      if (err instanceof TypeError) {
        setError(
          "Impossible de joindre le serveur. Vérifie que FastAPI est démarré."
        );
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Une erreur inattendue est survenue."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-90px)] items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-xl font-black text-cyan-300">
            CTI
          </div>

          <h1 className="mt-5 text-2xl font-bold text-white">
            Connexion
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Connecte-toi à ton espace Cyber Threat Intelligence.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="identifier"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Nom d'utilisateur ou adresse e-mail
            </label>

            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="hackthus237 ou nom@exemple.com"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Mot de passe
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Ton mot de passe"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Connexion en cours..." : "Se connecter"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Tu n'as pas encore de compte ?{" "}
          <Link
            href="/register"
            className="font-semibold text-cyan-400 hover:text-cyan-300"
          >
            Inscris-toi
          </Link>
        </p>
      </section>
    </main>
  );
}
