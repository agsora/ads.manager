"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Status {
  needsSetup: boolean;
  allowSignup: boolean;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [v, setV] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ needsSetup: false, allowSignup: false }));
  }, []);

  const setup = status?.needsSetup;
  const closed = mode === "register" && status && !status.needsSetup && !status.allowSignup;

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

  const title = mode === "login" ? "Selamat datang kembali" : setup ? "Siapkan akun Superadmin" : "Buat akun";
  const sub =
    mode === "login"
      ? "Masuk untuk melihat performa marketing hari ini."
      : setup
        ? "Ini akun pertama di aplikasi. Akun ini menjadi Superadmin: bisa mengelola semua user, workspace, dan pengaturan."
        : "Daftar untuk mendapatkan workspace sendiri.";

  return (
    <div className="grid min-h-screen bg-[var(--bg)] lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-[var(--line)] bg-[var(--sidebar)] p-14 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="serif grid h-8 w-8 place-items-center rounded-[8px] bg-[var(--accent)] text-[19px] italic leading-none text-white">a</span>
          <span className="serif text-[21px]">Ads Manager</span>
        </div>
        <div className="max-w-lg">
          <div className="eyebrow mb-5">Digital marketing, satu meja kerja</div>
          <h1 className="serif text-[46px] font-normal leading-[1.05] tracking-[-0.015em]">
            Dari belanja iklan sampai <em className="text-[var(--accent)]">closing</em>, terbaca dalam satu halaman.
          </h1>
          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-[var(--line)] pt-6 text-[13px] text-[var(--ink-2)]">
            <div>
              <dt className="serif text-[22px] text-[var(--ink)]">Ads</dt>
              <dd className="mt-1">Upload laporan Meta, ROAS & saldo otomatis</dd>
            </div>
            <div>
              <dt className="serif text-[22px] text-[var(--ink)]">Leads</dt>
              <dd className="mt-1">WA leads, blast kontak & follow up H+3/7/14</dd>
            </div>
            <div>
              <dt className="serif text-[22px] text-[var(--ink)]">Saran</dt>
              <dd className="mt-1">Temuan & tindakan dihitung dari data Anda</dd>
            </div>
          </dl>
        </div>
        <p className="text-[12.5px] text-[var(--muted)]">Impor Excel & CSV · ekspor laporan siap kirim</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-[360px]">
          <h2 className="serif text-[30px] leading-tight">{title}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">{sub}</p>

          {closed ? (
            <div className="mt-8 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-[14px] leading-relaxed text-[var(--ink-2)]">
              Pendaftaran sedang ditutup. Minta admin atau superadmin untuk membuatkan akun Anda.
            </div>
          ) : (
            <>
              <div className="mt-8 space-y-4">
                {mode === "register" && (
                  <div>
                    <label className="label" htmlFor="nm">Nama</label>
                    <input id="nm" className="input" value={v.name} onChange={set("name")} required autoComplete="name" />
                  </div>
                )}
                <div>
                  <label className="label" htmlFor="em">Email</label>
                  <input id="em" type="email" className="input" value={v.email} onChange={set("email")} required autoComplete="email" />
                </div>
                <div>
                  <label className="label" htmlFor="pw">Password</label>
                  <input
                    id="pw"
                    type="password"
                    className="input"
                    value={v.password}
                    onChange={set("password")}
                    required
                    minLength={mode === "register" ? 8 : undefined}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                  {mode === "register" && <p className="mt-1.5 text-[12px] text-[var(--muted)]">Minimal 8 karakter.</p>}
                </div>
              </div>
              {err && <div className="mt-4 rounded-lg border border-[#eac9bf] bg-[#fbefec] px-3 py-2 text-[13px] text-[var(--critical-ink)]">{err}</div>}
              <button className="btn btn-primary mt-6 w-full !h-11 !text-[14px]" disabled={busy}>
                {busy ? "Memproses…" : mode === "login" ? "Masuk" : setup ? "Buat akun Superadmin" : "Daftar"}
              </button>
            </>
          )}

          <p className="mt-6 text-center text-[13.5px] text-[var(--ink-2)]">
            {mode === "login" ? (
              setup ? (
                <>Belum ada akun. <Link className="font-semibold text-[var(--accent-ink)]" href="/register">Siapkan Superadmin</Link></>
              ) : status?.allowSignup ? (
                <>Belum punya akun? <Link className="font-semibold text-[var(--accent-ink)]" href="/register">Daftar</Link></>
              ) : null
            ) : (
              <>Sudah punya akun? <Link className="font-semibold text-[var(--accent-ink)]" href="/login">Masuk</Link></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
