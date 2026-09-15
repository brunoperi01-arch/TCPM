// GET /api/admin/requests — toutes les demandes, avec numéros (admin uniquement)
import { sql, ADMIN_COLS, sendError } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const requests = await sql.query(
      `SELECT ${ADMIN_COLS} FROM match_requests ORDER BY requested_date, requested_time, created_at`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ requests });
  } catch (err) {
    return sendError(res, err);
  }
}
