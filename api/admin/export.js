// GET /api/admin/export — export CSV (Excel FR) de toutes les demandes
import { sql, sendError } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { fmtScore } from "../../tournoi-interne/assets/config.js";

const STATUTS = { pending: "En attente", confirmed: "Confirmé", refused: "Refusé", cancelled: "Annulé" };
const cell = (v) => {
  const s = v == null ? "" : String(v);
  // Échappement + neutralisation des formules Excel
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await sql.query(
      `SELECT category, pool, player, opponent,
              to_char(requested_date, 'DD/MM/YYYY') AS date,
              to_char(requested_time, 'HH24:MI') AS time,
              status, court, refusal_reason, phone1, phone2,
              score, result_type, winner_side,
              CASE WHEN winner_side = 1 THEN player WHEN winner_side = 2 THEN opponent END AS vainqueur,
              validated_at IS NOT NULL AS valide, reported_at IS NOT NULL AS reporte,
              to_char(created_at AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI') AS created
       FROM match_requests ORDER BY requested_date, requested_time, created_at`);
    const head = ["Catégorie", "Poule", "Joueur / équipe 1", "Joueur / équipe 2", "Date", "Heure",
                  "Statut", "Terrain", "Score", "Vainqueur", "Validé", "Reporté MOJA",
                  "Motif refus", "Tél. 1", "Tél. 2", "Demandé le"];
    const lines = rows.map((r) => [
      r.category, r.pool, r.player, r.opponent, r.date, r.time, STATUTS[r.status] || r.status,
      r.court, fmtScore(r.score, r.result_type), r.vainqueur, r.valide ? "oui" : "", r.reporte ? "oui" : "",
      r.refusal_reason, r.phone1 && "0" + r.phone1.slice(2), r.phone2 && "0" + r.phone2.slice(2), r.created,
    ].map(cell).join(";"));
    const csv = "\uFEFF" + [head.map(cell).join(";"), ...lines].join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="tournoi-interne-${stamp}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(csv);
  } catch (err) {
    return sendError(res, err);
  }
}
