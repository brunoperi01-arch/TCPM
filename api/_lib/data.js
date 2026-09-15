// Données gérées depuis l'admin : joueurs des poules, créneaux, numéros.
// Serveur uniquement : les numéros ne sortent que vers l'admin protégé.
import { joueursDe } from "../../tournoi-interne/assets/config.js";

/** q = (texte SQL, paramètres) => lignes */
export const fromSql = (sql) => (t, p = []) => sql.query(t, p);
export const fromClient = (client) => async (t, p = []) => (await client.query(t, p)).rows;

export async function loadData(q) {
  const [entryRows, slots, contactRows] = await Promise.all([
    q(`SELECT pool_id, name FROM pool_entries ORDER BY pool_id, id`),
    q(`SELECT id::text AS id, to_char(slot_date, 'YYYY-MM-DD') AS date,
              to_char(slot_time, 'HH24:MI') AS time, capacity, active
       FROM tournament_slots ORDER BY slot_date, slot_time`),
    q(`SELECT name, phone FROM player_contacts ORDER BY name`),
  ]);
  const entries = {};
  for (const r of entryRows) (entries[r.pool_id] ||= []).push(r.name);
  const contacts = Object.fromEntries(contactRows.map((r) => [r.name, r.phone]));
  return { entries, slots, contacts };
}

/** Numéro d'une entrée (joueur, ou premier joueur connu d'une équipe mixte) */
export const contactOf = (contacts, entree) =>
  joueursDe(entree).map((n) => contacts[n]).find(Boolean) || null;

/** Noms d'entrées dont le numéro est connu (jamais les numéros eux-mêmes) */
export const entreesConnues = (data) =>
  [...new Set(Object.values(data.entries).flat())].filter((e) => contactOf(data.contacts, e));
