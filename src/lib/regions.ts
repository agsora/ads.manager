/** The six sales regions used to group branches (Google Business, reputation). */
export const REGIONS = ["Aceh", "Sumut", "Sumbar", "Riau", "Kepri", "Jawa"] as const;
export type Region = (typeof REGIONS)[number];

// Place names that identify a region. Matched as whole words, case-insensitive, against a branch name.
const PLACES: Record<Region, string[]> = {
  Aceh: ["aceh", "banda aceh", "subulussalam", "sigli", "langsa", "lhokseumawe", "lhoksumawe", "meulaboh", "simeulue", "panton labu", "pantonlabu", "bireuen", "takengon", "blangpidie", "tapaktuan", "kutacane", "idi", "calang", "sabang", "singkil", "peureulak", "kuala simpang"],
  Sumut: ["sumut", "medan", "nibung raya", "sm raja", "binjai", "deli serdang", "siantar", "pematang siantar", "kisaran", "rantau prapat", "padangsidimpuan", "sibolga", "tebing tinggi", "kabanjahe", "tanjung balai", "lubuk pakam", "stabat", "gunung sitoli", "balige"],
  Sumbar: ["sumbar", "padang", "bukittinggi", "payakumbuh", "solok", "pariaman", "painan", "batusangkar", "sawahlunto", "padang panjang"],
  Riau: ["riau", "pekanbaru", "dumai", "duri", "bangkinang", "rengat", "siak", "bengkalis", "kandis", "selatpanjang", "taluk kuantan", "pasir pengaraian", "ujung batu"],
  Kepri: ["kepri", "batam", "tanjung pinang", "tanjungpinang", "karimun", "bintan", "natuna", "lingga", "anambas"],
  Jawa: ["jawa", "jakarta", "bandung", "surabaya", "semarang", "yogyakarta", "bekasi", "tangerang", "bogor", "depok", "malang", "solo", "cirebon"],
};

const RULES = (Object.entries(PLACES) as [Region, string[]][]).map(([region, words]) => ({
  region,
  re: new RegExp("(^|[^a-z])(" + words.map((w) => w.replace(/ /g, "[ -]?")).join("|") + ")([^a-z]|$)", "i"),
}));

/** Best guess of the region for a branch name, or null when it is not recognised. */
export function regionForBranch(branch: unknown): Region | null {
  const t = String(branch ?? "").trim();
  if (!t) return null;
  // Aceh first: "Medan-Nibung Raya" must not be read as Aceh, but "Aceh" towns never contain Medan words
  for (const r of RULES) if (r.re.test(t)) return r.region;
  return null;
}
