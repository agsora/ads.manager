"use client";

import Link from "next/link";
import { useState } from "react";

export function ConfirmLink({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/auth/magic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (r.ok) {
      window.location.href = "/";
      return;
    }
    setErr(j.error || "Gagal masuk");
    setBusy(false);
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-[380px] text-center">
        <span className="serif mx-auto grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--accent)] text-[24px] italic leading-none text-white">a</span>
        <h1 className="serif mt-5 text-[28px] leading-tight">Masuk ke Ads Manager</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">Tekan tombol di bawah untuk menyelesaikan login di perangkat ini.</p>
        {err && <div className="mt-5 rounded-lg border border-[#eac9bf] bg-[#fbefec] px-3 py-2 text-[13px] text-[var(--critical-ink)]">{err}</div>}
        {token ? (
          <button className="btn btn-primary mt-6 w-full !h-11 !text-[14px]" onClick={go} disabled={busy}>
            {busy ? "Memproses…" : "Masuk"}
          </button>
        ) : (
          <div className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-[14px] text-[var(--ink-2)]">Tautan tidak lengkap. Minta tautan baru dari halaman masuk.</div>
        )}
        <p className="mt-5 text-[13px]">
          <Link href="/login" className="text-[var(--ink-2)] hover:underline">Kembali ke halaman masuk</Link>
        </p>
      </div>
    </div>
  );
}
