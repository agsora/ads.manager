"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { checkCompliance } from "@/lib/compliance";
import { normPhone } from "@/lib/phone";
import { fmtDate } from "@/lib/format";
import type { Row } from "@/lib/resources";

/** Fields whose text goes out to customers, so they get the wording check. */
export const COMPLIANCE_FIELDS = new Set(["caption", "message", "body", "hook"]);

export function ComplianceHint({ text }: { text: string }) {
  if (!text || text.trim().length < 12) return null;
  const { issues, missingDisclaimer } = checkCompliance(text);
  if (!issues.length && !missingDisclaimer) return null;
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-[#ecd9a6] bg-[#fbf4df] p-3 text-[12.5px] leading-snug text-[var(--warning-ink)]" role="status">
      <div className="flex items-center gap-1.5 font-semibold">
        <ShieldAlert size={14} /> Periksa kata-kata sebelum dikirim
      </div>
      <ul className="space-y-1.5">
        {issues.map((i, k) => (
          <li key={k}>
            <b className={i.level === "high" ? "text-[var(--critical-ink)]" : ""}>“{i.found}”</b> — {i.why} <span className="text-[var(--ink-2)]">Saran: {i.fix}</span>
          </li>
        ))}
        {missingDisclaimer && (
          <li>
            Belum ada keterangan <b>syarat &amp; ketentuan</b> atau status perusahaan <b>terdaftar dan diawasi OJK</b> untuk teks promosi ini.
          </li>
        )}
      </ul>
    </div>
  );
}

/** Under a phone field: warns when the number is already a lead (duplicate) or on the do-not-contact list. */
export function PhoneHint({ value, resource, selfId }: { value: string; resource: string; selfId?: number }) {
  const [dups, setDups] = useState<Row[]>([]);
  const [stopped, setStopped] = useState(false);
  const digits = normPhone(value);
  useEffect(() => {
    if (digits.length < 9) {
      setDups([]);
      setStopped(false);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const [a, b] = await Promise.all([fetch(`/api/r/${resource}?q=${encodeURIComponent(digits.slice(-9))}`).then((r) => r.json()), fetch(`/api/r/optouts?q=${encodeURIComponent(digits.slice(-9))}`).then((r) => r.json())]);
        if (!alive) return;
        setDups(((a.rows ?? []) as Row[]).filter((r) => r.id !== selfId && normPhone(r.phone) === digits).slice(0, 3));
        setStopped(((b.rows ?? []) as Row[]).some((r) => normPhone(r.phone) === digits));
      } catch {
        /* the hint is optional */
      }
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [digits, resource, selfId]);

  if (!dups.length && !stopped) return null;
  return (
    <div className="mt-1.5 space-y-1 text-[12.5px] leading-snug">
      {stopped && (
        <div className="flex items-start gap-1.5 text-[var(--critical-ink)]">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" /> Nomor ini ada di <b>Daftar Jangan Dihubungi</b>. Jangan kirim pesan promosi.
        </div>
      )}
      {dups.length > 0 && (
        <div className="flex items-start gap-1.5 text-[var(--warning-ink)]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Nomor ini sudah tercatat: {dups.map((d) => `${d.name || "(tanpa nama)"} · ${fmtDate(d.chat_date ?? d.blast_date)}`).join("; ")}. Pastikan bukan data dobel.
          </span>
        </div>
      )}
    </div>
  );
}
