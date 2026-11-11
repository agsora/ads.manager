import { q } from "./db";
import { contentKpiProgress } from "./kpi-content";
import { monthEnd, monthStart } from "./format";
import type { Row } from "./resources";

export async function loadContentKpiProgress(org: number, filter: { brand?: string | null; from?: string; to?: string } = {}) {
  const targets = await q<Row>(
    `SELECT * FROM kpi_targets WHERE org_id = $1
      AND ($2::text IS NULL OR brand = $2)
      AND ($3::date IS NULL OR period >= $3)
      AND ($4::date IS NULL OR period <= $4)
      AND (target_posts > 0 OR target_uploads > 0)
      ORDER BY period DESC, id DESC`,
    [org, filter.brand || null, filter.from ? monthStart(filter.from) : null, filter.to ? monthEnd(filter.to) : null],
  );
  if (!targets.length) return [];
  const months = targets.map((t) => String(t.period).slice(0, 10)).sort();
  // Aggregate attachments first: a content with several files counts once. Use the first
  // remaining upload in Jakarta time, independently of the planned posting date.
  const content = await q<Row>(
    `SELECT c.*, f.upload_date FROM content_plans c
      LEFT JOIN (
        SELECT record_id, (min(created_at) AT TIME ZONE 'Asia/Jakarta')::date AS upload_date
        FROM drive_files WHERE org_id = $1 AND resource = 'content' GROUP BY record_id
      ) f ON f.record_id = c.id
      WHERE c.org_id = $1 AND ($2::text IS NULL OR c.brand = $2)
      AND (COALESCE(c.actual_date, c.post_date) BETWEEN $3::date AND $4::date
        OR f.upload_date BETWEEN $3::date AND $4::date)`,
    [org, filter.brand || null, monthStart(months[0]), monthEnd(months[months.length - 1])],
  );
  return contentKpiProgress(targets, content);
}
