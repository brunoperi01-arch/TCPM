// GET /api/admin/requests — demandes + poules + créneaux + numéros (admin uniquement)
import { sql, ADMIN_COLS, sendError } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { loadData, fromSql } from "../_lib/data.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const [requests, data] = await Promise.all([
      sql.query(`SELECT ${ADMIN_COLS} FROM match_requests ORDER BY requested_date, requested_time, created_at`),
      loadData(fromSql(sql)),
    ]);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ requests, ...data });
  } catch (err) {
    return sendError(res, err);
  }
}
