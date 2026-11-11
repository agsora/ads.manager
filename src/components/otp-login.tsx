"use client";

import { useEffect, useRef, useState } from "react";

/** Login dengan kode 6 digit yang dikirim ke email: langkah 1 isi email, langkah 2 isi kode. */
export function OtpLogin({ onPassword }: { onPassword?: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [masked, setMasked] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cool, setCool] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // hitung mundur sebelum boleh kirim ulang
  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const post = async (url: string, body?: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; restart?: boolean; email?: string; message?: string };
    return { ok: r.ok, j };
  };

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { ok, j } = await post("/api/auth/otp/request", { email });
    setBusy(false);
    if (!ok) return setErr(j.error || "Gagal mengirim kode");
    setMasked(j.email ?? email);
    setCode("");
    setInfo("");
    setCool(60);
    setStep("code");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { ok, j } = await post("/api/auth/otp/verify", { code });
    if (ok) {
      window.location.href = "/";
      return;
    }
    setBusy(false);
    setErr(j.error || "Kode salah");
    setCode("");
    if (j.restart) setStep("email");
    else codeRef.current?.focus();
  };

  const resend = async () => {
    setErr("");
    setInfo("");
    const { ok, j } = await post("/api/auth/otp/resend");
    if (ok) {
      setInfo(j.message || "Kode baru dikirim.");
      setCool(60);
    } else {
      setErr(j.error || "Gagal mengirim ulang");
      if (j.restart) setStep("email");
    }
  };

  return (
    <form onSubmit={step === "email" ? request : verify} className="w-full max-w-[360px]">
      <h2 className="serif text-[30px] leading-tight">{step === "email" ? "Selamat datang kembali" : "Masukkan kode"}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--ink-2)]">
        {step === "email" ? "Masuk dengan kode 6 digit yang kami kirim ke email Anda." : `Kode 6 digit dikirim ke ${masked}. Berlaku 10 menit. Periksa juga folder spam.`}
      </p>

      <div className="mt-8 space-y-4">
        {step === "email" ? (
          <div>
            <label className="label" htmlFor="otp-em">Email</label>
            <input id="otp-em" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="otp-code">Kode OTP</label>
            <input
              id="otp-code"
              ref={codeRef}
              className="input !h-12 text-center !font-mono !text-[22px] tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="······"
              required
            />
          </div>
        )}
      </div>

      {info && <div className="mt-4 rounded-lg border border-[#c9dbc0] bg-[#eef5e9] px-3 py-2 text-[13px] text-[var(--good-ink)]">{info}</div>}
      {err && <div className="mt-4 rounded-lg border border-[#eac9bf] bg-[#fbefec] px-3 py-2 text-[13px] text-[var(--critical-ink)]">{err}</div>}

      <button className="btn btn-primary mt-6 w-full !h-11 !text-[14px]" disabled={busy || (step === "code" && code.length !== 6)}>
        {busy ? "Memproses…" : step === "email" ? "Kirim kode" : "Masuk"}
      </button>

      {step === "code" && (
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <button type="button" className="text-[var(--ink-2)] hover:underline" onClick={() => { setStep("email"); setErr(""); setInfo(""); }}>
            Ganti email
          </button>
          <button type="button" className="font-semibold text-[var(--accent-ink)] disabled:font-normal disabled:text-[var(--muted)]" disabled={cool > 0} onClick={resend}>
            {cool > 0 ? `Kirim ulang (${cool}s)` : "Kirim ulang kode"}
          </button>
        </div>
      )}

      {onPassword && step === "email" && (
        <p className="mt-5 text-center text-[13px]">
          <button type="button" className="text-[var(--ink-2)] hover:underline" onClick={onPassword}>
            Masuk dengan password
          </button>
        </p>
      )}
    </form>
  );
}
