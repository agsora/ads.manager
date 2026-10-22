"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FolderOpen, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { api, useFetch, useMeta, useToast } from "@/components/providers";
import { Card } from "@/components/charts";
import { DEFAULT_OPTIONS } from "@/lib/resources";

export default function SettingsPage() {
  const { session } = useMeta();
  const admin = session?.role === "owner" || session?.role === "admin" || session?.role === "superadmin";
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Data" title="Pengaturan" desc="Kelola brand, daftar pilihan (dropdown), pengguna tim, dan data workspace." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Brands admin={admin} />
        <Users admin={admin} />
      </div>
      <OptionsEditor admin={admin} />
      <Link href="/drive" className="card flex items-center gap-3 px-5 py-4 transition hover:bg-[#fdfcf9]">
        <FolderOpen size={18} className="text-[var(--muted)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Koneksi Google Drive</span>
          <span className="block text-[12.5px] text-[var(--muted)]">Tempat penyimpanan file upload di kalender konten, influencer & event</span>
        </span>
        <ChevronRight size={16} className="text-[var(--muted)]" />
      </Link>
      <div className="grid gap-5 xl:grid-cols-2">
        <Password />
        <Activity />
      </div>
      {(session?.role === "owner" || session?.role === "superadmin") && <Danger />}
    </div>
  );
}

