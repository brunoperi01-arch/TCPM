// Données gérées depuis l'admin : joueurs des poules, créneaux, numéros.
// Serveur uniquement : les numéros ne sortent que vers l'admin protégé.
import { joueursDe, sortPools, pairKey, resolveFixtures } from "../../tournoi-interne/assets/config.js";

/** q = (texte SQL, paramètres) => lignes */
export const fromSql = (sql) => (t, p = []) => sql.query(t, p);
export const fromClient = (client) => async (t, p = []) => (await client.query(t, p)).rows;

export async function loadData(q) {
  const [poolRows, entryRows, slots, contactRows, fixtures] = await Promise.all([
    q(`SELECT id, category, level, number, nom FROM pools`),
    q(`SELECT pool_id, name FROM pool_entries ORDER BY pool_id, id`),
    q(`SELECT id::text AS id, to_char(slot_date, 'YYYY-MM-DD') AS date,
              to_char(slot_time, 'HH24:MI') AS time, capacity, duration_min AS duration, active
       FROM tournament_slots ORDER BY slot_date, slot_time`),
    q(`SELECT name, phone FROM player_contacts ORDER BY name`),
    q(`SELECT id::text AS id, pool_id, round, entry1, entry2, src1::text AS src1, src2::text AS src2 FROM fixtures ORDER BY pool_id, round, id`),
  ]);
  const entries = {};
  for (const r of entryRows) (entries[r.pool_id] ||= []).push(r.name);
  const contacts = Object.fromEntries(contactRows.map((r) => [r.name, r.phone]));
  const pools = sortPools(poolRows.map((r) => ({ ...r, number: Number(r.number) })));
  return { pools, entries, slots, contacts, fixtures: fixtures.map((f) => ({ ...f, round: Number(f.round) })) };
}

/** Numéro d'une entrée (joueur, ou premier joueur connu d'une équipe mixte) */
export const contactOf = (contacts, entree) =>
  joueursDe(entree).map((n) => contacts[n]).find(Boolean) || null;

/** Noms d'entrées dont le numéro est connu (jamais les numéros eux-mêmes) */
export const entreesConnues = (data) =>
  [...new Set(Object.values(data.entries).flat())].filter((e) => contactOf(data.contacts, e));

export const findPool = (data, id) => data.pools.find((p) => p.id === id) || null;

/** Rencontres programmées d'une poule (vide = tout le monde peut jouer contre tout le monde) */
export const fixturesOf = (data, poolId) => data.fixtures.filter((f) => f.pool_id === poolId);
/** L'affiche existe-t-elle, une fois les vainqueurs reportés ? (ordre indifférent) */
export const fixtureExists = (data, requests, poolId, a, b) =>
  resolveFixtures(fixturesOf(data, poolId), requests, data.pools)
    .some((f) => f.e1 && f.e2 && pairKey(f.e1, f.e2) === pairKey(a, b));
