// Page joueur : demande de créneau
import {
  CATEGORIES, JAT_PHONE, FORM_URL, levelInfo, estAVenir, isActive, pairKey, slotState, normPhone,
  finCreneau, prenom, analyseScore, fmtScore, nowParis,
} from "./config.js";
import { esc, btnData, fmtDay, fmtShort, fmtTime, header, matchCard, api, onAction } from "./ui.js";

const app = document.getElementById("app");
const fresh = () => ({ step: "cat", hist: [], cat: null, groupe: null, poule: null, player: null, opp: null,
  slot: null, err: null, last: null, phone1: "", phone2: "", sending: false,
  score: null, sets: [["", ""], ["", ""], ["", ""]], scoreType: "normal", scoreWinner: null, scoreDone: null });
let S = fresh();
let DATA = { requests: [], known: [], pools: [], entries: {}, creneaux: [] };
const entreesDe = (id) => DATA.entries[id] || [];
const getPoule = (id) => DATA.pools.find((p) => p.id === id);
const poolsOf = (cat, level) => DATA.pools.filter((p) => p.category === cat && (!level || p.level === level));
const levelsOf = (cat) => [...new Set(poolsOf(cat).map((p) => p.level))];
const ouverte = (p) => entreesDe(p.id).length >= 2;
const termine = (r) => `${r.date} ${finDe(r.date, r.time)}` <= nowParis();
const finDe = (date, time) => finCreneau(time, DATA.creneaux.find((c) => c.date === date && c.time === time)?.duration);
let loaded = false, loadError = null;

async function load() {
  try { DATA = await api("/api/tournoi/state"); loadError = null; }
  catch (e) { loadError = e.message; }
  loaded = true;
  render();
}

const known = (entry) => DATA.known.includes(entry);
const findMatch = (pool, a, b) =>
  DATA.requests.find((r) => isActive(r) && r.pool === pool && pairKey(r.player, r.opponent) === pairKey(a, b));
const lastClosed = (pool, a, b) =>
  DATA.requests.filter((r) => !isActive(r) && r.pool === pool && pairKey(r.player, r.opponent) === pairKey(a, b)).pop();
const flow = () => [
  "cat",
  ...(S.cat && levelsOf(S.cat).length > 1 ? ["groupe"] : []),
  ...(S.cat && S.groupe && (poolsOf(S.cat, S.groupe).length > 1 || !ouverte(poolsOf(S.cat, S.groupe)[0])) ? ["poule"] : []),
  "player", "opp", "slot", "recap",
];

/** Choix de catégorie / niveau : passe automatiquement les étapes sans alternative */
function suite() {
  const levels = levelsOf(S.cat);
  if (!S.groupe) {
    if (levels.length > 1) return go("groupe");
    S.groupe = levels[0];
  }
  const pools = poolsOf(S.cat, S.groupe);
  if (pools.length > 1 || !ouverte(pools[0])) return go("poule");
  S.poule = pools[0].id;
  return go("player");
}

function go(step) {
  S.hist.push(S.step); S.step = step; S.err = null; render(); window.scrollTo(0, 0);
  if (step === "opp" || step === "slot") load(); // données fraîches aux étapes sensibles
}
function back() { S.step = S.hist.pop() || "cat"; S.err = null; render(); }