function Brands({ admin }: { admin: boolean }) {
  const { brands, reloadMeta } = useMeta();
  const toast = useToast();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const add = async () => {
    try {
      await api("/api/brands", "POST", { name, industry });
      setName("");
      setIndustry("");
      toast("Brand ditambahkan");
      reloadMeta();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const rename = async (id: number, old: string, ind: string | null) => {
    const nn = prompt("Nama brand baru (semua data dengan brand ini ikut diganti):", old);
    if (!nn || nn === old) return;
    await api("/api/brands", "PUT", { id, name: nn, industry: ind });
    toast("Brand diperbarui");
    reloadMeta();
  };
  const del = async (id: number, n: string) => {
    if (!confirm(`Hapus brand "${n}" dari daftar? Data yang sudah ada tidak terhapus.`)) return;
    await api(`/api/brands?id=${id}`, "DELETE");
    reloadMeta();
  };
  return (
    <Card title="Brand / Unit Bisnis" subtitle="Dipakai di semua modul & filter">
      <ul className="divide-y divide-[var(--grid)]">
        {brands.map((b) => (
          <li key={b.id} className="flex items-center gap-2 py-2 text-[13.5px]">
            <span className="flex-1 font-medium">{b.name}</span>
            <span className="text-[12px] text-[var(--muted)]">{b.industry}</span>
            {admin && (
              <>
                <button className="btn btn-sm" onClick={() => rename(b.id, b.name, b.industry)}>Ubah</button>
                <button className="btn btn-sm btn-danger !px-2" onClick={() => del(b.id, b.name)} aria-label="Hapus">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <div className="mt-3 flex gap-2">
          <input className="input" placeholder="Nama brand" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Industri (opsional)" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          <button className="btn btn-primary" onClick={add} disabled={!name.trim()}>
            <Plus size={15} />
          </button>
        </div>
      )}
    </Card>
  );
}

function Users({ admin }: { admin: boolean }) {
  const toast = useToast();
  const { session } = useMeta();
  const { data, reload } = useFetch<{ users: { id: number; name: string; email: string; role: string }[] }>("/api/users");
  const [v, setV] = useState({ name: "", email: "", password: "", role: "staff" });
  const add = async () => {
    try {
      await api("/api/users", "POST", v);
      toast("Pengguna ditambahkan");
      setV({ name: "", email: "", password: "", role: "staff" });
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const del = async (id: number) => {
    if (!confirm("Hapus pengguna ini?")) return;
    await api(`/api/users?id=${id}`, "DELETE");
    reload();
  };
  return (
    <Card title="Tim & Akses" subtitle="Owner: semua akses · Admin: kelola brand/pilihan/user · Staff: input & lihat data">
      <ul className="divide-y divide-[var(--grid)]">
        {data?.users.map((u) => (
          <li key={u.id} className="flex items-center gap-2 py-2 text-[13.5px]">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{u.name}</div>
              <div className="truncate text-[12px] text-[var(--muted)]">{u.email}</div>
            </div>
            <span className="chip capitalize">{u.role}</span>
            {admin && u.role !== "owner" && u.id !== session?.uid && (
              <button className="btn btn-sm btn-danger !px-2" onClick={() => del(u.id)} aria-label="Hapus pengguna">
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Nama" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <input className="input" placeholder="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          <input className="input" placeholder="Password awal (min. 8)" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
          <div className="flex gap-2">
            <select className="input" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn btn-primary" onClick={add}>
              <Plus size={15} /> Tambah
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function OptionsEditor({ admin }: { admin: boolean }) {
  const { options, reloadMeta } = useMeta();
  const toast = useToast();
  const [key, setKey] = useState("lead_source");
  const [text, setText] = useState<string | null>(null);
  const current = text ?? (options[key] ?? []).join("\n");
  const save = async () => {
    try {
      await api("/api/options", "PUT", { key, values: current.split("\n") });
      toast("Daftar pilihan disimpan");
      setText(null);
      reloadMeta();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const reset = async () => {
    await api(`/api/options?key=${key}`, "DELETE");
    setText(null);
    reloadMeta();
    toast("Dikembalikan ke default");
  };
  return (
    <Card title="Daftar Pilihan (Dropdown)" subtitle="Sesuaikan pilihan seperti sumber trafik, cabang, platform, pilar konten, status — satu pilihan per baris">
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="max-h-[320px] space-y-0.5 overflow-y-auto">
          {Object.entries(DEFAULT_OPTIONS).map(([k, o]) => (
            <button key={k} onClick={() => (setKey(k), setText(null))} className={`block w-full rounded-lg px-3 py-1.5 text-left text-[13px] ${k === key ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]" : "hover:bg-[var(--surface-2)]"}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div>
          <textarea className="input font-mono !text-[13px]" rows={12} value={current} onChange={(e) => setText(e.target.value)} disabled={!admin} aria-label="Daftar pilihan" />
          {admin && (
            <div className="mt-2 flex gap-2">
              <button className="btn btn-primary" onClick={save}>
                <Save size={15} /> Simpan
              </button>
              <button className="btn" onClick={reset}>
                <RotateCcw size={15} /> Default
              </button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Password() {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const save = async () => {
    try {
      await api("/api/users", "PUT", { password: pw });
      setPw("");
      toast("Password diganti");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <Card title="Ganti Password">
      <div className="flex gap-2">
        <input className="input" type="password" autoComplete="new-password" placeholder="Password baru (min. 8 karakter)" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn btn-primary" onClick={save} disabled={pw.length < 8}>
          Simpan
        </button>
      </div>
    </Card>
  );
}

/** Activity details are sometimes stored as JSON counts ({"leads":219,...}); show them as "leads 219 · …". */
function readableDetail(detail: string) {
  try {
    const o = JSON.parse(detail);
    if (o && typeof o === "object" && !Array.isArray(o))
      return Object.entries(o)
        .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
        .map(([k, v]) => `${k} ${typeof v === "number" ? v.toLocaleString("id-ID") : v}`)
        .join(" · ")
        .slice(0, 120);
  } catch {}
  return detail.slice(0, 120);
}

function Activity() {
  const { data } = useFetch<{ rows: { user_name: string; action: string; detail: string | null; created_at: string }[] }>("/api/activity");
  return (
    <Card title="Log Aktivitas" subtitle="100 aktivitas terakhir">
      <ul className="max-h-[260px] divide-y divide-[var(--grid)] overflow-y-auto text-[12.5px]">
        {data?.rows.map((r, i) => (
          <li key={i} className="py-1.5 [overflow-wrap:anywhere]">
            <b>{r.user_name}</b> · {r.action} {r.detail ? <span className="text-[var(--ink-2)]">— {readableDetail(r.detail)}</span> : null}
            <div className="text-[11.5px] text-[var(--muted)]">{new Date(r.created_at).toLocaleString("id-ID")}</div>
          </li>
        ))}
        {!data?.rows.length && <li className="py-2 text-[var(--muted)]">Belum ada aktivitas</li>}
      </ul>
    </Card>
  );
}

function Danger() {
  const toast = useToast();
  const wipe = async () => {
    const t = prompt('Ini akan MENGHAPUS PERMANEN semua data modul (ads, leads, konten, dll) di workspace ini. Brand, pengguna & pengaturan tetap. Ketik "HAPUS" untuk melanjutkan:');
    if (t !== "HAPUS") return;
    await api("/api/demo", "DELETE");
    toast("Semua data modul dihapus");
  };
  return (
    <Card title="Zona Berbahaya">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-[13px] text-[var(--ink-2)]">Hapus semua data modul (mis. setelah mencoba data contoh). Disarankan backup dulu di menu Impor / Ekspor.</p>
        <button className="btn btn-danger" onClick={wipe}>
          <Trash2 size={15} /> Hapus semua data
        </button>
      </div>
    </Card>
  );
}
