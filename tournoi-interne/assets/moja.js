// ============================================================
// Import MOJA — lecture des fichiers Excel exportés
//   • « Tableau.xlsx »            : composition des poules / tableaux
//   • « Liste des joueurs.xlsx »  : noms complets + téléphones (facultatif)
// Tout est lu dans le navigateur : licences, e-mails, adresses
// ne sont jamais envoyés au serveur.
// ============================================================
import { levelFromText, categoryFromText, poolNom, poolId, normPhone, sortPools } from "./config.js";

/* ---------- Lecture d'un .xlsx (zip + XML) ---------- */
async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buffer) {
  const u8 = new Uint8Array(buffer), dv = new DataView(buffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Ce fichier n'est pas un Excel (.xlsx) valide.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), comLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = u8.subarray(start, start + size);
    if (name.endsWith(".xml")) files[name] = dec.decode(method === 8 ? await inflate(data) : data);
    p += 46 + nameLen + extraLen + comLen;
  }
  return files;
}

const unxml = (s) => s
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, "&");

const colIndex = (ref) => {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/** Renvoie la liste des feuilles, chacune = tableau de lignes (tableaux de textes) */
export async function readXlsx(file) {
  const files = await unzip(await file.arrayBuffer());
  const shared = [];
  const ss = files["xl/sharedStrings.xml"] || "";
  for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unxml(t[1])).join(""));
  }
  const sheetNames = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  return sheetNames.map((name) => {
    const rows = [];
    for (const rm of files[name].matchAll(/<row\b[^>]*?(?:\br="(\d+)")?[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1], inner = cm[2] || "";
        const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
        const type = (attrs.match(/\bt="(\w+)"/) || [])[1];
        let val = "";
        if (type === "s") val = shared[+((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1])] ?? "";
        else if (type === "inlineStr") val = unxml((inner.match(/<is>([\s\S]*?)<\/is>/) || [, ""])[1]);
        else val = unxml((inner.match(/<v>([\s\S]*?)<\/v>/) || [, ""])[1]);
        row[ref ? colIndex(ref) : row.length] = val;
      }
      rows[rm[1] ? +rm[1] - 1 : rows.length] = row;
    }
    return Array.from(rows, (r) => Array.from(r || [], (v) => (v ?? "").toString()));
  });
}

/* ---------- Noms ---------- */
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const isUpperWord = (w) => /\p{L}/u.test(w) && w === w.toUpperCase() && !/^\p{L}\.?$/u.test(w);

