"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceLayout from "@/components/WorkspaceLayout";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type Role = "user" | "moderator" | "admin";

type User = {
  id: number;
  username: string;
  email: string;
  role: Role;
  created_at: string | null;
};

type UserResponse = {
  items: User[];
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
  }).format(date);
}

function roleLabel(role: Role) {
  switch (role) {
    case "admin":
      return "Administrateur";
    case "moderator":
      return "Modérateur";
    default:
      return "Utilisateur";
  }
}

function roleStyle(role: Role) {
  switch (role) {
    case "admin":
      return "border-violet-800 bg-violet-950/50 text-violet-300";
    case "moderator":
      return "border-cyan-800 bg-cyan-950/50 text-cyan-300";
    default:
      return "border-slate-700 bg-slate-800 text-slate-300";
  }
}

export default function AdminUsersPage() {
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const pageSize = 20;

  const loadUsers = useCallback(async () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        q: search.trim(),
        limit: String(pageSize),
        offset: String(offset),
      });

      if (roleFilter) {
        params.set("role", roleFilter);
      }

      const response = await fetch(
        `${API_URL}/api/v1/admin/users?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        router.replace("/login");
        return;
      }

      if (response.status === 403) {
        router.replace("/dashboard");
        return;
      }

      if (!response.ok) {
        throw new Error(`Erreur lors du chargement : HTTP ${response.status}`);
      }

      const data = (await response.json()) as UserResponse;

      if (!Array.isArray(data.items) || typeof data.total !== "number") {
        throw new Error("Format de réponse de l'API invalide.");
      }

      setUsers(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les utilisateurs."
      );
    } finally {
      setLoading(false);
    }
  }, [offset, roleFilter, router, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [loadUsers]);

  async function changeRole(user: User, newRole: Role) {
    if (user.role === newRole) return;

    const confirmed = window.confirm(
      `Modifier le rôle de ${user.username} : ${roleLabel(user.role)} → ${roleLabel(newRole)} ?`
    );

    if (!confirmed) return;

    const token = localStorage.getItem("access_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    setBusyId(user.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/api/v1/admin/users/${user.id}/role`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: newRole }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `La modification a échoué (HTTP ${response.status}).`
        );
      }

      setMessage(`Le rôle de ${user.username} a été mis à jour.`);
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de modifier le rôle."
      );
    } finally {
      setBusyId(null);
    }
  }

  const currentPage = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <WorkspaceLayout
      title="Gestion des utilisateurs"
      description="Administration des comptes et des rôles HTI"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-cyan-900/60 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/30 p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-400">
            HTI / User Management
          </p>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">
                Gestion des utilisateurs
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Recherche des comptes et attribution des rôles.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-5 py-3">
              <p className="text-xs text-slate-400">Comptes correspondants</p>
              <p className="mt-1 text-2xl font-bold text-cyan-300">{total}</p>
            </div>
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

        {message && (
          <div
            role="status"
            className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm text-emerald-300"
          >
            {message}
          </div>
        )}

        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
            <div>
              <label
                htmlFor="user-search"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Rechercher un compte
              </label>
              <input
                id="user-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
                placeholder="Nom d'utilisateur ou e-mail"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-600"
              />
            </div>

            <div>
              <label
                htmlFor="role-filter"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Filtrer par rôle
              </label>
              <select
                id="role-filter"
                value={roleFilter}
                onChange={(event) => {
                  setRoleFilter(event.target.value);
                  setOffset(0);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-cyan-600"
              >
                <option value="">Tous les rôles</option>
                <option value="user">Utilisateur</option>
                <option value="moderator">Modérateur</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>

            <button
              onClick={() => void loadUsers()}
              disabled={loading}
              className="rounded-lg border border-cyan-700 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-950 disabled:opacity-50"
            >
              {loading ? "Chargement..." : "Actualiser"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          <div className="flex items-center justify-between border-b border-slate-800 p-5">
            <h2 className="font-semibold text-white">Liste des comptes</h2>
            <span className="text-xs text-slate-500">
              Page {currentPage} / {pageCount}
            </span>
          </div>

          {loading ? (
            <p className="p-6 text-sm text-slate-400">
              Chargement des utilisateurs...
            </p>
          ) : users.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              Aucun utilisateur ne correspond à cette recherche.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-slate-950/70 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-medium">Utilisateur</th>
                    <th className="px-5 py-4 font-medium">E-mail</th>
                    <th className="px-5 py-4 font-medium">Rôle actuel</th>
                    <th className="px-5 py-4 font-medium">Création</th>
                    <th className="px-5 py-4 font-medium">Modifier le rôle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((user) => (
                    <tr key={user.id} className="text-slate-300">
                      <td className="px-5 py-4">
                        <p className="font-medium text-white">{user.username}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          ID #{user.id}
                        </p>
                      </td>
                      <td className="px-5 py-4">{user.email}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${roleStyle(user.role)}`}
                        >
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-400">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        <select
                          aria-label={`Modifier le rôle de ${user.username}`}
                          value={user.role}
                          disabled={busyId === user.id}
                          onChange={(event) =>
                            void changeRole(user, event.target.value as Role)
                          }
                          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-600 disabled:opacity-50"
                        >
                          <option value="user">Utilisateur</option>
                          <option value="moderator">Modérateur</option>
                          <option value="admin">Administrateur</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-slate-800 p-4">
            <p className="text-xs text-slate-500">
              {total === 0
                ? "0 résultat"
                : `${offset + 1}–${Math.min(offset + pageSize, total)} sur ${total}`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - pageSize))}
                disabled={offset === 0 || loading}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Précédent
              </button>
              <button
                onClick={() => setOffset(offset + pageSize)}
                disabled={offset + pageSize >= total || loading}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        </section>

        <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-200">
          <strong>Attention :</strong> un changement de rôle modifie les
          permissions du compte. Vérifie le compte et le rôle avant de
          confirmer chaque opération.
        </div>
      </div>
    </WorkspaceLayout>
  );
}
