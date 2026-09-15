// Protection de la page juge-arbitre (Vercel Routing Middleware).
// Les routes API admin sont AUSSI protégées dans chaque fonction (api/_lib/auth.js).
import { next } from "@vercel/functions";

export const config = {
  matcher: ["/tournoi-interne/admin", "/tournoi-interne/admin/:path*"],
};

function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function middleware(request) {
  const h = request.headers.get("authorization") || "";
  if (h.startsWith("Basic ")) {
    try {
      const bytes = Uint8Array.from(atob(h.slice(6)), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      const i = decoded.indexOf(":");
      if (i > 0 && same(decoded.slice(0, i), process.env.ADMIN_USER) &&
          same(decoded.slice(i + 1), process.env.ADMIN_PASSWORD)) {
        return next({ headers: { "X-Robots-Tag": "noindex, nofollow" } });
      }
    } catch { /* en-tête invalide → refus */ }
  }
  return new Response("Accès réservé au juge-arbitre.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Tournoi interne TCPM", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
