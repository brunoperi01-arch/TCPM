// Accès admin : identifiant / mot de passe dans les variables d'environnement Vercel
// ADMIN_USER et ADMIN_PASSWORD. Sans ces variables, l'accès est refusé.
import { timingSafeEqual } from "node:crypto";

function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b) return false;
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function isAdmin(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const decoded = Buffer.from(h.slice(6), "base64").toString("utf8");
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  return same(decoded.slice(0, i), process.env.ADMIN_USER) &&
         same(decoded.slice(i + 1), process.env.ADMIN_PASSWORD);
}

/** À appeler en tête de chaque route admin. Renvoie false si la réponse 401 a été envoyée. */
export function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.setHeader("WWW-Authenticate", 'Basic realm="Tournoi interne TCPM", charset="UTF-8"');
  res.status(401).json({ error: "Accès réservé au juge-arbitre." });
  return false;
}