const capWord = (w) => w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (m, sep, l) => sep + l.toUpperCase());
function nomPropre(nom) {
  return nom.split(" ").filter(Boolean).map((w, i) => {
    const low = w.toLowerCase();
    if (i > 0 && ["de", "du", "des"].includes(low)) return low;
    if (/^d['’]/i.test(w)) return "d'" + capWord(w.slice(2));
    return capWord(w);
  }).join(" ");
}
const prenomPropre = (p) => p.split(" ").filter(Boolean).map(capWord).join(" ");

/** "ROSSI Jean marc" → { nom: "ROSSI", prenom: "Jean marc" } */
export function splitMoja(raw) {
  const words = String(raw || "").replace(/\s+/g, " ").trim().split(" ");
  let i = 0;
  while (i < words.length - 1 && isUpperWord(words[i])) i++;
  if (i === 0) i = 1;
  return { nom: words.slice(0, i).join(" "), prenom: words.slice(i).join(" ") };
}
/** Nom affiché dans l'appli : « Prénom Nom » */
export const affichage = (nom, prenom) => `${prenomPropre(prenom)} ${nomPropre(nom)}`.trim();

/* ---------- Liste des joueurs ---------- */
export function parseListe(sheets) {
  const rows = sheets[0] || [];
  const head = (rows[0] || []).map(norm);
  const col = (label) => head.indexOf(norm(label));
  const iNom = col("Nom"), iPre = col("Prénom"), iEp = col("Epreuve"), iTel = col("Téléphone portable");
  if (iNom < 0 || iPre < 0) throw new Error("Liste des joueurs : colonnes « Nom » et « Prénom » introuvables.");
  const joueurs = [];
  for (const r of rows.slice(1)) {
    if (!r || !r[iNom]) continue;
    joueurs.push({
      nom: r[iNom].trim(), prenom: (r[iPre] || "").trim(),
      categorie: categoryFromText(r[iEp] || ""),
      tel: normPhone(r[iTel]),
    });
  }
  return joueurs;
}

/* ---------- Tableau (poules + tableau mixte) ---------- */
const IGNORE = /^(null null|joueur non d[ée]termin[ée]|joueur|bye|exempt)$/i;

export function parseTableau(sheets) {
  const blocs = [];
  for (const rows of sheets) {
    let cur = null;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const a = (r[0] || "").trim();
      const cat = categoryFromText(a);
      if (cat && !r.slice(1).some((v) => v && v.trim())) {
        // En-tête de bloc : catégorie, puis ligne « niveau | … | Poule N » ou « Nom (Tableau principal_x) »
        const next = rows[i + 1] || [];
        const titre = (next[0] || "").trim();
        const pouleMatch = (next[2] || "").match(/poule\s*(\d+)/i);
        cur = { cat, titre, poule: pouleMatch ? +pouleMatch[1] : null, noms: [], equipes: [] };
        blocs.push(cur);
        i++;
        continue;
      }
      if (!cur) continue;
      // Poules : colonne « Joueur » du classement
      if (cur.poule && r[7] && !/^joueur$/i.test(r[7].trim())) {
        const n = r[7].trim();
        if (n && !IGNORE.test(n)) cur.noms.push(n);
      }
      // Tableau : cellules « NOM X / NOM Y » (hors lignes de clubs)
      if (!cur.poule) {
        for (const v of r) {
          const t = (v || "").trim();
          if (t.includes(" / ") && !/club|tennis|\btc\b|\basptt\b/i.test(t)) cur.equipes.push(t);
        }
      }
    }
  }
  return blocs;
}

/* ---------- Assemblage ---------- */
function resoudreInitiale(joueurs, cat, nom, initiale, dejaPris) {
  const cands = joueurs.filter((j) => norm(j.nom) === norm(nom) && norm(j.prenom).startsWith(norm(initiale)));
  const uniques = [...new Map(cands.map((j) => [norm(j.prenom), j])).values()];
  const preferes = uniques.filter((j) => j.categorie === cat);
  const pool = (preferes.length ? preferes : uniques).filter((j) => !dejaPris.has(norm(j.prenom) + norm(j.nom)));
  return pool.length === 1 ? pool[0] : pool.length > 1 ? { ambigu: pool } : null;
}

/**
 * Construit l'aperçu d'import.
 * → { pools: [{ id, category, level, number, nom, entries }], contacts: { nom: tel }, warnings: [] }
 */
export function construireImport(blocs, joueurs = []) {
  const warnings = [];
  const pools = [];
  const contacts = {};
  const telDe = (nom, prenom) =>
    joueurs.find((j) => norm(j.nom) === norm(nom) && norm(j.prenom) === norm(prenom) && j.tel)?.tel;

  for (const b of blocs) {
    if (b.poule) {
      const level = levelFromText(b.titre);
      const entries = [];
      for (const raw of b.noms) {
        const { nom, prenom } = splitMoja(raw);
        const name = affichage(nom, prenom);
        if (!entries.includes(name)) entries.push(name);
        const tel = telDe(nom, prenom);
        if (tel) contacts[name] = tel;
      }
      if (entries.length) pools.push({ category: b.cat, level, number: b.poule, entries });
    } else if (b.equipes.length && /principal/i.test(b.titre)) {
      const entries = [];
      for (const raw of [...new Set(b.equipes)]) {
        const pris = new Set();
        const membres = raw.split(" / ").map((part) => {
          const words = part.trim().split(" ");
          const initiale = /^\p{L}\.?$/u.test(words.at(-1)) ? words.pop().replace(".", "") : "";
          const nom = words.join(" ");
          if (!initiale) { const s = splitMoja(part); return affichage(s.nom, s.prenom); }
          const j = resoudreInitiale(joueurs, b.cat, nom, initiale, pris);
          if (j && !j.ambigu) {
            pris.add(norm(j.prenom) + norm(j.nom));
            const name = affichage(j.nom, j.prenom);
            if (j.tel) contacts[name] = j.tel;
            return name;
          }
          if (j?.ambigu) {
            // Même nom + même initiale (ex. COGNO J / COGNO J) : on répartit entre les candidats restants
            const c = j.ambigu[0];
            pris.add(norm(c.prenom) + norm(c.nom));
            const name = affichage(c.nom, c.prenom);
            if (c.tel) contacts[name] = c.tel;
            return name;
          }
          warnings.push(`Mixte : prénom introuvable pour « ${part.trim()} » (ajoutez la liste des joueurs ou corrigez après import).`);
          return affichage(nom, initiale + ".");
        });
        const team = membres.join(" / ");
        if (!entries.includes(team)) entries.push(team);
      }
      pools.push({ category: b.cat, level: "tableau", number: 1, entries });
    }
  }

  for (const p of pools) {
    p.id = poolId(p.category, p.level, p.number);
    p.nom = poolNom(p.category, p.level, p.number);
  }
  if (!pools.length) warnings.push("Aucune poule trouvée dans ce fichier. Vérifiez qu'il s'agit bien de l'export « Tableau » de MOJA.");
  return { pools: sortPools(pools), contacts, warnings };
}
