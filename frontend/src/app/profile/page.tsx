
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WorkspaceLayout from "@/components/WorkspaceLayout";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Profile = {
  id: number;
  username: string;
  email: string;
  role: "user" | "moderator" | "admin";
  created_at: string;
};

const roleLabels: Record<Profile["role"], string> = {
  user: "Utilisateur",
  moderator: "Modérateur",
  admin: "Administrateur",
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const token = localStorage.getItem("access_token");

      if (!token) {
        if (!cancelled) {
          setError("Connecte-toi pour consulter ton profil.");
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (response.status === 401) {
          localStorage.removeItem("access_token");
          throw new Error("Ta session a expiré. Reconnecte-toi.");
        }

        if (!response.ok) {
          throw new Error("Impossible de charger les informations du profil.");
        }

        const data: Profile = await response.json();

        if (!cancelled) setProfile(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Une erreur inattendue est survenue.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WorkspaceLayout
      title="Mon profil"
      description="Consulte les informations associées à ton compte HTI."
    >
      {loading ? (
        <div role="status" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
          Chargement du profil…
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
          <p className="text-sm text-red-300">{error}</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-cyan-300 hover:text-cyan-200">
            Aller à la connexion →
          </Link>
        </div>
      ) : profile ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-2xl font-bold text-cyan-300">
                {profile.username.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {profile.username}
                </h2>
                <p className="mt-1 text-sm text-slate-400">{profile.email}</p>
                <span className="mt-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                  {roleLabels[profile.role] ?? profile.role}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-white">
              Informations du compte
            </h2>
            <dl className="mt-5 divide-y divide-slate-800">
              <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm text-slate-400">Identifiant</dt>
                <dd className="text-sm font-medium text-slate-200">
                  #{profile.id}
                </dd>
              </div>
              <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm text-slate-400">Nom d’utilisateur</dt>
                <dd className="break-all text-sm font-medium text-slate-200">
                  {profile.username}
                </dd>
              </div>
              <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm text-slate-400">Adresse e-mail</dt>
                <dd className="break-all text-sm font-medium text-slate-200">
                  {profile.email}
                </dd>
              </div>
              <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm text-slate-400">Rôle</dt>
                <dd className="text-sm font-medium text-slate-200">
                  {roleLabels[profile.role] ?? profile.role}
                </dd>
              </div>
              <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm text-slate-400">Date de création</dt>
                <dd className="text-sm font-medium text-slate-200">
                  {profile.created_at
                    ? new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "long",
                      }).format(new Date(profile.created_at))
                    : "Non disponible"}
                </dd>
              </div>
            </dl>
          </section>

          <Link
            href="/reports"
            className="inline-flex items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/15"
          >
            Consulter mes signalements →
          </Link>
        </div>
      ) : null}
    </WorkspaceLayout>
  );
}