/* ---------- Écrans ---------- */
function vCat() {
  const cats = Object.entries(CATEGORIES).filter(([k]) => poolsOf(k).length);
  if (!cats.length) return `<div class="empty">Les poules ne sont pas encore publiées. Revenez bientôt 🎾</div>`;
  return `<p class="q">Choisissez votre catégorie</p><p class="sub">Demande de créneau pour votre match</p>` +
    cats.map(([k, label]) => {
      const levels = levelsOf(k);
      const info = levels.length > 1 ? levels.map((l) => levelInfo(l).label).join(", ")
        : levels[0] === "tableau" ? "Tableau" : `${poolsOf(k).length} poule${poolsOf(k).length > 1 ? "s" : ""}`;
      return `<button class="big" ${btnData("cat", k)}><span>${label}<small>${info}</small></span><span class="chev">›</span></button>`;
    }).join("");
}
function vGroupe() {
  return `<p class="q">Choisissez votre niveau</p><p class="sub">${CATEGORIES[S.cat]}</p>` +
    levelsOf(S.cat).map((l) => {
      const n = poolsOf(S.cat, l).length;
      return `<button class="big" ${btnData("groupe", l)}><span>${levelInfo(l).label}<small>${n} poule${n > 1 ? "s" : ""}</small></span><span class="chev">›</span></button>`;
    }).join("");
}
function vPoule() {
  const unite = S.cat === "mixte" ? "équipes" : "joueurs";
  return `<p class="q">Choisissez votre poule</p><p class="sub">${CATEGORIES[S.cat]}, ${levelInfo(S.groupe).label.toLowerCase()}</p>` +
    poolsOf(S.cat, S.groupe).map((p) => {
      const n = entreesDe(p.id).length, open = ouverte(p);
      return `<button class="big letter" ${open ? "" : "disabled"} ${btnData("poule", p.id)}>
        <span class="l">${p.number}</span>
        <span class="grow">${esc(p.nom)}<small>${open ? `${n} ${unite}` : "Composition à venir"}</small></span>
        ${open ? '<span class="chev">›</span>' : ""}</button>`;
    }).join("");
}
function vPlayer() {
  const p = getPoule(S.poule);
  return `<p class="q">${S.cat === "mixte" ? "Quelle est votre équipe ?" : "Qui êtes-vous ?"}</p><p class="sub">${p.nom}</p>` +
    entreesDe(p.id).map((e) => `<button class="big" ${btnData("player", e)}><span>${esc(e)}</span><span class="chev">›</span></button>`).join("");
}
function vOpp() {
  const p = getPoule(S.poule);
  let dispo = 0;
  const rows = entreesDe(p.id).filter((e) => e !== S.player).map((e) => {
    const r = findMatch(p.nom, S.player, e);
    let badge, small = "", dis = true;
    if (r && r.status === "confirmed") {
      const quand = `${fmtShort(r.date)}, ${fmtTime(r.time)} – ${fmtTime(finDe(r.date, r.time))}`;
      if (r.validated) {
        badge = `<span class="badge b-ok">✅ ${esc(fmtScore(r.score, r.result_type))}</span>`;
        small = `${quand} · résultat validé`;
      } else if (r.scored) {
        badge = `<span class="badge b-wait">Score envoyé</span>`;
        small = `${esc(fmtScore(r.score, r.result_type))} · en attente du club`;
      } else if (termine(r)) {
        badge = `<span class="badge b-score">🏆 Score à saisir</span>`;
        small = `${quand}, ${esc(r.court)}`;
        return `<button class="big" ${btnData("score", e)}><span class="grow">${esc(e)}<small>${small}</small></span>${badge}</button>`;
      } else {
        badge = `<span class="badge b-conf">Programmé</span>`;
        small = `${quand}, ${esc(r.court)}`;
      }
    } else if (r) {
      badge = `<span class="badge b-wait">Demande en attente</span>`;
      small = `${fmtShort(r.date)} à ${fmtTime(r.time)}`;
    } else {
      dis = false; dispo++;
      const c = lastClosed(p.nom, S.player, e);
      if (c && c.status === "refused") {
        badge = `<span class="badge b-full">Refusée</span>`;
        small = `<span class="ref">${fmtShort(c.date)} à ${fmtTime(c.time)} : ${esc(c.reason || "refusée par le club")}</span><br>Touchez pour refaire une demande`;
      } else if (c && c.status === "cancelled") {
        badge = `<span class="badge b-grey">Annulé</span>`;
        small = `Match du ${fmtShort(c.date)} annulé. Touchez pour refaire une demande`;
      } else badge = `<span class="badge b-ok">Disponible</span>`;
    }
    return `<button class="big" ${dis ? "disabled" : ""} ${btnData("opp", e)}><span class="grow">${esc(e)}${small ? `<small>${small}</small>` : ""}</span>${badge}</button>`;
  }).join("");
  return `<p class="q">Votre adversaire</p><p class="sub">${esc(S.player)}, ${p.nom}</p>` +
    (dispo ? "" : `<div class="info">Tous vos matchs sont déjà demandés ou programmés.</div>`) + rows;
}
function vSlot() {
  const future = DATA.creneaux.map((c, i) => ({ ...c, i })).filter(estAVenir)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const byDay = {};
  future.forEach((c) => (byDay[c.date] = byDay[c.date] || []).push(c));
  const html = Object.entries(byDay).map(([d, list]) =>
    `<p class="day">${fmtDay(d)}</p><div class="slots">` +
    list.map((c) => {
      const st = slotState(DATA.requests, c, S.player, S.opp);
      const lbl = st.type === "full" ? "Complet" : st.type === "conflict" ? "Déjà engagé" : `${st.left} terrain${st.left > 1 ? "s" : ""}`;
      return `<button class="slot ${st.type}" ${st.type !== "ok" ? "disabled" : ""} ${btnData("slot", c.i)}><b>${fmtTime(c.time)}</b><i>→ ${fmtTime(finCreneau(c.time, c.duration))}</i><span>${lbl}</span></button>`;
    }).join("") + `</div>`
  ).join("");
  return `<p class="q">Choisissez un créneau</p><p class="sub">${esc(S.player)} contre ${esc(S.opp)}</p>
    <p class="hint tip">Pas encore d'accord avec votre adversaire ? Envoyez-lui un message avant de demander un créneau.</p>
    ${waPartage(messageAccord(getPoule(S.poule).nom), "💬 Écrire à mon adversaire")}
    <div class="sep"></div>` +
    (html || `<div class="empty">Aucun créneau ouvert pour le moment. Revenez bientôt.</div>`) +
    (html ? `<p class="note">« Déjà engagé » : un des joueurs a déjà un match sur ce créneau.</p>` : "");
}
function waPartage(texte, label) {
  return `<a class="cta wa" href="https://wa.me/?text=${encodeURIComponent(texte)}" target="_blank" rel="noopener">${label}</a>`;
}
function messageAccord(pool) {
  return `Salut ${prenom(S.opp)}, c'est ${prenom(S.player)} (tournoi interne TCPM 🎾).\n` +
    `On doit jouer notre match de ${pool}. Quels créneaux t'arrangent ?\n` +
    `Voici ceux ouverts par le club : ${FORM_URL}`;
}
function messageDemande(r) {
  return `Salut ${prenom(r.opponent)}, c'est ${prenom(r.player)} (tournoi interne TCPM 🎾).\n` +
    `J'ai demandé au club le créneau du ${fmtDay(r.date).toLowerCase()}, ${fmtTime(r.time)} – ${fmtTime(r.end)} pour notre match (${r.pool}).\n` +
    `Ça te va ? Le club confirmera le terrain et nous préviendra tous les deux.\n` +
    `Si ça ne va pas, dis-le-moi et je referai une demande : ${FORM_URL}`;
}
function setRow(i) {
  const [a, b] = S.sets[i];
  const superTB = i === 2 && S.scoreType === "normal";
  return `<div class="setrow"><span>${superTB ? "Super TB" : `Set ${i + 1}`}</span>
    <input class="setin" id="s${i}a" type="number" inputmode="numeric" min="0" max="${superTB ? 30 : 7}" value="${esc(a)}">
    <em>/</em>
    <input class="setin" id="s${i}b" type="number" inputmode="numeric" min="0" max="${superTB ? 30 : 7}" value="${esc(b)}"></div>`;
}
function vScore() {
  const r = S.score;
  const moi = S.player, lui = S.opp;
  const special = S.scoreType !== "normal";
  return `<p class="q">Score du match</p><p class="sub">${fmtDay(r.date)}, ${fmtTime(r.time)} – ${fmtTime(finDe(r.date, r.time))}, ${esc(r.court)}</p>` +
    matchCard(CATEGORIES[S.cat], r.pool, moi, lui, r.date, r.time, finDe(r.date, r.time)) +
    `<p class="ask-title">Jeux gagnés — ${esc(moi)} à gauche</p>
     ${special ? "" : [0, 1, 2].map(setRow).join("")}
     ${special ? `<p class="hint">${S.scoreType === "wo" ? "WO : aucun set à saisir." : "Abandon : saisissez les sets joués."}</p>` : ""}
     ${S.scoreType === "retired" ? [0, 1, 2].map(setRow).join("") : ""}
     <div class="chips">
       ${Object.entries({ normal: "Score normal", wo: "WO", retired: "Abandon" }).map(([k, l]) =>
         `<button class="chip mode ${S.scoreType === k ? "sel" : ""}" ${btnData("scoreType", k)}>${l}</button>`).join("")}
     </div>
     ${special ? `<p class="ask-title">Qui a gagné ?</p><div class="chips">
       <button class="chip mode ${S.scoreWinner === 1 ? "sel" : ""}" ${btnData("scoreWin", 1)}>${esc(moi)}</button>
       <button class="chip mode ${S.scoreWinner === 2 ? "sel" : ""}" ${btnData("scoreWin", 2)}>${esc(lui)}</button></div>` : ""}
     ${S.err ? `<div class="err">${S.err}</div>` : ""}
     <button class="cta" ${S.sending ? "disabled" : ""} ${btnData("sendScore")}>${S.sending ? "ENVOI…" : "ENVOYER LE SCORE"}</button>
     <p class="note">Le juge-arbitre valide ensuite le résultat et le reporte dans MOJA.</p>`;
}
function vScoreDone() {
  const d = S.scoreDone;
  return `<div class="done"><div class="check">✓</div>
    <h2>Score envoyé</h2><p>Vainqueur : <b>${esc(d.winner)}</b> — ${esc(d.texte)}<br>Le club le validera et le reportera dans MOJA.</p></div>` +
    waPartage(`Salut ${prenom(d.lui)}, c'est ${prenom(d.moi)} (tournoi interne TCPM 🎾).\nJ'ai saisi le score de notre match : ${d.texte} (victoire ${prenom(d.winner)}).\nSi ce n'est pas bon, dis-le-moi avant que le club le valide : ${FORM_URL}`,
      "💬 Prévenir mon adversaire") +
    `<button class="cta dark" ${btnData("again")}>Retour au tournoi</button>`;
}

