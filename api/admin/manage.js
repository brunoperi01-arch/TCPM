// POST /api/admin/manage — gestion des poules, créneaux et numéros (admin uniquement)
import { withTx, sendError, HttpError, body } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { loadData, fromClient } from "../_lib/data.js";
import {
  getPoule, formatEntree, erreurEntree, joueursDe, normPhone, clean,
  DATE_RE, TIME_RE, TERRAINS,
} from "../../tournoi-interne/assets/config.js";

const MAX_LINES = 60;

/** Une ligne collée : "Nom ; tél" ou "Joueur / Joueuse ; tél 1 ; tél 2" */
function parseLine(line) {
  const [nom, ...tels] = line.split(/[;\t]/).map((x) => x.trim());
  return { nom: formatEntree(nom), tels };
}

async function hasRequests(db, sqlWhere, params) {
  const { rows } = await db.query(`SELECT 1 FROM match_requests WHERE ${sqlWhere} LIMIT 1`, params);
  return rows.length > 0;
}

const handlers = {
  // Ajout en masse de joueurs / équipes dans une poule (+ numéros facultatifs)
  async entry_add(db, b) {
    const poule = getPoule(b.poolId);
    if (!poule) throw new HttpError(400, "Poule inconnue.");
    const lines = String(b.text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new HttpError(400, "Aucun nom saisi.");
    if (lines.length > MAX_LINES) throw new HttpError(400, `${MAX_LINES} lignes maximum à la fois.`);

    const report = { added: [], existing: [], errors: [], phones: 0 };
    for (const line of lines) {
      const { nom, tels } = parseLine(line);
      const err = erreurEntree(poule.categorie, nom);
      if (err) { report.errors.push(`${line} : ${err}`); continue; }
      const { rowCount } = await db.query(
        `INSERT INTO pool_entries (pool_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [poule.id, nom]);
      (rowCount ? report.added : report.existing).push(nom);

      const joueurs = joueursDe(nom);
      for (let i = 0; i < joueurs.length; i++) {
        if (!tels[i]) continue;
        const tel = normPhone(tels[i]);
        if (!tel) { report.errors.push(`${joueurs[i]} : numéro invalide (${tels[i]})`); continue; }
        await db.query(
          `INSERT INTO player_contacts (name, phone) VALUES ($1, $2)
           ON CONFLICT (name) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now()`, [joueurs[i], tel]);
        report.phones++;
      }
    }
    return report;
  },

  async entry_rename(db, b) {
    const poule = getPoule(b.poolId);
    if (!poule) throw new HttpError(400, "Poule inconnue.");
    const oldName = clean(b.name), newName = formatEntree(b.newName);
    const err = erreurEntree(poule.categorie, newName);
    if (err) throw new HttpError(400, err);
    if (oldName === newName) return {};
    if (await hasRequests(db, "pool = $1 AND (player = $2 OR opponent = $2)", [poule.nom, oldName]))
      throw new HttpError(409, "Impossible : des demandes existent déjà pour ce nom.");
    const { rowCount } = await db.query(
      `UPDATE pool_entries SET name = $3 WHERE pool_id = $1 AND name = $2`, [poule.id, oldName, newName]);
    if (!rowCount) throw new HttpError(404, "Nom introuvable.");
    return {};
  },

  async entry_delete(db, b) {
    const poule = getPoule(b.poolId);
    if (!poule) throw new HttpError(400, "Poule inconnue.");
    const name = clean(b.name);
    if (await hasRequests(db, "pool = $1 AND (player = $2 OR opponent = $2)", [poule.nom, name]))
      throw new HttpError(409, "Impossible : des demandes existent déjà pour ce nom.");
    await db.query(`DELETE FROM pool_entries WHERE pool_id = $1 AND name = $2`, [poule.id, name]);
    return {};
  },

  async slot_add(db, b) {
    const cap = Number(b.capacity);
    if (!DATE_RE.test(b.date) || !TIME_RE.test(b.time)) throw new HttpError(400, "Date ou heure invalide.");
    if (!(cap >= 1 && cap <= TERRAINS.length)) throw new HttpError(400, `Capacité entre 1 et ${TERRAINS.length}.`);
    const { rowCount } = await db.query(
      `INSERT INTO tournament_slots (slot_date, slot_time, capacity) VALUES ($1, $2, $3)
       ON CONFLICT (slot_date, slot_time) DO NOTHING`, [b.date, b.time, cap]);
    if (!rowCount) throw new HttpError(409, "Ce créneau existe déjà.");
    return {};
  },

  async slot_update(db, b) {
    const { rows } = await db.query(
      `SELECT to_char(slot_date, 'YYYY-MM-DD') AS date, to_char(slot_time, 'HH24:MI') AS time
       FROM tournament_slots WHERE id = $1 FOR UPDATE`, [b.id]);
    const s = rows[0];
    if (!s) throw new HttpError(404, "Créneau introuvable.");
    if (b.capacity != null) {
      const cap = Number(b.capacity);
      if (!(cap >= 1 && cap <= TERRAINS.length)) throw new HttpError(400, `Capacité entre 1 et ${TERRAINS.length}.`);
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${s.date} ${s.time}`]);
      const { rows: c } = await db.query(
        `SELECT count(*)::int AS n FROM match_requests
         WHERE requested_date = $1 AND requested_time = $2 AND status = 'confirmed'`, [s.date, s.time]);
      if (cap < c[0].n) throw new HttpError(409, `Impossible : ${c[0].n} matchs déjà confirmés sur ce créneau.`);
      await db.query(`UPDATE tournament_slots SET capacity = $2 WHERE id = $1`, [b.id, cap]);
    }
    if (typeof b.active === "boolean")
      await db.query(`UPDATE tournament_slots SET active = $2 WHERE id = $1`, [b.id, b.active]);
    return {};
  },

  async slot_delete(db, b) {
    const { rows } = await db.query(
      `SELECT slot_date, slot_time FROM tournament_slots WHERE id = $1 FOR UPDATE`, [b.id]);
    if (!rows[0]) throw new HttpError(404, "Créneau introuvable.");
    if (await hasRequests(db, "requested_date = $1 AND requested_time = $2", [rows[0].slot_date, rows[0].slot_time]))
      throw new HttpError(409, "Des demandes existent sur ce créneau : masquez-le plutôt que de le supprimer.");
    await db.query(`DELETE FROM tournament_slots WHERE id = $1`, [b.id]);
    return {};
  },

  async contact_set(db, b) {
    const name = clean(b.name);
    if (!name || joueursDe(name).length !== 1) throw new HttpError(400, "Nom invalide.");
    if (!String(b.phone || "").trim()) {
      await db.query(`DELETE FROM player_contacts WHERE name = $1`, [name]);
      return {};
    }
    const tel = normPhone(b.phone);
    if (!tel) throw new HttpError(400, "Numéro invalide (portable 06 ou 07).");
    await db.query(
      `INSERT INTO player_contacts (name, phone) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now()`, [name, tel]);
    return {};
  },
};

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const b = body(req);
  const fn = handlers[b.action];
  if (!fn) return res.status(400).json({ error: "Action inconnue." });
  try {
    const result = await withTx(async (db) => {
      const out = await fn(db, b);
      return { ...out, data: await loadData(fromClient(db)) };
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err.code === "22P02" || err.code === "22008" || err.code === "22007")
      return res.status(400).json({ error: "Valeur invalide." });
    if (err.code === "23505") return res.status(409).json({ error: "Ce nom existe déjà dans la poule." });
    return sendError(res, err);
  }
}
