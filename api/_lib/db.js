// Connexion Neon — serveur uniquement. DATABASE_URL est ajoutée par l'intégration Vercel ↔ Neon.
import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// Nom de variable selon la façon dont Neon a été relié à Vercel
const DB_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.STORAGE_DATABASE_URL ||
  process.env.STORAGE_URL ||
  process.env.NEON_DATABASE_URL;
if (!DB_URL) console.error("Aucune URL de base Neon trouvée dans les variables d'environnement.");

export const sql = neon(DB_URL);

/** Transaction interactive (verrou + contrôles + écriture en une seule fois) */
export async function withTx(fn) {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/** Colonnes renvoyées au navigateur (dates au format texte, sans décalage horaire) */
export const PUBLIC_COLS = `id, category, pool, player, opponent,
  to_char(requested_date, 'YYYY-MM-DD') AS date,
  to_char(requested_time, 'HH24:MI') AS time,
  status, court, refusal_reason AS reason`;

export const ADMIN_COLS = `${PUBLIC_COLS}, phone1, phone2,
  notified1_at IS NOT NULL AS notified1,
  notified2_at IS NOT NULL AS notified2,
  created_at, decided_at`;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function sendError(res, err) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur. Réessayez dans un instant." });
}

/** Lecture du corps JSON quel que soit le parsing fait par Vercel */
export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}
