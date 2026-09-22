// GET /api/tournoi/state — données publiques du formulaire (aucun numéro)
import { sql, PUBLIC_COLS, sendError } from "../_lib/db.js";
import { loadData, fromSql, entreesConnues } from "../_lib/data.js";
import { estAVenir } from "../../tournoi-interne/assets/config.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const q = fromSql(sql);
    const [requests, data] = await Promise.all([
      q(`SELECT ${PUBLIC_COLS} FROM match_requests ORDER BY created_at`),
      loadData(q),
    ]);
    const creneaux = data.slots
      .filter((s) => s.active && estAVenir(s))
      .map(({ date, time, capacity, duration }) => ({ date, time, capacity, duration }));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ requests, pools: data.pools, entries: data.entries, fixtures: data.fixtures, creneaux, known: entreesConnues(data) });
  } catch (err) {
    return sendError(res, err);
  }
}
