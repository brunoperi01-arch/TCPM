// GET /api/tournoi/state — données publiques pour le formulaire (aucun numéro)
import { sql, PUBLIC_COLS, sendError } from "../_lib/db.js";
import { entreesConnues } from "../_lib/contacts.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const requests = await sql.query(`SELECT ${PUBLIC_COLS} FROM match_requests ORDER BY created_at`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ requests, known: entreesConnues() });
  } catch (err) {
    return sendError(res, err);
  }
}
