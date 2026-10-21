"use client";

import type { Analytics } from "@/lib/analytics";
import { useFetch, useFilter } from "./providers";

export function useAnalytics() {
  const f = useFilter();
  return useFetch<Analytics>(`/api/analytics?${f.qs}`);
}
