// ============================================================
// TOURNOI INTERNE TCPM — Configuration fixe
// Fichier PUBLIC (page joueur, page admin, serveur).
// Les joueurs, créneaux et numéros se gèrent dans l'admin (base Neon).
// ============================================================

export const FORM_URL = "https://tcpm.vercel.app/tournoi-interne/gestion.html";
export const JAT_PHONE = "33687726423"; // WhatsApp du juge-arbitre (bouton « Une question ? »)
export const SIGNATURE = "Bruno, juge-arbitre du tournoi";
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

/* ---------- Scores (2 sets gagnants, super tie-break au 3e) ---------- */
export const RESULT_TYPES = { normal: "Score normal", wo: "WO", retired: "Abandon" };
const setNormal = ([a, b]) => {
  const max = Math.max(a, b), min = Math.min(a, b);
  return a !== b && ((max === 6 && min <= 4) || (max === 7 && (min === 5 || min === 6)));
};
const setSuper = ([a, b]) => {
  const max = Math.max(a, b), min = Math.min(a, b);
  return max >= 10 && max <= 30 && max - min >= 2;
};
const gagnant = ([a, b]) => (a > b ? 1 : 2);

/**
 * Vérifie un score et calcule le vainqueur.
 * sets   : [[6,4],[3,6],[10,8]] — côté 1 = player, côté 2 = opponent
 * type   : "normal" | "wo" | "retired"
 * winner : 1 ou 2, obligatoire pour WO et abandon
 * → { winner } ou { error }
 */
export function analyseScore(sets, type = "normal", winner = null) {
  const jeux = (Array.isArray(sets) ? sets : [])
    .map((s) => [Number(s?.[0]), Number(s?.[1])])
    .filter((s) => Number.isInteger(s[0]) && Number.isInteger(s[1]) && s[0] >= 0 && s[1] >= 0);

  if (type === "wo") {
    if (winner !== 1 && winner !== 2) return { error: "Indiquez le vainqueur du WO." };
    return { winner, sets: [] };
  }
  if (type === "retired") {
    if (winner !== 1 && winner !== 2) return { error: "Indiquez qui a gagné après l'abandon." };
    if (jeux.some(([a, b]) => a > 7 || b > 7)) return { error: "Jeux impossibles (0 à 7)." };
    return { winner, sets: jeux };
  }
  if (jeux.length < 2) return { error: "Saisissez au moins deux sets." };
  if (jeux.length > 3) return { error: "Trois sets maximum." };
  if (!setNormal(jeux[0]) || !setNormal(jeux[1]))
    return { error: "Set invalide : 6/0 à 6/4, 7/5 ou 7/6." };
  const g1 = gagnant(jeux[0]), g2 = gagnant(jeux[1]);
  if (g1 === g2) {
    if (jeux.length === 3) return { error: "Match déjà gagné en deux sets : supprimez le 3e." };
    return { winner: g1, sets: jeux };
  }
  if (jeux.length !== 3) return { error: "Un set partout : saisissez le super tie-break." };
  if (!setSuper(jeux[2])) return { error: "Super tie-break : 10 points minimum, 2 d'écart." };
  return { winner: gagnant(jeux[2]), sets: jeux };
}

export const fmtScore = (sets, type) => {
  const base = (sets || []).map(([a, b]) => `${a}/${b}`).join(" ");
  if (type === "wo") return "WO";
  if (type === "retired") return base ? `${base} ab.` : "Abandon";
  return base;
};

/* ---------- Tableau à élimination ---------- */
/**
 * Résout les rencontres : un côté peut être une équipe, ou le vainqueur d'une autre rencontre.
 * Renvoie chaque rencontre avec e1, e2 (noms résolus ou null), leurs libellés, et son vainqueur.
 */
export function resolveFixtures(fixtures, requests, pools) {
  const nomOf = (id) => pools.find((p) => p.id === id)?.nom;
  const byId = new Map(fixtures.map((f) => [String(f.id), f]));
  const memo = new Map();

  const cote = (f, n, d) => {
    const direct = n === 1 ? f.entry1 : f.entry2;
    if (direct) return direct;
    const src = n === 1 ? f.src1 : f.src2;
    return src ? vainqueur(byId.get(String(src)), d + 1) : null;
  };
  function vainqueur(f, d = 0) {
    if (!f || d > 12) return null;
    const k = String(f.id);
    if (memo.has(k)) return memo.get(k);
    memo.set(k, null); // garde anti-boucle
    const a = cote(f, 1, d), b = cote(f, 2, d);
    let w = null;
    if (a && !b && !f.src2) w = a; // exempt : qualifié d'office
    else if (a && b) {
      const r = requests.find((x) => x.pool === nomOf(f.pool_id) && x.validated &&
        pairKey(x.player, x.opponent) === pairKey(a, b));
      if (r) w = r.winner_side === 1 ? r.player : r.opponent;
    }
    memo.set(k, w);
    return w;
  }
  const libelleCote = (f, n, d = 0) => {
    const nom = cote(f, n, d);
    if (nom) return nom;
    const src = n === 1 ? f.src1 : f.src2;
    const sf = src && byId.get(String(src));
    if (!sf || d > 6) return null;
    return `Vainqueur de ${libelleCote(sf, 1, d + 1) || "?"} – ${libelleCote(sf, 2, d + 1) || "?"}`;
  };

  return fixtures.map((f) => ({
    ...f,
    e1: cote(f, 1, 0), e2: cote(f, 2, 0),
    l1: libelleCote(f, 1), l2: libelleCote(f, 2),
    exempt: !!(cote(f, 1, 0) && !f.entry2 && !f.src2),
    winner: vainqueur(f, 0),
    pret: !!(cote(f, 1, 0) && cote(f, 2, 0)),
  }));
}
export const libelleFixture = (f) => f.exempt ? `${f.l1} (exempt)` : `${f.l1 || "?"} – ${f.l2 || "?"}`;
