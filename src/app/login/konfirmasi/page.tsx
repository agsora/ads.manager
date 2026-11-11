import { ConfirmLink } from "@/components/confirm-link";

export const dynamic = "force-dynamic";

/** Halaman tujuan tautan email: satu tombol untuk masuk (token baru dipakai saat tombol ditekan). */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ConfirmLink token={token ?? ""} />;
}