function contactField(side, entry, role) {
  if (known(entry))
    return `<div class="known"><span>${role}</span><b>${esc(entry)}</b><em>✓ numéro connu du club</em></div>`;
  const v = side === 1 ? S.phone1 : S.phone2;
  const label = side === 1 ? `Votre portable (${esc(entry)})` : `Portable de ${esc(entry)}`;
  return `<div class="field"><label for="phone${side}">${label}</label>
    <input id="phone${side}" type="tel" inputmode="tel" autocomplete="${side === 1 ? "tel" : "off"}" placeholder="06 12 34 56 78" value="${esc(v)}"></div>`;
}
function vRecap() {
  const p = getPoule(S.poule), c = S.slot, mixte = S.cat === "mixte";
  return `<p class="q">Vérifiez votre demande</p><p class="sub">Le terrain sera attribué par le club.</p>` +
    matchCard(CATEGORIES[S.cat], p.nom, S.player, S.opp, c.date, c.time, finCreneau(c.time, c.duration)) +
    `<p class="ask-title">Prévenus sur WhatsApp à la confirmation</p>` +
    contactField(1, S.player, mixte ? "Votre équipe" : "Vous") +
    contactField(2, S.opp, mixte ? "Équipe adverse" : "Votre adversaire") +
    `<p class="hint">Numéros utilisés uniquement pour le tournoi et supprimés à la fin.</p>
     <div class="hp" aria-hidden="true"><label>Site web <input id="website" tabindex="-1" autocomplete="off"></label></div>` +
    (S.err ? `<div class="err">${S.err}</div>` : "") +
    `<button class="cta" ${S.sending ? "disabled" : ""} ${btnData("send")}>${S.sending ? "ENVOI…" : "ENVOYER LA DEMANDE"}</button>`;
}
function jatLink(r) {
  const txt = `Bonjour Bruno, question sur ma demande du tournoi interne :\n` +
    `${r.player} contre ${r.opponent} (${r.pool}), ${fmtDay(r.date).toLowerCase()} de ${fmtTime(r.time)} à ${fmtTime(r.end)}.\n\n`;
  return `https://wa.me/${JAT_PHONE}?text=${encodeURIComponent(txt)}`;
}
function vDone() {
  const r = S.last;
  return `<div class="done"><div class="check">✓</div>
    <h2>Demande envoyée au club</h2><p>Votre créneau doit maintenant être confirmé. Les deux joueurs seront prévenus sur WhatsApp.</p></div>` +
    matchCard(r.catLabel, r.pool, r.player, r.opponent, r.date, r.time, r.end) +
    waPartage(messageDemande(r), "💬 Prévenir mon adversaire sur WhatsApp") +
    `<p class="note">WhatsApp s'ouvre avec le message prêt : choisissez votre adversaire dans vos contacts.</p>
     <button class="cta dark" ${btnData("again")}>Faire une autre demande</button>
     <a class="cta dark jat" href="${jatLink(r)}" target="_blank" rel="noopener">Une question ? Écrire au juge-arbitre</a>`;
}

