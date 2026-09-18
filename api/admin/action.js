// POST /api/admin/action — valider, refuser, annuler, marquer « prévenu »
import { withTx, sql, ADMIN_COLS, sendError, HttpError, body } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { TERRAINS, MOTIFS, analyseScore } from "../../tournoi-interne/assets/config.js";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const { action, id, court, reason, side } = body(req);
  if (!UUID.test(String(id))) return res.status(400).json({ error: "Demande inconnue." });

  try {
    if (action === "confirm") {
      if (!TERRAINS.includes(court)) throw new HttpError(400, "Terrain inconnu.");
      await withTx(async (db) => {
        const { rows } = await db.query(
          `SELECT status, to_char(requested_date, 'YYYY-MM-DD') AS date,
                  to_char(requested_time, 'HH24:MI') AS time
           FROM match_requests WHERE id = $1 FOR UPDATE`, [id]);
        const r = rows[0];
        if (!r) throw new HttpError(404, "Demande introuvable.");
        if (r.status !== "pending") throw new HttpError(409, "Cette demande a déjà été traitée.");

        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${r.date} ${r.time}`]);

        const { rows: c } = await db.query(
          `SELECT count(*)::int AS n,
                  (SELECT capacity FROM tournament_slots
                   WHERE slot_date = $1 AND slot_time = $2) AS cap
           FROM match_requests
           WHERE requested_date = $1 AND requested_time = $2 AND status = 'confirmed'`, [r.date, r.time]);
        if (c[0].n >= (c[0].cap ?? 0))
          throw new HttpError(409, "Créneau complet : validation impossible.");

        await db.query(
          `UPDATE match_requests
           SET status = 'confirmed', court = $2, decided_at = now(),
               notified1_at = NULL, notified2_at = NULL
           WHERE id = $1`, [id, court]);
      });
    } else if (action === "refuse") {
      const motif = MOTIFS.includes(reason) ? reason : null;
      const rows = await sql.query(
        `UPDATE match_requests
         SET status = 'refused', refusal_reason = $2, decided_at = now(),
             notified1_at = NULL, notified2_at = NULL
         WHERE id = $1 AND status = 'pending' RETURNING id`, [id, motif]);
      if (!rows.length) throw new HttpError(409, "Cette demande a déjà été traitée.");
    } else if (action === "cancel") {
      const rows = await sql.query(
        `UPDATE match_requests
         SET status = 'cancelled', decided_at = now(),
             notified1_at = NULL, notified2_at = NULL,
             score = NULL, result_type = NULL, winner_side = NULL,
             score_at = NULL, score_by = NULL, validated_at = NULL
         WHERE id = $1 AND status = 'confirmed' RETURNING id`, [id]);
      if (!rows.length) throw new HttpError(409, "Ce match n'est plus confirmé.");
    } else if (action === "notified") {
      const col = side === 1 ? "notified1_at" : side === 2 ? "notified2_at" : null;
      if (!col) throw new HttpError(400, "Joueur inconnu.");
      await sql.query(`UPDATE match_requests SET ${col} = now() WHERE id = $1`, [id]);
    } else if (action === "score") {
      // Correction du score par le juge-arbitre (validé dans la foulée)
      const { sets, type, winner } = body(req);
      const t = ["normal", "wo", "retired"].includes(type) ? type : "normal";
      const check = analyseScore(sets, t, winner === 1 || winner === 2 ? winner : null);
      if (check.error) throw new HttpError(400, check.error);
      const rows = await sql.query(
        `UPDATE match_requests
         SET score = $2::jsonb, result_type = $3, winner_side = $4,
             score_at = COALESCE(score_at, now()), score_by = 'Juge-arbitre', validated_at = now()
         WHERE id = $1 AND status = 'confirmed' RETURNING id`,
        [id, JSON.stringify(check.sets), t, check.winner]);
      if (!rows.length) throw new HttpError(409, "Ce match n'est pas confirmé.");
    } else if (action === "validate_score") {
      const rows = await sql.query(
        `UPDATE match_requests SET validated_at = now()
         WHERE id = $1 AND score_at IS NOT NULL AND validated_at IS NULL RETURNING id`, [id]);
      if (!rows.length) throw new HttpError(409, "Aucun score à valider pour ce match.");
    } else if (action === "moja") {
      await sql.query(
        `UPDATE match_requests SET reported_at = CASE WHEN reported_at IS NULL THEN now() ELSE NULL END
         WHERE id = $1`, [id]);
    } else {
      throw new HttpError(400, "Action inconnue.");
    }

    const rows = await sql.query(`SELECT ${ADMIN_COLS} FROM match_requests WHERE id = $1`, [id]);
    return res.status(200).json({ ok: true, request: rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: `${court} est déjà pris sur ce créneau.` });
    return sendError(res, err);
  }
}
