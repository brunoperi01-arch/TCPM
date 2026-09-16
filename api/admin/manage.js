// POST /api/admin/manage — gestion des poules, créneaux et numéros (admin uniquement)
import { withTx, sendError, HttpError, body } from "../_lib/db.js";
import { requireAdmin } from "../_lib/auth.js";
import { loadData, fromClient } from "../_lib/data.js";
import {
  formatEntree, erreurEntree, joueursDe, normPhone, clean, CATEGORIES, poolId, poolNom,
  DATE_RE, TIME_RE, TERRAINS,
} from "../../tournoi-interne/assets/config.js";

const MAX_LINES = 60;

/** Une ligne collée : "Nom ; tél" ou "Joueur / Joueuse ; tél 1 ; tél 2" */
function parseLine(line) {
  const [nom, ...tels] = line.split(/[;\t]/).map((x) => x.trim());
  return { nom: formatEntree(nom), tels };
}

async function getPool(db, id) {
  const { rows } = await db.query(`SELECT id, category, level, number, nom FROM pools WHERE id = $1`, [String(id || "")]);
  if (!rows[0]) throw new HttpError(400, "Poule inconnue.");
  return { ...rows[0], categorie: rows[0].category };
}

async function upsertContact(db, name, tel) {
  await db.query(
    `INSERT INTO player_contacts (name, phone) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now()`, [name, tel]);
}

async function hasRequests(db, sqlWhere, params) {
  const { rows } = await db.query(`SELECT 1 FROM match_requests WHERE ${sqlWhere} LIMIT 1`, params);
  return rows.length > 0;
}

const handlers = {
  // Import MOJA : crée / met à jour les poules, leurs joueurs et les numéros
  async import(db, b) {
    const pools = Array.isArray(b.pools) ? b.pools : [];
    if (!pools.length || pools.length > 40) throw new HttpError(400, "Aucune poule à importer.");
    const report = { pools: 0, added: 0, removed: 0, phones: 0, kept: [], errors: [] };
    const ids = [];

    for (const p of pools) {
      const number = Number(p.number);
      if (!CATEGORIES[p.category] || !/^[a-z0-9-]{1,20}$/.test(p.level) || !(number >= 1 && number <= 99))
        throw new HttpError(400, "Poule invalide dans l'import.");
      const id = poolId(p.category, p.level, number), nom = poolNom(p.category, p.level, number);
      ids.push(id);
      await db.query(
        `INSERT INTO pools (id, category, level, number, nom) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom`, [id, p.category, p.level, number, nom]);
      report.pools++;

      const entries = (Array.isArray(p.entries) ? p.entries : []).slice(0, 40).map(formatEntree);
      const valides = [];
      for (const e of entries) {
        const err = erreurEntree(p.category, e);
        if (err) { report.errors.push(`${nom} : « ${e} » ${err}`); continue; }
        valides.push(e);
        const { rowCount } = await db.query(
          `INSERT INTO pool_entries (pool_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, e]);
        report.added += rowCount;
      }
      if (b.replace) {
        const { rows } = await db.query(`SELECT name FROM pool_entries WHERE pool_id = $1`, [id]);
        for (const { name } of rows.filter((r) => !valides.includes(r.name))) {
          if (await hasRequests(db, "pool = $1 AND (player = $2 OR opponent = $2)", [nom, name])) {
            report.kept.push(`${name} (${nom})`);
          } else {
            await db.query(`DELETE FROM pool_entries WHERE pool_id = $1 AND name = $2`, [id, name]);
            report.removed++;
          }
        }
      }
    }

    if (b.replace) {
      const { rows: old } = await db.query(`SELECT id, nom FROM pools WHERE NOT (id = ANY($1))`, [ids]);
      for (const o of old) {
        if (await hasRequests(db, "pool = $1", [o.nom])) { report.kept.push(o.nom); continue; }
        await db.query(`DELETE FROM pool_entries WHERE pool_id = $1`, [o.id]);
        await db.query(`DELETE FROM pools WHERE id = $1`, [o.id]);
      }
      // Anciens noms sans poule (structure précédente)
      await db.query(`DELETE FROM pool_entries WHERE pool_id NOT IN (SELECT id FROM pools)`);
    }

    const contacts = b.contacts && typeof b.contacts === "object" ? Object.entries(b.contacts).slice(0, 400) : [];
    for (const [name, tel] of contacts) {
      const n = clean(name), t = normPhone(tel);
      if (!n || joueursDe(n).length !== 1 || !t) continue;
      await upsertContact(db, n, t);
      report.phones++;
    }
    return { report };
  },

  async pool_delete(db, b) {
    const poule = await getPool(db, b.poolId);
    if (await hasRequests(db, "pool = $1", [poule.nom]))
      throw new HttpError(409, "Impossible : des demandes existent pour cette poule.");
    await db.query(`DELETE FROM pool_entries WHERE pool_id = $1`, [poule.id]);
    await db.query(`DELETE FROM pools WHERE id = $1`, [poule.id]);
    return {};
  },

  // Ajout en masse de joueurs / équipes dans une poule (+ numéros facultatifs)
  async entry_add(db, b) {
    const poule = await getPool(db, b.poolId);
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
        await upsertContact(db, joueurs[i], tel);
        report.phones++;
      }
    }
    return report;
  },

  async entry_rename(db, b) {
    const poule = await getPool(db, b.poolId);
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
    const poule = await getPool(db, b.poolId);
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
    await upsertContact(db, name, tel);
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
