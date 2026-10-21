"use client";

import { useState } from "react";
import { ArrowRight, KeyRound, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { api, useFetch, useMeta, useToast } from "@/components/providers";
import { Card } from "@/components/charts";
import { Chip } from "@/components/cells";
import { fmtDate, fmtNum } from "@/lib/format";

interface Org {
  id: number;
  name: string;
  created_at: string;
  users: number;
  ads: number;
  leads: number;
  content: number;
  contacts: number;
  reviews: number;
}
interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
  org_id: number;
  org_name: string;
}

const ROLES = ["superadmin", "owner", "admin", "staff"];

export default function AdminPage() {
  const { session } = useMeta();
  const toast = useToast();
  const { data, reload } = useFetch<{ orgs: Org[]; users: User[]; allowSignup: boolean }>(session?.role === "superadmin" ? "/api/admin" : null);
  const [nu, setNu] = useState({ name: "", email: "", password: "", role: "staff", orgId: 0, workspace: "" });

  if (session && session.role !== "superadmin") return <div className="card p-8 text-[var(--ink-2)]">Halaman ini hanya untuk Superadmin.</div>;
  if (!data) return <div className="card p-8 text-center text-[var(--muted)]">Memuat…</div>;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast(ok);
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const open = async (orgId: number) => {
    await api("/api/admin/switch", "POST", { orgId });
    window.location.href = "/";
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Platform" title="Superadmin" desc="Kelola semua workspace dan pengguna, reset password, ubah role, buka workspace mana pun, dan atur apakah orang lain boleh mendaftar sendiri." />

      <div className="stat-grid">
        <Stat label="Workspace" value={data.orgs.length} />
        <Stat label="Pengguna" value={data.users.length} />
        <Stat label="Leads (semua)" value={data.orgs.reduce((s, o) => s + o.leads, 0)} />
        <Stat label="Baris iklan (semua)" value={data.orgs.reduce((s, o) => s + o.ads, 0)} />
      </div>

      <Card title="Pendaftaran publik" subtitle="Jika dibuka, siapa pun bisa daftar di /register dan mendapat workspace sendiri. Jika ditutup, akun hanya dibuat oleh admin.">
        <label className="flex items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={data.allowSignup}
            onChange={(e) => run(() => api("/api/admin", "PUT", { allowSignup: e.target.checked }), e.target.checked ? "Pendaftaran dibuka" : "Pendaftaran ditutup")}
          />
          {data.allowSignup ? "Terbuka — orang lain bisa mendaftar sendiri" : "Tertutup — hanya admin yang membuat akun"}
        </label>
      </Card>

      <Card title="Workspace">
        <div className="-mx-5 overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Workspace</th>
                <th className="text-right">User</th>
                <th className="text-right">Iklan</th>
                <th className="text-right">Leads</th>
                <th className="text-right">Konten</th>
                <th className="text-right">Kontak</th>
                <th>Dibuat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.orgs.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className="font-semibold">{o.name}</span>
                    {o.id === session?.org && <span className="ml-2 chip !bg-[var(--accent-soft)] !text-[var(--accent-ink)]">sedang dibuka</span>}
                  </td>
                  <td className="text-right tnum">{o.users}</td>
                  <td className="text-right tnum">{fmtNum(o.ads)}</td>
                  <td className="text-right tnum">{fmtNum(o.leads)}</td>
                  <td className="text-right tnum">{fmtNum(o.content)}</td>
                  <td className="text-right tnum">{fmtNum(o.contacts)}</td>
                  <td className="text-[12.5px] text-[var(--ink-2)]">{fmtDate(o.created_at)}</td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <button className="btn btn-sm" onClick={() => {
                        const name = prompt("Nama workspace:", o.name);
                        if (name && name !== o.name) run(() => api("/api/admin/orgs", "PUT", { id: o.id, name }), "Workspace diganti nama");
                      }}>Ubah nama</button>
                      {o.id !== session?.org && (
                        <button className="btn btn-sm btn-primary" onClick={() => open(o.id)}>
                          Buka <ArrowRight size={13} />
                        </button>
                      )}
                      {o.id !== session?.org && (
                        <button className="btn btn-sm btn-danger !px-2" aria-label="Hapus workspace" onClick={() => {
                          if (prompt(`Hapus workspace "${o.name}" beserta SEMUA user & datanya? Ketik HAPUS:`) === "HAPUS") run(() => api(`/api/admin/orgs?id=${o.id}`, "DELETE"), "Workspace dihapus");
                        }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Semua pengguna">
        <div className="-mx-5 overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Workspace</th>
                <th>Role</th>
                <th>Dibuat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="font-semibold">{u.name}{u.id === session?.uid && <span className="ml-1.5 text-[12px] font-normal text-[var(--muted)]">(Anda)</span>}</td>
                  <td className="text-[var(--ink-2)]">{u.email}</td>
                  <td>
                    <select className="input !h-8 !w-auto !text-[13px]" value={u.org_id} onChange={(e) => run(() => api("/api/admin/users", "PUT", { id: u.id, orgId: Number(e.target.value) }), "Workspace user dipindah")} aria-label="Workspace">
                      {data.orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {u.id === session?.uid ? (
                      <Chip value={u.role} tone="orange" />
                    ) : (
                      <select className="input !h-8 !w-auto !text-[13px] capitalize" value={u.role} onChange={(e) => run(() => api("/api/admin/users", "PUT", { id: u.id, role: e.target.value }), "Role diperbarui")} aria-label="Role">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="text-[12.5px] text-[var(--ink-2)]">{fmtDate(u.created_at)}</td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <button className="btn btn-sm" title="Reset password" onClick={() => {
                        const pw = prompt(`Password baru untuk ${u.email} (min. 8 karakter):`);
                        if (pw) run(() => api("/api/admin/users", "PUT", { id: u.id, password: pw }), "Password direset");
                      }}>
                        <KeyRound size={13} /> Reset
                      </button>
                      {u.id !== session?.uid && (
                        <button className="btn btn-sm btn-danger !px-2" aria-label="Hapus user" onClick={() => {
                          if (confirm(`Hapus user ${u.email}?`)) run(() => api(`/api/admin/users?id=${u.id}`, "DELETE"), "User dihapus");
                        }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Tambah pengguna">
        <div className="grid gap-3 md:grid-cols-3">
          <input className="input" placeholder="Nama" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
          <input className="input" placeholder="Email" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
          <input className="input" placeholder="Password awal (min. 8)" type="password" autoComplete="new-password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          <select className="input" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })} aria-label="Role">
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select className="input" value={nu.orgId} onChange={(e) => setNu({ ...nu, orgId: Number(e.target.value) })} aria-label="Workspace">
            <option value={0}>+ Workspace baru</option>
            {data.orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          {nu.orgId === 0 ? (
            <input className="input" placeholder="Nama workspace baru (opsional)" value={nu.workspace} onChange={(e) => setNu({ ...nu, workspace: e.target.value })} />
          ) : (
            <div />
          )}
        </div>
        <button
          className="btn btn-accent mt-4"
          onClick={() =>
            run(async () => {
              await api("/api/admin/users", "POST", nu);
              setNu({ name: "", email: "", password: "", role: "staff", orgId: 0, workspace: "" });
            }, "Pengguna ditambahkan")
          }
        >
          <Plus size={15} /> Tambah pengguna
        </button>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-4">
      <div className="text-[12.5px] text-[var(--ink-2)]">{label}</div>
      <div className="serif mt-1 text-[28px] leading-tight">{fmtNum(value)}</div>
    </div>
  );
}
