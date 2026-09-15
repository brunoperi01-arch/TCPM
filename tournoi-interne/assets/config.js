// ============================================================
// TOURNOI INTERNE TCPM — Configuration
// Fichier PUBLIC : lu par la page joueur, la page admin et le serveur.
// ⚠️ Ne jamais mettre de numéros de téléphone ici
//    (ils vont dans api/_lib/contacts.js, côté serveur).
// ============================================================

export const FORM_URL = "https://tcpm.vercel.app/tournoi-interne/gestion.html";
export const JAT_PHONE = "33687726423"; // WhatsApp du juge-arbitre (bouton « Une question ? »)
export const SIGNATURE = "Bruno Peri, juge-arbitre du tournoi";
export const TERRAINS = ["Terrain 1", "Terrain 2", "Terrain 3", "Terrain 4", "Terrain 5", "Terrain 6"];
export const DEFAULT_CAPACITY = 6;
export const MOTIFS = ["Créneau indisponible", "Erreur de joueur", "Match déjà programmé", "Autre"];

// ------------------------------------------------------------
// ✏️ POULES
//   Hommes / Femmes : "Prénom Nom"
//   Double mixte    : "Prénom Nom / Prénom Nom"
//   ⚠️ Ne plus renommer une entrée une fois des demandes enregistrées.
//   ⚠️ Écrire un même joueur exactement pareil partout (simple et mixte).
// ------------------------------------------------------------
export const POULES = {
  hommes: {
    label: "Hommes",
    groupes: {
      hautes: {
        label: "Poules hautes",
        poules: {
          A: [],
          B: [],
          C: [],
        },
      },
      basses: {
        label: "Poules basses",
        poules: {
          A: [],
          B: [],
        },
      },
    },
  },
  femmes: {
    label: "Femmes",
    poules: {
      A: [],
      B: [],
      C: [],
    },
  },
  mixte: {
    label: "Double mixte",
    poules: {
      A: [],
      B: [],
    },
  },
};

// ------------------------------------------------------------
// ✏️ CRÉNEAUX ouverts aux demandes
//   date "AAAA-MM-JJ", heure "HH:MM", capacity = nb max de matchs confirmés
//   Les créneaux passés disparaissent automatiquement.
//   ⚠️ Ne pas supprimer un créneau qui a déjà des demandes.
// ------------------------------------------------------------
export const CRENEAUX = [
  // { date: "2026-09-16", time: "18:00", capacity: 2 },
  // { date: "2026-09-16", time: "19:30", capacity: 3 },
];

// ============================================================
// Ne pas modifier en dessous
// ============================================================
const NOMS = {
  "hommes.hautes": (l) => `Poule Haute ${l}`,
  "hommes.basses": (l) => `Poule Basse ${l}`,
  femmes: (l) => `Poule Filles ${l}`,
  mixte: (l) => `Poule Mixte ${l}`,
};

export const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const joueursDe = (entree) => clean(entree).split("/").map(clean).filter(Boolean);
export const prenom = (entree) => joueursDe(entree)[0]?.split(" ")[0] ?? "";

export const LISTE_POULES = Object.entries(POULES).flatMap(([cat, def]) => {
  const blocs = def.groupes
    ? Object.entries(def.groupes).map(([g, gd]) => [`${cat}.${g}`, g, gd.poules])
    : [[cat, null, def.poules]];
  return blocs.flatMap(([cle, groupe, poules]) =>
    Object.entries(poules).map(([lettre, entrees]) => ({
      id: `${cle}.${lettre}`,
      categorie: cat,
      groupe,
      lettre,
      nom: NOMS[cle](lettre),
      entrees: entrees.map(clean),
    }))
  );
});

export const getPoule = (id) => LISTE_POULES.find((p) => p.id === id) || null;
export const estOuverte = (poule) => poule.entrees.length >= 2;
export const TOUTES_ENTREES = [...new Set(LISTE_POULES.flatMap((p) => p.entrees))];

export const findCreneau = (date, time) => CRENEAUX.find((c) => c.date === date && c.time === time) || null;
export const capOf = (date, time) => findCreneau(date, time)?.capacity ?? DEFAULT_CAPACITY;

/** "AAAA-MM-JJ HH:MM" à l'heure de Paris (identique sur le serveur et le téléphone) */
export function nowParis() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}
export const estAVenir = (c) => `${c.date} ${c.time}` > nowParis();

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

/**
 * État d'un créneau pour un match donné, à partir des demandes existantes.
 * → { type: "full" | "conflict" | "ok", left }
 */
export function slotState(requests, c, a, b) {
  const onSlot = requests.filter((r) => isActive(r) && r.date === c.date && r.time === c.time);
  const left = (c.capacity ?? DEFAULT_CAPACITY) - onSlot.filter((r) => r.status === "confirmed").length;
  if (left <= 0) return { type: "full", left: 0 };
  const busy = new Set(onSlot.flatMap((r) => [...joueursDe(r.player), ...joueursDe(r.opponent)]));
  if ([...joueursDe(a), ...joueursDe(b)].some((n) => busy.has(n))) return { type: "conflict", left };
  return { type: "ok", left };
}

/** Contrôle de cohérence (lancé par l'admin) */
export function verifierConfig() {
  const erreurs = [];
  for (const p of LISTE_POULES) {
    const vus = new Set();
    for (const e of p.entrees) {
      if (vus.has(e)) erreurs.push(`${p.nom} : « ${e} » en double`);
      vus.add(e);
      if (p.categorie === "mixte" && joueursDe(e).length !== 2)
        erreurs.push(`${p.nom} : « ${e} » doit être « Joueur / Joueuse »`);
      if (p.categorie !== "mixte" && e.includes("/"))
        erreurs.push(`${p.nom} : « ${e} » ne doit pas contenir de « / »`);
    }
  }
  const vusC = new Set();
  for (const c of CRENEAUX) {
    const k = `${c.date} ${c.time}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !/^\d{2}:\d{2}$/.test(c.time)) erreurs.push(`Créneau mal écrit : ${k}`);
    if (vusC.has(k)) erreurs.push(`Créneau en double : ${k}`);
    vusC.add(k);
    if (c.capacity != null && !(c.capacity >= 1 && c.capacity <= TERRAINS.length))
      erreurs.push(`Capacité invalide pour ${k} (1 à ${TERRAINS.length})`);
  }
  return erreurs;
}
