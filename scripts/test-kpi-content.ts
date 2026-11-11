import assert from "node:assert/strict";
import { contentKpiProgress } from "../src/lib/kpi-content";

const target = { id: 1, period: "2026-11-01", brand: "OTO", content_category: "Edukasi", branch: "Aceh", content_type: "Video/Reels", target_uploads: 5, target_posts: 3 };
const base = { brand: "OTO", content_category: "Edukasi", branch: "Aceh", content_type: "Video/Reels", post_date: "2026-10-01", actual_date: "2026-11-02", upload_date: "2026-11-01", status: "Posted" };
const result = contentKpiProgress([target], [
  base,
  { ...base, status: "Desain Selesai" },
  { ...base, branch: "Batam" },
  { ...base, brand: "CMD" },
  { ...base, content_category: "Promo" },
  { ...base, content_type: "Story" },
  { ...base, status: "Cancel" },
  { ...base, upload_date: "2026-10-31", actual_date: "2026-10-31" },
  { ...base, upload_date: null, actual_date: null, post_date: "2026-11-04" },
])[0];
assert.equal(result.uploaded, 2, "Only matching non-cancelled November uploads count");
assert.equal(result.posted, 2, "Actual posting month takes precedence; missing actual falls back to planned date");
const legacy = contentKpiProgress([{ ...target, content_category: null, branch: null, content_type: null }], [base, { ...base, branch: null, content_category: null, content_type: null }])[0];
assert.equal(legacy.uploaded, 2, "Unscoped targets include old records without categories");
assert.equal(contentKpiProgress([target], []).at(0)?.posted, 0);
assert.equal(contentKpiProgress([{ ...target, target_uploads: 0, target_posts: 0 }], [base]).length, 0);
assert.equal(contentKpiProgress([{ ...target, period: "2026-12-01" }], [base])[0].uploaded, 0);
console.log("KPI content checks passed");
