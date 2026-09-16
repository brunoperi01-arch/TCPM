// ============================================================
// TOURNOI INTERNE TCPM — Configuration fixe
// Fichier PUBLIC (page joueur, page admin, serveur).
// Les joueurs, créneaux et numéros se gèrent dans l'admin (base Neon).
// ============================================================

export const FORM_URL = "https://tcpm.vercel.app/tournoi-interne/gestion.html";
export const JAT_PHONE = "33687726423"; // WhatsApp du juge-arbitre (bouton « Une question ? »)
export const SIGNATURE = "Bruno Peri, juge-arbitre du tournoi";
export const TERRAINS = ["Terrain 1", "Terrain 2", "Terrain 3", "Terrain 4", "Terrain 5", "Terrain 6"];
export const MOTIFS = ["Créneau indisponible", "Erreur de joueur", "Match déjà programmé", "Autre"];

// Catégories et niveaux. Les poules elles-mêmes sont créées par l'import MOJA (base Neon).
export const CATEGORIES = { hommes: "Hommes", femmes: "Femmes", mixte: "Double mixte" };
export const LEVELS = {
  elite:   { label: "Poules élite",  court: "Poule élite",  ordre: 1 },
  haute:   { label: "Poules hautes", court: "Poule haute",  ordre: 2 },
  basse:   { label: "Poules basses", court: "Poule basse",  ordre: 3 },
  tableau: { label: "Tableau",       court: "Tableau",      ordre: 4 },
};

const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** "Simple Messieurs Senior" → "hommes" (ou null) */
export function categoryFromText(txt) {
  const t = sansAccent(txt);
  if (/mixte/.test(t)) return "mixte";
  if (/messieurs|hommes/.test(t)) return "hommes";
  if (/dames|femmes|filles/.test(t)) return "femmes";
  return null;
}
/** "Poules elites" → "elite" */
export function levelFromText(txt) {
  const t = sansAccent(txt);
  if (/elite/.test(t)) return "elite";
  if (/haut/.test(t)) return "haute";
  if (/bas/.test(t)) return "basse";
  if (/tableau/.test(t)) return "tableau";
  return t.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "autre";
}
export const levelInfo = (level) => LEVELS[level] || { label: level, court: level, ordre: 9 };
export const poolId = (cat, level, n) => `${cat}.${level}.${n}`;
export const poolNom = (cat, level, n) =>
  level === "tableau" ? `${CATEGORIES[cat]} Tableau` : `${CATEGORIES[cat]} ${levelInfo(level).court} ${n}`;
export const sortPools = (pools) => [...pools].sort((a, b) =>
  Object.keys(CATEGORIES).indexOf(a.category) - Object.keys(CATEGORIES).indexOf(b.category) ||
  levelInfo(a.level).ordre - levelInfo(b.level).ordre || a.number - b.number);

/* ---------- Noms ---------- */
export const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const joueursDe = (entree) => clean(entree).split("/").map(clean).filter(Boolean);
export const prenom = (entree) => joueursDe(entree)[0]?.split(" ")[0] ?? "";

/** Met en forme un nom saisi ("  bruno   PERI/sophie rossi " → "bruno PERI / sophie rossi") */
export const formatEntree = (s) => joueursDe(s).join(" / ");

/** Vérifie un nom pour une catégorie. Renvoie un message d'erreur ou null. */
export function erreurEntree(categorie, nom) {
  const parts = joueursDe(nom);
  if (!parts.length) return "Nom vide.";
  if (nom.length > 80) return "Nom trop long.";
  if (/[<>"]/.test(nom)) return "Caractères interdits.";
  if (categorie === "mixte" && parts.length !== 2) return "Écrire « Joueur / Joueuse ».";
  if (categorie !== "mixte" && parts.length !== 1) return "Un seul joueur (pas de « / »).";
  return null;
}

/* ---------- Dates ---------- */
/** "AAAA-MM-JJ HH:MM" à l'heure de Paris (identique sur le serveur et le téléphone) */
export function nowParis() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}
export const estAVenir = (c) => `${c.date} ${c.time}` > nowParis();

/* ---------- Durées ---------- */
export const DEFAULT_DURATION = 120;
export const DURATIONS = [60, 90, 120, 150, 180];
export const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
export const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export const finCreneau = (time, duration = DEFAULT_DURATION) => fromMin(toMin(time) + Number(duration || DEFAULT_DURATION));
export const fmtDuree = (min) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}`;
/** Deux créneaux du même jour se chevauchent-ils ? */
export const chevauche = (a, b) => a.date === b.date &&
  toMin(a.time) < toMin(b.time) + (b.duration || DEFAULT_DURATION) &&
  toMin(b.time) < toMin(a.time) + (a.duration || DEFAULT_DURATION);

/** Dates "AAAA-MM-JJ" entre deux bornes, filtrées par jours (0 = dimanche … 6 = samedi) */
export function joursEntre(from, to, jours) {
  const out = [];
  const [y1, m1, d1] = from.split("-").map(Number), [y2, m2, d2] = to.split("-").map(Number);
  const end = Date.UTC(y2, m2 - 1, d2);
  for (let t = Date.UTC(y1, m1 - 1, d1), n = 0; t <= end && n < 400; t += 86400000, n++) {
    const d = new Date(t);
    if (jours.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
/** Heures de début d'une série : de `debut` jusqu'à `fin` (fin du dernier match), pas = durée */
export function heuresSerie(debut, fin, duration) {
  const out = [];
  for (let m = toMin(debut); m + duration <= toMin(fin); m += duration) out.push(fromMin(m));
  return out;
}
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/* ---------- Demandes ---------- */
export const isActive = (r) => r.status === "pending" || r.status === "confirmed";
export const pairKey = (a, b) => [clean(a), clean(b)].sort().join("|");

/** Téléphone mobile FR → "336XXXXXXXX" (ou null) */
export function normPhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("0033")) d = d.slice(2);
  if (d.startsWith("0")) d = "33" + d.slice(1);
  return /^33[67]\d{8}$/.test(d) ? d : null;
}
export const fmtPhone = (p) => (p ? ("0" + p.slice(2)).replace(/(\d{2})(?=\d)/g, "$1 ") : "—");

/** État d'un créneau pour un match : { type: "full" | "conflict" | "ok", left } */
export function slotState(requests, c, a, b) {
  const onSlot = requests.filter((r) => isActive(r) && r.date === c.date && r.time === c.time);
  const left = c.capacity - onSlot.filter((r) => r.status === "confirmed").length;
  if (left <= 0) return { type: "full", left: 0 };
  const busy = new Set(onSlot.flatMap((r) => [...joueursDe(r.player), ...joueursDe(r.opponent)]));
  if ([...joueursDe(a), ...joueursDe(b)].some((n) => busy.has(n))) return { type: "conflict", left };
  return { type: "ok", left };
}