async function submit() {
  if (S.sending) return;
  const p = getPoule(S.poule), c = S.slot;
  const read = (side, entry) => {
    if (known(entry)) return null;
    const raw = document.getElementById("phone" + side).value;
    if (side === 1) S.phone1 = raw; else S.phone2 = raw;
    return raw;
  };
  const phone1 = read(1, S.player), phone2 = read(2, S.opp);
  if (phone1 !== null && !normPhone(phone1)) { S.err = "Indiquez votre numéro de portable (06 ou 07)."; return render(); }
  if (phone2 !== null && !normPhone(phone2)) { S.err = `Indiquez le portable de ${esc(S.opp)} (06 ou 07).`; return render(); }

  S.sending = true; S.err = null; render();
  try {
    await api("/api/tournoi/request", { method: "POST", body: {
      poolId: p.id, player: S.player, opponent: S.opp, date: c.date, time: c.time,
      phone1, phone2, website: document.getElementById("website")?.value || "",
    }});
    S.last = { catLabel: CATEGORIES[S.cat], pool: p.nom, player: S.player, opponent: S.opp, date: c.date, time: c.time, end: finCreneau(c.time, c.duration) };
    S.hist = []; S.step = "done";
    load();
  } catch (e) {
    S.err = esc(e.message);
    if (e.status === 409) load();
  } finally {
    S.sending = false; render(); window.scrollTo(0, 0);
  }
}

