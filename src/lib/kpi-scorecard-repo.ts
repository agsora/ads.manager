import { q } from "./db";
import { calculateKpi, type KpiData, type KpiScorecard } from "./kpi-engine";
import { monthStart, monthEnd } from "./format";
import type { Row } from "./resources";

export async function loadKpiScorecards(org: number, filter: { brand?: string | null; from?: string; to?: string } = {}) {
  const targets = await q<Row>(`SELECT * FROM kpi_targets WHERE org_id=$1
    AND ($2::text IS NULL OR brand=$2) AND ($3::date IS NULL OR period >= $3)
    AND ($4::date IS NULL OR period <= $4) ORDER BY period DESC, id DESC`,
  [org, filter.brand || null, filter.from ? monthStart(filter.from) : null, filter.to ? monthEnd(filter.to) : null]);
  if (!targets.length) return [];
  const periods = targets.map((r) => String(r.period).slice(0, 10)).sort();
  const params = [org, filter.brand || null, monthStart(periods[0]), monthEnd(periods[periods.length - 1])];
  const [content, leads, ads, reviews] = await Promise.all([
    q<Row>(`SELECT c.*, f.upload_date FROM content_plans c LEFT JOIN (
      SELECT record_id, (min(created_at) AT TIME ZONE 'Asia/Jakarta')::date AS upload_date
      FROM drive_files WHERE org_id=$1 AND resource='content' GROUP BY record_id
    ) f ON f.record_id=c.id WHERE c.org_id=$1 AND ($2::text IS NULL OR c.brand=$2)
    AND (c.post_date BETWEEN $3::date AND $4::date OR c.actual_date BETWEEN $3::date AND $4::date OR f.upload_date BETWEEN $3::date AND $4::date)`, params),
    q<Row>(`SELECT * FROM leads WHERE org_id=$1 AND ($2::text IS NULL OR brand=$2) AND chat_date BETWEEN $3::date AND $4::date`, params),
    q<Row>(`SELECT * FROM ad_campaigns WHERE org_id=$1 AND ($2::text IS NULL OR brand=$2) AND start_date BETWEEN $3::date AND $4::date`, params),
    q<Row>(`SELECT * FROM reviews WHERE org_id=$1 AND ($2::text IS NULL OR brand=$2) AND review_date BETWEEN $3::date AND $4::date`, params),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const data: KpiData = { content, leads, ads, reviews };
  return targets.map((r) => {
    const { review_snapshot: snapshot, ...row } = r;
    // Only this server's review endpoint can write the snapshot; generic resource fields exclude it.
    return row.review_locked && snapshot ? { ...(snapshot as KpiScorecard), row } : calculateKpi(row, data, today);
  });
}
