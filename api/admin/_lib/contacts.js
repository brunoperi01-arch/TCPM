// ============================================================
// ANNUAIRE DES NUMÉROS — SERVEUR UNIQUEMENT
// Ce fichier n'est jamais envoyé au navigateur.
// Les numéros ne sortent que vers la page admin (protégée).
// ✏️ Un joueur par ligne, nom écrit EXACTEMENT comme dans config.js.
// ============================================================
import { joueursDe, normPhone, TOUTES_ENTREES } from "../../tournoi-interne/assets/config.js";

const ANNUAIRE = {
  // "Bruno Peri": "06 12 34 56 78",
};

const CONTACTS = Object.fromEntries(
  Object.entries(ANNUAIRE)
    .map(([nom, tel]) => [nom.replace(/\s+/g, " ").trim(), normPhone(tel)])
    .filter(([, tel]) => tel)
);

/** Numéro d'une entrée (joueur, ou premier joueur connu d'une équipe mixte) */
export const contactOf = (entree) => joueursDe(entree).map((n) => CONTACTS[n]).find(Boolean) || null;

/** Liste des entrées dont le numéro est connu (renvoie des noms, jamais de numéros) */
export const entreesConnues = () => TOUTES_ENTREES.filter((e) => contactOf(e));
