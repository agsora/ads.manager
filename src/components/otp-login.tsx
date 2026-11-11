"use client";

import { useEffect, useState } from "react";

/** Login dengan tautan yang dikirim ke email: isi email, lalu klik tautan di email. */
export function OtpLogin({ onPassword }: { onPassword?: () => void }) {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [masked, setMasked] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [cool, setCool] = useState(0);

  // hitung mundur sebelum boleh kirim ulang
  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/auth/otp/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; email?: string };
    setBusy(false);
    if (!r.ok) return setErr(j.error || "Gagal mengirim tautan");
    setMasked(j.email ?? email);
    setCool(60);
    setSent(true);
  };

  if (sent)
    return (
      <div className="w-full max-w-[360px]">
        <h2 className="serif text-[30px] leading-tight">Cek email Anda</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">
          Kami mengirim tautan masuk ke <b>{masked}</b>. Buka email itu lalu klik tombol <b>Masuk ke Ads Manager</b>. Tautan berlaku 10 menit dan hanya bisa dipakai sekali.
        </p>
        <p className="mt-3 text-[13px] text-[var(--muted)]">Tidak ada di kotak masuk? Periksa folder spam.</p>
        {err && <div className="mt-4 rounded-lg border border-[#eac9bf] bg-[#fbefec] px-3 py-2 text-[13px] text-[var(--critical-ink)]">{err}</div>}
        <button className="btn mt-6 w-full !h-11 !text-[14px]" disabled={cool > 0 || busy} onClick={() => send()}>
          {busy ? "Mengirim…" : cool > 0 ? `Kirim ulang tautan (${cool}s)` : "Kirim ulang tautan"}
        </button>
        <p className="mt-4 text-center text-[13px]">
          <button type="button" className="text-[var(--ink-2)] hover:underline" onClick={() => { setSent(false); setErr(""); }}>
            Ganti email
          </button>
        </p>
      </div>
    );

  return (
    <form onSubmit={send} className="w-full max-w-[360px]">
      <h2 className="serif text-[30px] leading-tight">Selamat datang kembali</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">Masuk dengan tautan yang kami kirim ke email Anda.</p>
      <div className="mt-8">
        <label className="label" htmlFor="otp-em">Email</label>
        <input id="otp-em" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
      </div>
      {err && <div className="mt-4 rounded-lg border border-[#eac9bf] bg-[#fbefec] px-3 py-2 text-[13px] text-[var(--critical-ink)]">{err}</div>}
      <button className="btn btn-primary mt-6 w-full !h-11 !text-[14px]" disabled={busy}>
        {busy ? "Mengirim…" : "Kirim tautan masuk"}
      </button>
      {onPassword && (
        <p className="mt-5 text-center text-[13px]">
          <button type="button" className="text-[var(--ink-2)] hover:underline" onClick={onPassword}>
            Masuk dengan password
          </button>
        </p>
      )}
    </form>
  );
}
