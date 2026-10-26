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

export interface GeoPoint {
  lat: number;
  lng: number;
  approx: boolean;
}

// Town centres (approximate). A branch gets its exact point from a Google Maps link or typed coordinates.
const TOWNS: Record<string, [number, number]> = {
  "banda aceh": [5.5483, 95.3238],
  subulussalam: [2.6406, 98.0045],
  sigli: [5.3868, 95.964],
  langsa: [4.4683, 97.9683],
  lhokseumawe: [5.1801, 97.1507],
  lhoksumawe: [5.1801, 97.1507],
  meulaboh: [4.1376, 96.1285],
  simeulue: [2.471, 96.388],
  "panton labu": [5.09, 97.26],
  pantonlabu: [5.09, 97.26],
  bireuen: [5.2036, 96.7009],
  takengon: [4.6286, 96.8366],
  tapaktuan: [3.2608, 97.1827],
  kutacane: [3.4939, 97.8009],
  medan: [3.5952, 98.6722],
  "nibung raya": [3.5952, 98.6722],
  "sm raja": [3.5712, 98.6811],
  binjai: [3.6001, 98.4854],
  siantar: [2.9595, 99.0687],
  kisaran: [2.9833, 99.6167],
  padangsidimpuan: [1.3789, 99.2735],
  sibolga: [1.7427, 98.7792],
  padang: [-0.9471, 100.4172],
  bukittinggi: [-0.3055, 100.3692],
  payakumbuh: [-0.2299, 100.6331],
  solok: [-0.7919, 100.6573],
  pekanbaru: [0.5071, 101.4478],
  dumai: [1.6667, 101.45],
  duri: [1.2423, 101.1555],
  bangkinang: [0.3333, 101.0333],
  batam: [1.0456, 104.0305],
  "tanjung pinang": [0.9186, 104.4586],
  tanjungpinang: [0.9186, 104.4586],
  karimun: [1.0, 103.4],
  jakarta: [-6.2088, 106.8456],
  bandung: [-6.9175, 107.6191],
  surabaya: [-7.2575, 112.7521],
  semarang: [-6.9667, 110.4167],
  yogyakarta: [-7.7956, 110.3695],
  solo: [-7.5666, 110.8167],
  malang: [-7.9666, 112.6326],
  bekasi: [-6.2383, 106.9756],
  tangerang: [-6.1783, 106.63],
  bogor: [-6.595, 106.8166],
  depok: [-6.4025, 106.7942],
};

/** Approximate point for a branch, from the town named in it; null when no town is recognised. */
export function coordsForBranch(branch: unknown): GeoPoint | null {
  const t = String(branch ?? "").toLowerCase();
  if (!t) return null;
  let best: [string, [number, number]] | null = null;
  for (const [name, c] of Object.entries(TOWNS)) {
    if (new RegExp("(^|[^a-z])" + name.replace(/ /g, "[ -]?") + "([^a-z]|$)").test(t) && (!best || name.length > best[0].length)) best = [name, c];
  }
  return best ? { lat: best[1][0], lng: best[1][1], approx: true } : null;
}
