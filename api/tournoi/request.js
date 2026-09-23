// POST /api/tournoi/request — création d'une demande (statut pending)
// Tout est revérifié ici : le navigateur n'est jamais cru sur parole.
import { withTx, sendError, HttpError, body } from "../_lib/db.js";
import { loadData, fromClient, contactOf, findPool, fixturesOf, fixtureExists } from "../_lib/data.js";
import {
  estAVenir, clean, normPhone, slotState, DATE_RE, TIME_RE,
} from "../../tournoi-interne/assets/config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  try {
    const b = body(req);

    // Anti-robot : champ invisible rempli = on fait semblant d'accepter
    if (b.website) return res.status(200).json({ ok: true });

    const player = clean(b.player), opponent = clean(b.opponent);
    if (player === opponent) throw new HttpError(400, "Vous ne pouvez pas jouer contre vous-même.");
    if (!DATE_RE.test(b.date) || !TIME_RE.test(b.time)) throw new HttpError(400, "Créneau invalide.");

    const id = await withTx(async (db) => {
      const data = await loadData(fromClient(db));
      const poule = findPool(data, b.poolId);
      if (!poule) throw new HttpError(400, "Poule inconnue.");
      const entrees = data.entries[poule.id] || [];
      if (!entrees.includes(player) || !entrees.includes(opponent))
        throw new HttpError(400, "Joueur inconnu dans cette poule.");

      // Si la poule a des rencontres programmées, seule une affiche prévue est acceptée
      if (fixturesOf(data, poule.id).length) {
        const { rows: dejaJoues } = await db.query(
          `SELECT pool, player, opponent, winner_side, validated_at IS NOT NULL AS validated
           FROM match_requests WHERE pool = $1`, [poule.nom]);
        if (!fixtureExists(data, dejaJoues, poule.id, player, opponent))
          throw new HttpError(409, "Cette rencontre n'est pas au programme du tableau.");
      }

      const creneau = data.slots.find((s) => s.active && s.date === b.date && s.time === b.time);
      if (!creneau) throw new HttpError(400, "Ce créneau n'est plus proposé.");
      if (!estAVenir(creneau)) throw new HttpError(400, "Ce créneau est passé.");

      const phone1 = contactOf(data.contacts, player) || normPhone(b.phone1);
      const phone2 = contactOf(data.contacts, opponent) || normPhone(b.phone2);
      if (!phone1) throw new HttpError(400, "Indiquez votre numéro de portable (06 ou 07).");
      if (!phone2) throw new HttpError(400, `Indiquez le portable de ${opponent} (06 ou 07).`);

      // Limite simple : 10 demandes par numéro sur une heure
      const { rows: recent } = await db.query(
        `SELECT count(*)::int AS n FROM match_requests
         WHERE phone1 = $1 AND created_at > now() - interval '1 hour'`, [phone1]);
      if (recent[0].n >= 10) throw new HttpError(429, "Trop de demandes. Réessayez plus tard.");

      // Verrou sur le créneau : deux envois simultanés sont traités l'un après l'autre
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${creneau.date} ${creneau.time}`]);

      const { rows: onSlot } = await db.query(
        `SELECT player, opponent, status,
                to_char(requested_date, 'YYYY-MM-DD') AS date,
                to_char(requested_time, 'HH24:MI') AS time
         FROM match_requests
         WHERE requested_date = $1 AND requested_time = $2
           AND status IN ('pending', 'confirmed')`,
        [creneau.date, creneau.time]);

      const st = slotState(onSlot, creneau, player, opponent);
      if (st.type === "full") throw new HttpError(409, "Ce créneau est complet. Choisissez-en un autre.");
      if (st.type === "conflict") throw new HttpError(409, "Un des joueurs a déjà un match sur ce créneau. Choisissez-en un autre.");

      const { rows } = await db.query(
        `INSERT INTO match_requests
           (category, pool, player, opponent, requested_date, requested_time, phone1, phone2)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [poule.category, poule.nom, player, opponent, creneau.date, creneau.time, phone1, phone2]);
      return rows[0].id;
    });

    return res.status(201).json({ ok: true, id });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Une demande existe déjà pour ce match." });
    return sendError(res, err);
  }
}
