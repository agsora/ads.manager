import { n, type Row } from "./resources";

/** Empty scope fields include all values, including content recorded before scopes existed. */
export function contentKpiProgress(targets: Row[], content: Row[]) {
  return targets.filter((t) => n(t.target_posts) > 0 || n(t.target_uploads) > 0).map((t) => {
    const month = String(t.period ?? "").slice(0, 7);
    const matching = content.filter((c) => c.status !== "Cancel" &&
      ["brand", "content_category", "content_type", "branch"].every((key) => !t[key] || t[key] === c[key]));
    const uploaded = matching.filter((c) => month && String(c.upload_date ?? "").slice(0, 7) === month).length;
    const posted = matching.filter((c) => c.status === "Posted" && month &&
      String(c.actual_date || c.post_date || "").slice(0, 7) === month).length;
    return {
      id: t.id, title: String(t.title || t.brand || "Target konten"), month,
      brand: String(t.brand || ""), category: String(t.content_category || ""),
      contentType: String(t.content_type || ""), branch: String(t.branch || ""),
      uploaded, posted, targetUploads: n(t.target_uploads), targetPosts: n(t.target_posts),
    };
  });
}

export type ContentKpiProgress = ReturnType<typeof contentKpiProgress>;
