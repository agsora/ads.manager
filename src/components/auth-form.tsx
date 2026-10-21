"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, Lightbulb, Megaphone, MessageCircle } from "lucide-react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [v, setV] = useState({ orgName: "", name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error || "Gagal");
      setBusy(false);
      return;
    }
    window.location.href = "/";
  };
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[#0f172a] p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)]">
            <Megaphone size={20} />
          </div>
          <span className="text-lg font-bold">Ads Manager</span>
        </div>
        <div>
          <h1 className="max-w-md text-[34px] font-bold leading-tight">Semua data digital marketing Anda, satu dashboard, lengkap dengan rekomendasi.</h1>
          <ul className="mt-8 space-y-4 text-[15px] text-slate-300">
            <li className="flex gap-3"><BarChart3 className="shrink-0 text-[#86b6ef]" /> Monitor ads Meta/TikTok, saldo, ROAS & biaya per lead</li>
            <li className="flex gap-3"><MessageCircle className="shrink-0 text-[#86b6ef]" /> CRM WA Leads, follow up otomatis & laporan WA Blast</li>
            <li className="flex gap-3"><Lightbulb className="shrink-0 text-[#86b6ef]" /> Insight & saran tindakan otomatis setiap hari</li>
          </ul>
        </div>
        <p className="text-sm text-slate-500">Impor langsung dari Excel Marketing Report Anda.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="text-2xl font-bold">{mode === "login" ? "Masuk" : "Buat workspace"}</h2>
          <p className="mt-1 text-sm text-[var(--ink-2)]">{mode === "login" ? "Masuk ke dashboard marketing Anda." : "Daftarkan bisnis Anda — akun pertama menjadi Owner."}</p>
          <div className="mt-6 space-y-3.5">
            {mode === "register" && (
              <>
                <div>
                  <label className="label" htmlFor="org">Nama bisnis / perusahaan</label>
                  <input id="org" className="input" value={v.orgName} onChange={set("orgName")} required />
                </div>
                <div>
                  <label className="label" htmlFor="nm">Nama Anda</label>
                  <input id="nm" className="input" value={v.name} onChange={set("name")} required />
                </div>
              </>
            )}
            <div>
              <label className="label" htmlFor="em">Email</label>
              <input id="em" type="email" className="input" value={v.email} onChange={set("email")} required autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="pw">Password</label>
              <input id="pw" type="password" className="input" value={v.password} onChange={set("password")} required minLength={mode === "register" ? 8 : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </div>
          </div>
          {err && <div className="mt-4 rounded-lg bg-[#fdf2f2] px-3 py-2 text-sm text-[var(--critical)]">{err}</div>}
          <button className="btn btn-primary mt-6 w-full justify-center !h-11" disabled={busy}>
            {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Buat akun"}
          </button>
          <p className="mt-5 text-center text-sm text-[var(--ink-2)]">
            {mode === "login" ? (
              <>Belum punya akun? <Link className="font-semibold text-[var(--accent)]" href="/register">Daftar</Link></>
            ) : (
              <>Sudah punya akun? <Link className="font-semibold text-[var(--accent)]" href="/login">Masuk</Link></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