async function submitScore() {
  if (S.sending) return;
  const r = S.score;
  const lire = () => [0, 1, 2].map((i) => {
    const a = document.getElementById(`s${i}a`), b = document.getElementById(`s${i}b`);
    S.sets[i] = [a ? a.value : "", b ? b.value : ""];
    return S.sets[i];
  }).filter(([a, b]) => a !== "" || b !== "").map(([a, b]) => [Number(a), Number(b)]);
  const sets = lire();
  const side = r.player === S.player ? 1 : 2;
  // Le score est toujours saisi « moi à gauche » : on le remet dans l'ordre du match
  const setsMatch = side === 1 ? sets : sets.map(([a, b]) => [b, a]);
  const winnerMatch = S.scoreWinner ? (side === 1 ? S.scoreWinner : 3 - S.scoreWinner) : null;
  const check = analyseScore(setsMatch, S.scoreType, winnerMatch);
  if (check.error) { S.err = esc(check.error); return render(); }

  S.sending = true; S.err = null; render();
  try {
    const res = await api("/api/tournoi/score", { method: "POST", body: {
      id: r.id, sets: setsMatch, type: S.scoreType, winner: winnerMatch, side,
    }});
    S.scoreDone = { moi: S.player, lui: S.opp, winner: res.winner, texte: fmtScore(check.sets, S.scoreType) };
    S.step = "scoreDone"; S.hist = [];
    load();
  } catch (e) {
    S.err = esc(e.message);
  } finally {
    S.sending = false; render(); window.scrollTo(0, 0);
  }
}

/* ---------- Rendu ---------- */
function render() {
  if (S.step === "score") [0, 1, 2].forEach((i) => {
    const a = document.getElementById(`s${i}a`), b = document.getElementById(`s${i}b`);
    if (a && b) S.sets[i] = [a.value, b.value];
  });
  let body;
  if (!loaded) body = `<div class="loading">Chargement…</div>`;
  else if (loadError) body = `<div class="err">${esc(loadError)}</div><button class="cta dark" ${btnData("reload")}>Réessayer</button>`;
  else {
    const views = { cat: vCat, groupe: vGroupe, poule: vPoule, player: vPlayer, opp: vOpp, slot: vSlot,
      recap: vRecap, done: vDone, score: vScore, scoreDone: vScoreDone };
    body = (S.hist.length && !["done", "scoreDone"].includes(S.step) ? `<button class="back" ${btnData("back")}>‹ Retour</button>` : "") + views[S.step]();
  }
  const f = flow(), idx = S.step === "done" ? f.length : f.indexOf(S.step);
  const progress = `<div class="progress">${f.map((_, i) => `<i class="${i <= idx ? "on" : ""}"></i>`).join("")}</div>`;
  app.innerHTML = header("TC Pennes-Mirabeau", progress) + `<main>${body}</main>` + `<div class="ball" aria-hidden="true"></div>`;
}

onAction((act, v) => {
  switch (act) {
    case "cat": S.cat = v; S.groupe = null; S.poule = null; return suite();
    case "groupe": S.groupe = v; S.poule = null; return suite();
    case "poule": S.poule = v; return go("player");
    case "player": S.player = v; return go("opp");
    case "opp": S.opp = v; return go("slot");
    case "slot": S.slot = { ...DATA.creneaux[Number(v)] }; return go("recap");
    case "back": return back();
    case "send": return submit();
    case "score": {
      S.opp = v;
      S.score = findMatch(getPoule(S.poule).nom, S.player, v);
      S.sets = [["", ""], ["", ""], ["", ""]]; S.scoreType = "normal"; S.scoreWinner = null;
      return go("score");
    }
    case "scoreType": S.scoreType = v; S.scoreWinner = null; break;
    case "scoreWin": S.scoreWinner = Number(v); break;
    case "sendScore": return submitScore();
    case "again": S = fresh(); render(); return window.scrollTo(0, 0);
    case "reload": loaded = false; render(); return load();
  }
});

render();
load();
