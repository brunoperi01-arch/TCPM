// POST /api/tournoi/score — saisie du score par un des deux joueurs
import { sql, sendError, HttpError, body } from "../_lib/db.js";
import { analyseScore, nowParis, finCreneau } from "../../tournoi-interne/assets/config.js";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const b = body(req);
    if (b.website) return res.status(200).json({ ok: true });
    if (!UUID.test(String(b.id))) throw new HttpError(400, "Match inconnu.");

    const rows = await sql.query(
      `SELECT r.id, r.status, r.player, r.opponent, r.validated_at,
              to_char(r.requested_date, 'YYYY-MM-DD') AS date,
              to_char(r.requested_time, 'HH24:MI') AS time,
              COALESCE(s.duration_min, 120) AS duration
       FROM match_requests r
       LEFT JOIN tournament_slots s
         ON s.slot_date = r.requested_date AND s.slot_time = r.requested_time
       WHERE r.id = $1`, [b.id]);
    const m = rows[0];
    if (!m) throw new HttpError(404, "Match introuvable.");
    if (m.status !== "confirmed") throw new HttpError(409, "Ce match n'est pas confirmé.");
    if (m.validated_at) throw new HttpError(409, "Score déjà validé par le club. Contactez le juge-arbitre.");
    if (`${m.date} ${finCreneau(m.time, m.duration)}` > nowParis())
      throw new HttpError(409, "Le match n'est pas encore terminé.");

    const type = ["normal", "wo", "retired"].includes(b.type) ? b.type : "normal";
    const winner = b.winner === 1 || b.winner === 2 ? b.winner : null;
    const check = analyseScore(b.sets, type, winner);
    if (check.error) throw new HttpError(400, check.error);

    const par = b.side === 2 ? m.opponent : m.player;
    await sql.query(
      `UPDATE match_requests
       SET score = $2::jsonb, result_type = $3, winner_side = $4, score_at = now(), score_by = $5
       WHERE id = $1 AND status = 'confirmed' AND validated_at IS NULL`,
      [b.id, JSON.stringify(check.sets), type, check.winner, par]);

    return res.status(200).json({ ok: true, winner: check.winner === 1 ? m.player : m.opponent });
  } catch (err) {
    return sendError(res, err);
  }
}
