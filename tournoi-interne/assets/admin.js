// Page juge-arbitre : validation des demandes, terrains, WhatsApp
// Les appels passent par /tournoi-interne/admin/api/* (même dossier que la page,
// ce qui garantit que le navigateur renvoie l'identifiant saisi).
import {
  CATEGORIES, TERRAINS, MOTIFS, FORM_URL, SIGNATURE, prenom, fmtPhone, joueursDe, estAVenir, levelInfo,
  DURATIONS, DEFAULT_DURATION, finCreneau, fmtDuree, joursEntre, heuresSerie, nowParis,
  analyseScore, fmtScore,
} from "./config.js";
import { readXlsx, parseTableau, parseListe, construireImport } from "./moja.js";
import { esc, btnData, fmtDay, fmtShort, fmtTime, header, api, onAction } from "./ui.js";

const API = "/tournoi-interne/admin/api";
const app = document.getElementById("app");
let requests = [];
let D = { pools: [], entries: {}, slots: [], contacts: {}, fixtures: [] };
const getPoule = (id) => D.pools.find((p) => p.id === id);
let loaded = false, loadError = null, busy = false;
let S = { section: "demandes", tab: "pending", val: null, court: null, refuse: null, refReason: null, cancel: null,
  msg: null, msgId: null, err: null, pool: null, poolText: "", imp: null, impOpen: false,
  resTab: "avalider", fxRound: 1, fxA: "", fxB: "", fix: null, fixSets: [["", ""], ["", ""], ["", ""]], fixType: "normal", fixWinner: null, rename: null, report: null,
  slotForm: { date: "", time: "18:00", capacity: 2, duration: DEFAULT_DURATION }, showPast: false, contactFilter: "missing",
  slotMode: "serie", selMode: false, sel: new Set(),
  batch: { from: "", to: "", days: [1, 2, 3, 4, 5], start: "18:00", end: "22:00", duration: DEFAULT_DURATION, capacity: 2 } };
const JOURS = [[1, "L"], [2, "M"], [3, "M"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]];
const slotOf = (date, time) => D.slots.find((x) => x.date === date && x.time === time);
const finDe = (r) => finCreneau(r.time, slotOf(r.date, r.time)?.duration);
const joue = (r) => r.status === "confirmed" && `${r.date} ${finDe(r)}` <= nowParis();
const vainqueur = (r) => (r.winner_side === 1 ? r.player : r.winner_side === 2 ? r.opponent : "");
const plage = (date, time) => `${fmtTime(time)} – ${fmtTime(finCreneau(time, slotOf(date, time)?.duration))}`;

async function load() {
  try {
    const r = await api(`${API}/requests`);
    requests = r.requests; D = { pools: r.pools, entries: r.entries, slots: r.slots, contacts: r.contacts, fixtures: r.fixtures };
    if (!getPoule(S.pool)) S.pool = D.pools[0]?.id ?? null;
    loadError = null;
  } catch (e) { loadError = e.message; }
  loaded = true; render();
}

const capOf = (date, time) => D.slots.find((x) => x.date === date && x.time === time)?.capacity ?? 0;

async function manage(payload, okMsg) {
  if (busy) return false;
  busy = true; S.err = null; S.msg = null; render();
  try {
    const r = await api(`${API}/manage`, { method: "POST", body: payload });
    D = r.data;
    if (!getPoule(S.pool)) S.pool = D.pools[0]?.id ?? null;
    if (okMsg) S.msg = typeof okMsg === "function" ? okMsg(r) : okMsg;
    return r;
  } catch (e) {
    S.err = e.message;
    return false;
  } finally {
    busy = false; render();
  }
}

async function action(payload, okMsg) {
  if (busy) return;
  busy = true; S.err = null; render();
  try {
    const { request } = await api(`${API}/action`, { method: "POST", body: payload });
    const i = requests.findIndex((r) => r.id === request.id);
    if (i >= 0) requests[i] = request;
    if (okMsg) { S.msg = okMsg(request); S.msgId = request.id; }
    S.val = S.court = S.refuse = S.refReason = S.cancel = S.fix = null;
  } catch (e) {
    S.err = e.message;
    await load();
  } finally {
    busy = false; render();
  }
}

/* ---------- WhatsApp ---------- */
const phoneOf = (r, side) => (side === 1 ? r.phone1 : r.phone2);
const notifiedOf = (r, side) => (side === 1 ? r.notified1 : r.notified2);
const catLabel = (c) => CATEGORIES[c] ?? c;

function waMessage(r, side) {
  const moi = side === 1 ? r.player : r.opponent;
  const lui = side === 1 ? r.opponent : r.player;
  const fin = fmtTime(finCreneau(r.time, slotOf(r.date, r.time)?.duration));
  const quand = `${fmtDay(r.date).toLowerCase()} de ${fmtTime(r.time)} à ${fin}`;
  let txt;
  if (r.status === "confirmed")
    txt = `✅ Tournoi interne TCPM\nBonjour ${prenom(moi)}, votre match contre ${lui} est confirmé ${quand}, ${r.court}.\nBon match ! 🎾`;
  else if (r.status === "refused")
    txt = `❌ Tournoi interne TCPM\nBonjour ${prenom(moi)}, ${side === 1 ? "votre demande" : `la demande de ${lui}`} pour le match ${r.player} contre ${r.opponent} du ${quand} n'a pas pu être acceptée${r.reason ? ` (${r.reason.toLowerCase()})` : ""}.\nUne nouvelle demande peut être faite ici : ${FORM_URL}`;
  else
    txt = `⚠️ Tournoi interne TCPM\nBonjour ${prenom(moi)}, votre match contre ${lui} du ${quand} est annulé.\nUne nouvelle demande peut être faite ici : ${FORM_URL}`;
  return `${txt}\n\n${SIGNATURE}`;
}
function waButton(r, side) {
  const nom = esc(prenom(side === 1 ? r.player : r.opponent));
  if (!phoneOf(r, side)) return `<button class="btn btn-sec" disabled>${nom} : pas de numéro</button>`;
  const done = notifiedOf(r, side);
  return `<button class="btn btn-wa ${done ? "sent" : ""}" ${btnData("wa", `${r.id}:${side}`)}>${done ? `✓ ${nom} prévenu` : `Prévenir ${nom}`}</button>`;
}
const waButtons = (r) => `<div class="row">${waButton(r, 1)}${waButton(r, 2)}</div>`;

function waRelance(r, side) {
  const moi = side === 1 ? r.player : r.opponent, lui = side === 1 ? r.opponent : r.player;
  const txt = `🎾 Tournoi interne TCPM\nBonjour ${prenom(moi)}, le score de votre match contre ${lui} ` +
    `du ${fmtDay(r.date).toLowerCase()} n'a pas encore été saisi.\nMerci de l'enregistrer ici : ${FORM_URL}\n\n${SIGNATURE}`;
  const tel = phoneOf(r, side);
  const nom = esc(prenom(moi));
  if (!tel) return `<button class="btn btn-sec" disabled>${nom} : pas de numéro</button>`;
  return `<a class="btn btn-wa" href="https://wa.me/${tel}?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Relancer ${nom}</a>`;
}
const toNotify = (r) => [1, 2].filter((s) => phoneOf(r, s) && !notifiedOf(r, s)).length;

/* ---------- Écran ---------- */
function card(r) {
  const cap = capOf(r.date, r.time);
  const used = requests.filter((x) => x.status === "confirmed" && x.date === r.date && x.time === r.time);
  let body = "";
  const head = `<div class="top"><div class="players">${esc(r.player)}<i>contre</i>${esc(r.opponent)}</div>
      ${r.status === "confirmed" ? `<span class="badge b-conf">${esc(r.court)}</span>` : ""}
      ${r.status === "refused" ? `<span class="badge b-full">Refusé</span>` : ""}
      ${r.status === "cancelled" ? `<span class="badge b-grey">Annulé</span>` : ""}</div>
    <div class="pool">${esc(r.pool)}</div>
    <div class="when">${fmtDay(r.date)}, ${plage(r.date, r.time)}</div>
    <div class="contact">${esc(prenom(r.player))} : ${fmtPhone(r.phone1)}, ${esc(prenom(r.opponent))} : ${fmtPhone(r.phone2)}</div>
    ${r.status === "refused" && r.reason ? `<div class="reason">Motif : ${esc(r.reason)}</div>` : ""}`;

  if (r.status === "pending") {
    body = `<div class="fill">Créneau : ${used.length} / ${cap} matchs confirmés</div>`;
    if (S.val === r.id) {
      if (used.length >= cap) {
        body += `<div class="err">Créneau complet. Refusez la demande ou attendez une annulation.</div>
          <div class="row"><button class="btn btn-sec" ${btnData("valX")}>Retour</button></div>`;
      } else {
        const taken = used.map((x) => x.court);
        body += `<p class="ask">Choisissez le terrain</p><div class="courts">` +
          TERRAINS.map((t) => {
            const pris = taken.includes(t);
            return `<button class="court ${S.court === t ? "sel" : ""}" ${pris ? "disabled" : ""} ${btnData("court", t)}>${t.replace("Terrain ", "T")}<small>${pris ? "pris" : "libre"}</small></button>`;
          }).join("") + `</div>
          <div class="row"><button class="btn btn-sec" ${btnData("valX")}>Retour</button>
          <button class="btn btn-ok" ${S.court && !busy ? "" : "disabled"} ${btnData("valOk", r.id)}>CONFIRMER</button></div>`;
      }
    } else if (S.refuse === r.id) {
      body += `<p class="ask">Motif du refus (facultatif)</p><div class="chips">` +
        MOTIFS.map((m) => `<button class="chip ${S.refReason === m ? "sel" : ""}" ${btnData("reason", m)}>${m}</button>`).join("") +
        `</div><div class="row"><button class="btn btn-sec" ${btnData("refX")}>Retour</button>
        <button class="btn btn-no" ${busy ? "disabled" : ""} ${btnData("refOk", r.id)}>REFUSER</button></div>`;
    } else {
      body += `<div class="row"><button class="btn btn-no" ${btnData("ref", r.id)}>REFUSER</button>
        <button class="btn btn-ok" ${btnData("val", r.id)}>VALIDER</button></div>`;
    }
  } else if (r.status === "confirmed") {
    body = S.cancel === r.id
      ? `<p class="ask">Annuler ce match ? ${esc(r.court)} sera libéré.</p>
         <div class="row"><button class="btn btn-sec" ${btnData("canX")}>Retour</button>
         <button class="btn btn-no" ${busy ? "disabled" : ""} ${btnData("canOk", r.id)}>Oui, annuler</button></div>`
      : `<div class="row"><button class="btn btn-sec" ${btnData("can", r.id)}>Annuler le match</button></div>${waButtons(r)}`;
  } else {
    body = waButtons(r);
  }
  return `<div class="card ${r.status}">${head}${body}</div>`;
}

function vDemandes() {
  const by = (s) => requests.filter((r) => s.includes(r.status));
  const pend = by(["pending"]), conf = by(["confirmed"]), other = by(["refused", "cancelled"]);
  const aPrevenir = [...conf, ...other].reduce((n, r) => n + toNotify(r), 0);
  const list = { pending: pend, confirmed: conf.filter((r) => !joue(r)), other }[S.tab];
  const empty = { pending: "Aucune demande en attente.", confirmed: "Aucun match confirmé.", other: "Aucune demande refusée ou annulée." }[S.tab];
  const msgReq = S.msgId && requests.find((r) => r.id === S.msgId);
  return `
    <div class="toolbar"><button ${btnData("reload")}>↻ Actualiser</button><a href="${API}/export" download>Exporter CSV</a></div>
    <div class="stats">
      <div class="stat s-wait"><b>${pend.length}</b><span>à valider</span></div>
      <div class="stat s-conf"><b>${conf.length}</b><span>confirmés</span></div>
      <div class="stat"><b>${other.length}</b><span>refusés / annulés</span></div>
    </div>
    <div class="tabs">
      <button class="${S.tab === "pending" ? "on" : ""}" ${btnData("tab", "pending")}>En attente</button>
      <button class="${S.tab === "confirmed" ? "on" : ""}" ${btnData("tab", "confirmed")}>Confirmés</button>
      <button class="${S.tab === "other" ? "on" : ""}" ${btnData("tab", "other")}>Refusés</button>
    </div>
    ${aPrevenir ? `<div class="info">📱 ${aPrevenir} joueur${aPrevenir > 1 ? "s" : ""} à prévenir sur WhatsApp</div>` : ""}
    ${S.msg ? `<div class="info">${S.msg}${msgReq ? waButtons(msgReq) : ""}</div>` : ""}
    ${list.length ? list.map(card).join("") : `<div class="empty">${empty}</div>`}`;
}


/* ---------- Poules ---------- */
const requestsForName = (poolNom, name) =>
  requests.filter((r) => r.pool === poolNom && (r.player === name || r.opponent === name)).length;

function vImport() {
  const imp = S.imp;
  if (!S.impOpen) {
    return `<button class="cta dark" ${btnData("impOpen")}>📥 Importer depuis MOJA</button>`;
  }
  let preview = "";
  if (imp) {
    const nbNoms = imp.pools.reduce((n, p) => n + p.entries.length, 0);
    const tous = [...new Set(imp.pools.flatMap((p) => p.entries.flatMap(joueursDe)))];
    const sansTel = tous.filter((n) => !imp.contacts[n] && !D.contacts[n]);
    preview = `
      <div class="info">${imp.pools.length} groupes, ${nbNoms} ${nbNoms > 1 ? "inscriptions" : "inscription"}, ${Object.keys(imp.contacts).length} numéros trouvés.
        ${sansTel.length ? `<div class="reason">Sans numéro : ${sansTel.map(esc).join(", ")}</div>` : ""}
        ${imp.absents?.length ? `<div class="reason">Inscrits absents des poules : ${imp.absents.map(esc).join(", ")}</div>` : ""}
        ${imp.warnings.length ? `<div class="reason">${imp.warnings.map(esc).join("<br>")}</div>` : ""}</div>
      ${imp.pools.map((p, i) => `<div class="imp-pool">
        <label class="imp-head"><input type="checkbox" data-imp-pool="${i}" ${p.skip ? "" : "checked"}> <b>${esc(p.nom)}</b> <small>${p.entries.length}</small></label>
        <textarea data-imp-entries="${i}" rows="${Math.min(Math.max(p.entries.length, 2), 12)}">${esc(p.entries.join("\n"))}</textarea>
      </div>`).join("")}
      <label class="imp-head"><input type="checkbox" id="impReplace" ${imp.replace ? "checked" : ""}>
        Remplacer la composition actuelle <small>(retire les noms et poules absents de l'import, sauf ceux qui ont déjà des demandes)</small></label>
      <div class="row"><button class="btn btn-sec" ${btnData("impCancel")}>Annuler</button>
        <button class="btn btn-ok" ${busy ? "disabled" : ""} ${btnData("impSave")}>ENREGISTRER</button></div>`;
  }
  return `<div class="login">
    <p class="ask-title" style="margin-top:0">Importer depuis MOJA</p>
    <div class="field"><label for="impTableau">1. Fichier « Tableau » (.xlsx)</label><input id="impTableau" type="file" accept=".xlsx"></div>
    <div class="field"><label for="impListe">2. « Liste des joueurs » (.xlsx), pour les prénoms du mixte et les téléphones</label><input id="impListe" type="file" accept=".xlsx"></div>
    <p class="hint">Les fichiers sont lus sur cet appareil : seuls les noms et les téléphones sont enregistrés.</p>
    ${imp ? "" : `<div class="row"><button class="btn btn-sec" ${btnData("impCancel")}>Fermer</button>
      <button class="btn btn-ok" ${btnData("impRead")}>LIRE LES FICHIERS</button></div>`}
    ${preview}
  </div>`;
}

const fixturesDe = (id) => (D.fixtures || []).filter((f) => f.pool_id === id);

function fixtureEtat(poolNom, f) {
  if (!f.entry2) return `<span class="badge b-grey">Exempt</span>`;
  const r = requests.find((x) => x.pool === poolNom && !["refused", "cancelled"].includes(x.status) &&
    ((x.player === f.entry1 && x.opponent === f.entry2) || (x.player === f.entry2 && x.opponent === f.entry1)));
  if (!r) return `<span class="badge b-full">À organiser</span>`;
  if (r.status === "pending") return `<span class="badge b-wait">Demande à valider</span>`;
  if (r.validated) return `<span class="badge b-ok">✅ ${esc(fmtScore(r.score, r.result_type))}</span>`;
  if (r.scored) return `<span class="badge b-wait">Score à valider</span>`;
  return `<span class="badge b-conf">${fmtShort(r.date)} ${fmtTime(r.time)}</span>`;
}

function vFixtures(p, list) {
  const fx = fixturesDe(p.id);
  const tours = [...new Set(fx.map((f) => f.round))].sort((a, b) => a - b);
  const opts = (sel) => `<option value="">—</option>` +
    list.map((e) => `<option ${e === sel ? "selected" : ""}>${esc(e)}</option>`).join("");
  const blocs = tours.map((t) => `<p class="day">Tour ${t}</p>` + fx.filter((f) => f.round === t).map((f) =>
    `<div class="line"><div class="grow"><b>${esc(f.entry1)}</b>${f.entry2 ? `<small>contre ${esc(f.entry2)}</small>` : `<small>exempt ce tour</small>`}</div>
      ${fixtureEtat(p.nom, f)}
      <button class="icon" ${btnData("fxDel", f.id)} aria-label="Supprimer">🗑</button></div>`).join("")).join("");
  return `<div class="login">
      <p class="ask-title" style="margin-top:0">Rencontres du tour ${fx.length ? "" : "(TMC)"}</p>
      <p class="hint">Tant qu'aucune rencontre n'est saisie, toutes les équipes peuvent se jouer entre elles.
        Dès qu'une rencontre existe, chaque équipe ne voit que son adversaire.</p>
      <div class="grid3 grid2">
        <div class="field"><label for="fxRound">Tour</label><input id="fxRound" type="number" min="1" max="20" value="${S.fxRound}"></div>
      </div>
      <div class="field"><label for="fxA">Équipe 1</label><select id="fxA">${opts(S.fxA)}</select></div>
      <div class="field"><label for="fxB">Équipe 2 <small>(vide = exempt)</small></label><select id="fxB">${opts(S.fxB)}</select></div>
      <button class="cta" ${busy ? "disabled" : ""} ${btnData("fxAdd")}>AJOUTER LA RENCONTRE</button>
    </div>
    ${blocs}`;
}

function vPoules() {
  const imp = vImport();
  if (!D.pools.length) {
    return `<p class="q">Poules</p><p class="sub">Aucune poule pour l'instant. Commencez par importer l'export MOJA.</p>` + imp;
  }
  const p = getPoule(S.pool), list = D.entries[p.id] || [], mixte = p.category === "mixte";
  const chips = Object.entries(CATEGORIES).map(([cat, label]) => {
    const pools = D.pools.filter((x) => x.category === cat);
    if (!pools.length) return "";
    return `<p class="chips-title">${label}</p><div class="chips pools">` + pools.map((x) => {
      const n = (D.entries[x.id] || []).length;
      const short = x.level === "tableau" ? "Tableau" : `${levelInfo(x.level).court.replace("Poule ", "")} ${x.number}`;
      return `<button class="chip pool ${x.id === S.pool ? "on" : ""}" ${btnData("pool", x.id)}>${esc(short)} <b>${n}</b></button>`;
    }).join("") + `</div>`;
  }).join("");
  const rows = list.map((name) => {
    const nReq = requestsForName(p.nom, name);
    const tels = joueursDe(name).map((j) => D.contacts[j]);
    const telTxt = tels.every(Boolean) ? `<span class="ok">✓ ${tels.map(fmtPhone).join(" · ")}</span>`
      : tels.some(Boolean) ? `<span class="ok">✓ ${fmtPhone(tels.find(Boolean))}</span>`
      : `<span class="ko">numéro manquant</span>`;
    if (S.rename === name) {
      return `<div class="line"><input id="renameInput" value="${esc(name)}" class="inline">
        <div class="row"><button class="btn btn-sec" ${btnData("renX")}>Retour</button>
        <button class="btn btn-ok" ${btnData("renOk", name)}>Enregistrer</button></div></div>`;
    }
    const locked = nReq > 0;
    return `<div class="line"><div class="grow"><b>${esc(name)}</b><small>${telTxt}${locked ? ` · ${nReq} demande${nReq > 1 ? "s" : ""}` : ""}</small></div>
      ${locked ? `<span class="lock" title="Des demandes existent">🔒</span>`
        : `<button class="icon" ${btnData("ren", name)} aria-label="Renommer">✏️</button>
           <button class="icon" ${btnData("del", name)} aria-label="Supprimer">🗑</button>`}</div>`;
  }).join("");
  const r = S.report;
  const poolLocked = requests.some((x) => x.pool === p.nom);
  return `${imp}${chips}
    <p class="q" style="margin-top:14px">${esc(p.nom)}</p>
    <p class="sub">${list.length} ${mixte ? "équipe" : "joueur"}${list.length > 1 ? "s" : ""}${list.length < 2 ? " · fermée aux joueurs tant qu'il y a moins de 2 noms" : ""}</p>
    ${r ? `<div class="info">${r.added.length} ajouté${r.added.length > 1 ? "s" : ""}${r.existing.length ? `, ${r.existing.length} déjà présent${r.existing.length > 1 ? "s" : ""}` : ""}${r.phones ? `, ${r.phones} numéro${r.phones > 1 ? "s" : ""} enregistré${r.phones > 1 ? "s" : ""}` : ""}.
      ${r.errors.length ? `<div class="reason">${r.errors.map(esc).join("<br>")}</div>` : ""}</div>` : ""}
    <div class="list">${rows || `<div class="empty">Aucun nom pour l'instant.</div>`}</div>
    <div class="login">
      <p class="ask-title" style="margin-top:0">Ajouter ${mixte ? "des équipes" : "des joueurs"}</p>
      <textarea id="poolText" rows="4" placeholder="${mixte
        ? "Bruno Peri / Sophie Le Garrec ; 06 12 34 56 78 ; 06 98 76 54 32"
        : "Bruno Peri ; 06 12 34 56 78"}">${esc(S.poolText)}</textarea>
      <p class="hint">Un ${mixte ? "binôme" : "joueur"} par ligne. Numéro facultatif après « ; »${mixte ? " (un par joueur)" : ""}.</p>
      <button class="cta" ${busy ? "disabled" : ""} ${btnData("addEntries")}>AJOUTER</button>
    </div>
    ${vFixtures(p, list)}
    ${poolLocked ? "" : `<button class="toggle danger" ${btnData("delPool", p.id)}>Supprimer ${esc(p.nom)}</button>`}`;
}

/* ---------- Créneaux ---------- */
const dureeOptions = (sel) => DURATIONS.map((d) => `<option value="${d}" ${d === sel ? "selected" : ""}>${fmtDuree(d)}</option>`).join("");
const terrainOptions = (sel) => TERRAINS.map((_, i) => `<option ${sel === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("");

function batchPreview() {
  const b = S.batch;
  if (!b.from || !b.to) return `<p class="hint">Choisissez la période.</p>`;
  if (b.from > b.to) return `<p class="reason">La date de fin est avant la date de début.</p>`;
  const dates = joursEntre(b.from, b.to, b.days);
  const heures = heuresSerie(b.start, b.end, b.duration);
  if (!b.days.length) return `<p class="reason">Choisissez au moins un jour.</p>`;
  if (!heures.length) return `<p class="reason">La plage ${fmtTime(b.start)} – ${fmtTime(b.end)} est plus courte qu'un match de ${fmtDuree(b.duration)}.</p>`;
  const n = dates.length * heures.length;
  return `<p class="preview"><b>${n} créneau${n > 1 ? "x" : ""}</b> sur ${dates.length} jour${dates.length > 1 ? "s" : ""} :
    ${heures.map((h) => `${fmtTime(h)} – ${fmtTime(finCreneau(h, b.duration))}`).join(", ")}, ${b.capacity} terrain${b.capacity > 1 ? "s" : ""}.</p>`;
}

function vCreneaux() {
  const f = S.slotForm, b = S.batch;
  const withStats = D.slots.map((s) => {
    const on = requests.filter((r) => r.date === s.date && r.time === s.time);
    return { ...s, conf: on.filter((r) => r.status === "confirmed").length,
      pend: on.filter((r) => r.status === "pending").length, total: on.length, future: estAVenir(s) };
  });
  const future = withStats.filter((s) => s.future), past = withStats.filter((s) => !s.future);
  const byDay = (arr) => {
    const g = {};
    arr.forEach((s) => (g[s.date] ||= []).push(s));
    return Object.entries(g).map(([d, list]) => {
      const all = list.every((s) => S.sel.has(s.id));
      return `<div class="dayhead"><p class="day">${fmtDay(d)}</p>
        ${S.selMode ? `<button class="mini" ${btnData("selDay", d)}>${all ? "Aucun" : "Tous"}</button>` : ""}</div>` +
        list.map(slotRow).join("");
    }).join("");
  };

  const formUn = `
      <div class="grid3">
        <div class="field"><label for="sDate">Date</label><input id="sDate" type="date" value="${esc(f.date)}"></div>
        <div class="field"><label for="sTime">Début</label><input id="sTime" type="time" step="900" value="${esc(f.time)}"></div>
        <div class="field"><label for="sDur">Durée</label><select id="sDur">${dureeOptions(f.duration)}</select></div>
        <div class="field"><label for="sCap">Terrains</label><select id="sCap">${terrainOptions(f.capacity)}</select></div>
      </div>
      <button class="cta" ${busy ? "disabled" : ""} ${btnData("addSlot")}>OUVRIR CE CRÉNEAU</button>`;

  const formSerie = `
      <div class="grid3 grid2">
        <div class="field"><label for="bFrom">Du</label><input id="bFrom" data-batch type="date" value="${esc(b.from)}"></div>
        <div class="field"><label for="bTo">Au</label><input id="bTo" data-batch type="date" value="${esc(b.to)}"></div>
      </div>
      <div class="field"><label>Jours</label><div class="days">${JOURS.map(([d, l]) =>
        `<button class="day-chip ${b.days.includes(d) ? "on" : ""}" ${btnData("day", d)}>${l}</button>`).join("")}
        <button class="mini" ${btnData("daysPreset", "semaine")}>Lun-Ven</button>
        <button class="mini" ${btnData("daysPreset", "tous")}>Tous</button></div></div>
      <div class="grid3">
        <div class="field"><label for="bStart">Premier match</label><input id="bStart" data-batch type="time" step="900" value="${esc(b.start)}"></div>
        <div class="field"><label for="bEnd">Fin du dernier</label><input id="bEnd" data-batch type="time" step="900" value="${esc(b.end)}"></div>
        <div class="field"><label for="bDur">Durée</label><select id="bDur" data-batch>${dureeOptions(b.duration)}</select></div>
        <div class="field"><label for="bCap">Terrains</label><select id="bCap" data-batch>${terrainOptions(b.capacity)}</select></div>
      </div>
      <div id="batchPreview">${batchPreview()}</div>
      <p class="hint">Les créneaux qui chevauchent un créneau existant sont ignorés.</p>
      <button class="cta" ${busy ? "disabled" : ""} ${btnData("addBatch")}>OUVRIR LA SÉRIE</button>`;

  const nSel = S.sel.size;
  return `<div class="login">
      <div class="tabs">
        <button class="${S.slotMode === "serie" ? "on" : ""}" ${btnData("slotMode", "serie")}>En série</button>
        <button class="${S.slotMode === "un" ? "on" : ""}" ${btnData("slotMode", "un")}>Un créneau</button>
      </div>
      ${S.slotMode === "serie" ? formSerie : formUn}
      <p class="hint">Terrains = nombre maximum de matchs du tournoi en même temps (tenir compte des cours).</p>
    </div>
    <div class="toolbar"><span class="count">${future.length} créneau${future.length > 1 ? "x" : ""} à venir</span>
      ${D.slots.length ? `<button ${btnData("selMode")}>${S.selMode ? "Terminer" : "☑ Sélectionner"}</button>` : ""}</div>
    ${future.length ? byDay(future) : `<div class="empty">Aucun créneau à venir.</div>`}
    ${past.length ? `<button class="toggle" ${btnData("past")}>${S.showPast ? "Masquer" : "Afficher"} les ${past.length} créneaux passés</button>
      ${S.showPast ? byDay(past) : ""}` : ""}
    ${S.selMode ? `<div class="selbar"><b>${nSel} sélectionné${nSel > 1 ? "s" : ""}</b>
      <button class="btn btn-sec" ${nSel ? "" : "disabled"} ${btnData("bulk", "hide")}>Masquer</button>
      <button class="btn btn-sec" ${nSel ? "" : "disabled"} ${btnData("bulk", "show")}>Afficher</button>
      <button class="btn btn-no" ${nSel ? "" : "disabled"} ${btnData("bulk", "delete")}>Supprimer</button></div>` : ""}`;
}
function slotRow(s) {
  const fin = fmtTime(finCreneau(s.time, s.duration));
  const check = S.selMode
    ? `<button class="check ${S.sel.has(s.id) ? "on" : ""}" ${btnData("sel", s.id)} aria-label="Sélectionner">${S.sel.has(s.id) ? "✓" : ""}</button>` : "";
  return `<div class="slotrow ${s.active ? "" : "off"} ${s.future ? "" : "past"} ${S.sel.has(s.id) ? "picked" : ""}">
    ${check}
    <div class="h"><b>${fmtTime(s.time)}</b><small>→ ${fin}</small></div>
    <div class="grow"><small>${s.conf} / ${s.capacity} confirmés${s.pend ? ` · ${s.pend} en attente` : ""}${s.active ? "" : " · <em>masqué</em>"}</small></div>
    ${!S.selMode && s.future ? `<div class="stepper">
        <button ${btnData("capMinus", s.id)} ${s.capacity <= Math.max(1, s.conf) ? "disabled" : ""} aria-label="Moins">−</button>
        <span>${s.capacity}</span>
        <button ${btnData("capPlus", s.id)} ${s.capacity >= TERRAINS.length ? "disabled" : ""} aria-label="Plus">+</button>
      </div>
      <button class="icon" ${btnData("toggleSlot", s.id)} aria-label="${s.active ? "Masquer" : "Afficher"}">${s.active ? "👁" : "🚫"}</button>` : ""}
    ${!S.selMode && !s.total ? `<button class="icon" ${btnData("delSlot", s.id)} aria-label="Supprimer">🗑</button>` : ""}
  </div>`;
}

/* ---------- Numéros ---------- */
function vNumeros() {
  const noms = [...new Set(Object.values(D.entries).flat().flatMap(joueursDe))].sort((a, b) => a.localeCompare(b, "fr"));
  const missing = noms.filter((n) => !D.contacts[n]);
  const orphans = Object.keys(D.contacts).filter((n) => !noms.includes(n));
  const shown = S.contactFilter === "missing" ? missing : noms;
  const row = (n) => `<div class="line"><div class="grow"><b>${esc(n)}</b></div>
    <input class="inline tel" type="tel" inputmode="tel" data-name="${esc(n)}" value="${esc(D.contacts[n] ? fmtPhone(D.contacts[n]) : "")}" placeholder="06 …">
    <button class="icon" ${btnData("saveTel", n)} aria-label="Enregistrer">💾</button></div>`;
  return `<p class="q">Numéros des joueurs</p>
    <p class="sub">${noms.length - missing.length} / ${noms.length} renseignés. Le joueur n'a rien à saisir quand son numéro est connu.</p>
    <div class="tabs">
      <button class="${S.contactFilter === "missing" ? "on" : ""}" ${btnData("cf", "missing")}>Manquants (${missing.length})</button>
      <button class="${S.contactFilter === "all" ? "on" : ""}" ${btnData("cf", "all")}>Tous (${noms.length})</button>
    </div>
    <div class="list">${shown.map(row).join("") || `<div class="empty">${noms.length ? "Tous les numéros sont renseignés ✓" : "Ajoutez d'abord des joueurs dans les poules."}</div>`}</div>
    ${orphans.length ? `<p class="day">Hors poules</p><div class="list">${orphans.map(row).join("")}</div>
      <p class="hint">Videz le champ puis 💾 pour supprimer un numéro.</p>` : ""}`;
}

/* ---------- Résultats ---------- */
function setRowFix(i) {
  const [a, b] = S.fixSets[i];
  const superTB = i === 2 && S.fixType === "normal";
  return `<div class="setrow"><span>${superTB ? "Super TB" : `Set ${i + 1}`}</span>
    <input class="setin" id="f${i}a" type="number" inputmode="numeric" min="0" max="${superTB ? 30 : 7}" value="${esc(a)}">
    <em>/</em>
    <input class="setin" id="f${i}b" type="number" inputmode="numeric" min="0" max="${superTB ? 30 : 7}" value="${esc(b)}"></div>`;
}
function fixForm(r) {
  const special = S.fixType !== "normal";
  return `<p class="ask">Score — ${esc(r.player)} à gauche</p>
    ${special && S.fixType === "wo" ? "" : [0, 1, 2].map(setRowFix).join("")}
    <div class="chips">${Object.entries({ normal: "Score normal", wo: "WO", retired: "Abandon" }).map(([k, l]) =>
      `<button class="chip mode ${S.fixType === k ? "sel" : ""}" ${btnData("fixType", k)}>${l}</button>`).join("")}</div>
    ${special ? `<p class="ask">Vainqueur</p><div class="chips">
      <button class="chip mode ${S.fixWinner === 1 ? "sel" : ""}" ${btnData("fixWin", 1)}>${esc(r.player)}</button>
      <button class="chip mode ${S.fixWinner === 2 ? "sel" : ""}" ${btnData("fixWin", 2)}>${esc(r.opponent)}</button></div>` : ""}
    <div class="row"><button class="btn btn-sec" ${btnData("fixX")}>Retour</button>
      <button class="btn btn-ok" ${busy ? "disabled" : ""} ${btnData("fixOk", r.id)}>ENREGISTRER ET VALIDER</button></div>`;
}
function resultCard(r, mode) {
  const score = fmtScore(r.score, r.result_type);
  const head = `<div class="top"><div class="players">${esc(r.player)}<i>contre</i>${esc(r.opponent)}</div>
      ${score ? `<span class="badge ${r.validated ? "b-ok" : "b-wait"}">${esc(score)}</span>` : ""}</div>
    <div class="pool">${esc(r.pool)}</div>
    <div class="when">${fmtDay(r.date)}, ${plage(r.date, r.time)}${r.court ? `, ${esc(r.court)}` : ""}</div>
    ${vainqueur(r) ? `<div class="contact">Vainqueur : <b style="color:#6ff0a8">${esc(vainqueur(r))}</b>${r.score_by ? ` · saisi par ${esc(r.score_by)}` : ""}</div>` : ""}`;
  if (S.fix === r.id) return `<div class="card confirmed">${head}${fixForm(r)}</div>`;
  let body = "";
  if (mode === "avalider") {
    body = `<div class="row"><button class="btn btn-sec" ${btnData("fix", r.id)}>Corriger</button>
      <button class="btn btn-ok" ${busy ? "disabled" : ""} ${btnData("valScore", r.id)}>VALIDER</button></div>`;
  } else if (mode === "asaisir") {
    body = `<div class="row">${waRelance(r, 1)}${waRelance(r, 2)}</div>
      <div class="row"><button class="btn btn-sec" ${btnData("fix", r.id)}>Saisir le score</button></div>`;
  } else {
    body = `<div class="row">
      <button class="btn btn-sec" ${btnData("fix", r.id)}>Corriger</button>
      <button class="btn ${r.reported ? "btn-wa sent" : "btn-ok"}" ${btnData("moja", r.id)}>${r.reported ? "✓ Reporté dans MOJA" : "📋 Marquer reporté MOJA"}</button></div>`;
  }
  return `<div class="card ${r.validated ? "confirmed" : ""}">${head}${body}</div>`;
}
function vResultats() {
  const joues = requests.filter(joue);
  const aValider = joues.filter((r) => r.scored && !r.validated);
  const aSaisir = joues.filter((r) => !r.scored);
  const termines = joues.filter((r) => r.validated);
  const aReporter = termines.filter((r) => !r.reported).length;
  const list = { avalider: aValider, asaisir: aSaisir, termines }[S.resTab];
  const empty = { avalider: "Aucun score en attente de validation.", asaisir: "Tous les scores ont été saisis ✅",
    termines: "Aucun résultat validé pour l'instant." }[S.resTab];
  return `<div class="stats">
      <div class="stat s-wait"><b>${aValider.length}</b><span>à valider</span></div>
      <div class="stat"><b>${aSaisir.length}</b><span>sans score</span></div>
      <div class="stat s-conf"><b>${termines.length}</b><span>terminés</span></div>
    </div>
    ${aReporter ? `<div class="info">📋 ${aReporter} résultat${aReporter > 1 ? "s" : ""} à reporter dans MOJA</div>` : ""}
    <div class="tabs">
      <button class="${S.resTab === "avalider" ? "on" : ""}" ${btnData("resTab", "avalider")}>À valider</button>
      <button class="${S.resTab === "asaisir" ? "on" : ""}" ${btnData("resTab", "asaisir")}>Sans score</button>
      <button class="${S.resTab === "termines" ? "on" : ""}" ${btnData("resTab", "termines")}>Terminés</button>
    </div>
    ${list.length ? list.map((r) => resultCard(r, S.resTab)).join("") : `<div class="empty">${empty}</div>`}`;
}

const SECTIONS = [["demandes", "Demandes"], ["resultats", "Résultats"], ["poules", "Poules"], ["creneaux", "Créneaux"], ["numeros", "Numéros"]];
function vAdmin() {
  const pend = requests.filter((r) => r.status === "pending").length;
  const scores = requests.filter((r) => joue(r) && r.scored && !r.validated).length;
  const badges = { demandes: pend, resultats: scores };
  const nav = `<nav class="nav">${SECTIONS.map(([k, l]) =>
    `<button class="${S.section === k ? "on" : ""}" ${btnData("section", k)}>${l}${badges[k] ? ` <i>${badges[k]}</i>` : ""}</button>`).join("")}</nav>`;
  const alerts = `${S.err ? `<div class="err">${esc(S.err)}</div>` : ""}${S.section !== "demandes" && S.msg ? `<div class="info">${S.msg}</div>` : ""}`;
  const views = { demandes: vDemandes, resultats: vResultats, poules: vPoules, creneaux: vCreneaux, numeros: vNumeros };
  return nav + alerts + views[S.section]();
}

function render() {
  const ta = document.getElementById("poolText");
  if (ta) S.poolText = ta.value;
  readBatch();
  if (S.fix) [0, 1, 2].forEach((i) => {
    const a = document.getElementById(`f${i}a`), b = document.getElementById(`f${i}b`);
    if (a && b) S.fixSets[i] = [a.value, b.value];
  });
  if (S.imp) {
    S.imp.pools.forEach((p, i) => {
      const cb = document.querySelector(`[data-imp-pool="${i}"]`), tx = document.querySelector(`[data-imp-entries="${i}"]`);
      if (cb) p.skip = !cb.checked;
      if (tx) p.entries = tx.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    });
    const rp = document.getElementById("impReplace");
    if (rp) S.imp.replace = rp.checked;
  }
  const fxA = document.getElementById("fxA"), fxB = document.getElementById("fxB"), fxR = document.getElementById("fxRound");
  if (fxA) { S.fxA = fxA.value; S.fxB = fxB.value; S.fxRound = Number(fxR.value) || 1; }
  let body;
  if (!loaded) body = `<div class="loading">Chargement…</div>`;
  else if (loadError) body = `<div class="err">${esc(loadError)}</div><button class="cta dark" ${btnData("reload")}>Réessayer</button>`;
  else body = vAdmin();
  app.innerHTML = header("Administration") + `<main>${body}</main>` + `<div class="ball" aria-hidden="true"></div>`;
}

const keep = ["court", "reason", "wa", "pool", "ren", "renX", "cf", "past", "day", "daysPreset", "sel", "selDay", "slotMode", "fixType", "fixWin", "fix", "resTab"];
onAction(async (act, v, e) => {
  if (!keep.includes(act)) { S.msg = null; S.msgId = null; S.err = null; }
  switch (act) {
    case "reload": loaded = false; render(); return load();
    case "section": S.section = v; S.report = null; S.rename = null; break;
    case "tab": S.tab = v; S.val = S.refuse = S.cancel = null; break;
    case "val": S.val = v; S.court = null; S.refuse = S.cancel = null; break;
    case "valX": S.val = null; S.court = null; break;
    case "court": S.court = v; break;
    case "valOk": return action({ action: "confirm", id: v, court: S.court },
      (r) => `✅ Match confirmé : ${esc(r.player)} contre ${esc(r.opponent)}, ${esc(r.court)}.`);
    case "ref": S.refuse = v; S.refReason = null; S.val = S.cancel = null; break;
    case "refX": S.refuse = null; S.refReason = null; break;
    case "reason": S.refReason = S.refReason === v ? null : v; break;
    case "refOk": return action({ action: "refuse", id: v, reason: S.refReason },
      (r) => `❌ Demande refusée : ${esc(r.player)} contre ${esc(r.opponent)}.`);
    case "can": S.cancel = v; break;
    case "canX": S.cancel = null; break;
    case "canOk": return action({ action: "cancel", id: v },
      (r) => `⚠️ Match annulé, ${esc(r.court)} libéré.`);
    case "wa": {
      e.preventDefault();
      const [id, sd] = v.split(":"); const side = Number(sd);
      const r = requests.find((x) => x.id === id);
      if (!r || !phoneOf(r, side)) return;
      window.open(`https://wa.me/${phoneOf(r, side)}?text=${encodeURIComponent(waMessage(r, side))}`, "_blank", "noopener");
      r[`notified${side}`] = true; render();
      try { await api(`${API}/action`, { method: "POST", body: { action: "notified", id, side } }); }
      catch (err) { S.err = `Envoi ouvert, mais « prévenu » non enregistré : ${err.message}`; render(); }
      return;
    }

    /* Import MOJA */
    case "impOpen": S.impOpen = true; S.imp = null; break;
    case "impCancel": S.impOpen = false; S.imp = null; break;
    case "impRead": {
      const ft = document.getElementById("impTableau").files[0];
      const fl = document.getElementById("impListe").files[0];
      if (!ft) { S.err = "Choisissez le fichier « Tableau » exporté de MOJA."; break; }
      busy = true; render();
      try {
        const blocs = parseTableau(await readXlsx(ft));
        const joueurs = fl ? parseListe(await readXlsx(fl)) : [];
        const imp = construireImport(blocs, joueurs);
        const noms = new Set(imp.pools.flatMap((p) => p.entries.flatMap(joueursDe)).map((n) => n.toLowerCase()));
        imp.absents = [...new Set(joueurs.map((j) => `${j.prenom} ${j.nom}`))]
          .filter((n) => ![...noms].some((x) => x.replace(/-/g, " ") === n.toLowerCase().replace(/-/g, " ")));
        imp.replace = !!fl;
        if (!fl) {
          imp.warnings.push("Sans la liste des joueurs : pas de téléphones, prénoms du mixte en initiales (groupe décoché), et remplacement désactivé par sécurité.");
          imp.pools.forEach((p) => { if (p.entries.some((e) => /\b\p{L}\.(\s|$)/u.test(e))) p.skip = true; });
        }
        S.imp = imp;
      } catch (err) {
        S.err = `Lecture impossible : ${err.message}`;
      } finally { busy = false; }
      break;
    }
    case "impSave": {
      const imp = S.imp;
      const pools = imp.pools.map((p, i) => ({
        ...p,
        skip: !document.querySelector(`[data-imp-pool="${i}"]`).checked,
        entries: document.querySelector(`[data-imp-entries="${i}"]`).value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
      })).filter((p) => !p.skip);
      const replace = document.getElementById("impReplace").checked;
      if (!pools.length) { S.err = "Aucune poule cochée."; break; }
      if (replace && !window.confirm("Remplacer la composition actuelle par cet import ?")) return;
      const r = await manage({ action: "import", pools, contacts: imp.contacts, replace });
      if (r) {
        const x = r.report;
        S.impOpen = false; S.imp = null; S.pool = D.pools[0]?.id ?? null;
        S.msg = `✅ Import : ${x.pools} groupes, ${x.added} noms ajoutés${x.removed ? `, ${x.removed} retirés` : ""}, ${x.phones} numéros.` +
          (x.kept.length ? `<div class="reason">Conservés car des demandes existent : ${x.kept.map(esc).join(", ")}</div>` : "") +
          (x.errors.length ? `<div class="reason">${x.errors.map(esc).join("<br>")}</div>` : "");
        render();
      }
      return;
    }
    case "delPool": {
      const p = getPoule(v);
      if (!window.confirm(`Supprimer ${p.nom} et tous ses noms ?`)) return;
      return manage({ action: "pool_delete", poolId: v }, `${esc(p.nom)} supprimée.`);
    }

    /* Poules */
    case "pool": S.pool = v; S.report = null; S.rename = null; S.poolText = ""; break;
    case "addEntries": {
      S.poolText = document.getElementById("poolText").value;
      const r = await manage({ action: "entry_add", poolId: S.pool, text: S.poolText });
      if (r) { S.report = r; if (!r.errors.length) S.poolText = ""; render(); }
      return;
    }
    case "fxAdd": {
      const round = Number(document.getElementById("fxRound").value);
      const entry1 = document.getElementById("fxA").value, entry2 = document.getElementById("fxB").value;
      S.fxRound = round;
      if (!entry1) { S.err = "Choisissez au moins l'équipe 1."; break; }
      const r = await manage({ action: "fixture_add", poolId: S.pool, round, entry1, entry2: entry2 || null },
        entry2 ? `Rencontre ajoutée au tour ${round}.` : `${entry1} déclaré exempt au tour ${round}.`);
      if (r) { S.fxA = ""; S.fxB = ""; render(); }
      return;
    }
    case "fxDel":
      if (!window.confirm("Supprimer cette rencontre ?")) return;
      return manage({ action: "fixture_delete", id: v }, "Rencontre supprimée.");
    case "ren": S.rename = v; S.report = null; break;
    case "renX": S.rename = null; break;
    case "renOk": {
      const newName = document.getElementById("renameInput").value;
      if (await manage({ action: "entry_rename", poolId: S.pool, name: v, newName }, "Nom modifié.")) { S.rename = null; render(); }
      return;
    }
    case "del":
      if (!window.confirm(`Retirer « ${v} » de la poule ?`)) return;
      return manage({ action: "entry_delete", poolId: S.pool, name: v }, `« ${esc(v)} » retiré.`);

    /* Créneaux */
    case "slotMode": S.slotMode = v; break;
    case "addSlot": {
      const f = { date: document.getElementById("sDate").value, time: document.getElementById("sTime").value,
        duration: Number(document.getElementById("sDur").value), capacity: Number(document.getElementById("sCap").value) };
      S.slotForm = f;
      if (!f.date || !f.time) { S.err = "Choisissez une date et une heure."; break; }
      if (!estAVenir(f)) { S.err = "Ce créneau est déjà passé."; break; }
      const r = await manage({ action: "slot_add", ...f },
        `Créneau ouvert : ${fmtShort(f.date)}, ${fmtTime(f.time)} – ${fmtTime(finCreneau(f.time, f.duration))}.`);
      if (r) { S.slotForm = { ...f, time: "" }; render(); }
      return;
    }
    case "day": {
      const d = Number(v), days = S.batch.days;
      S.batch.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
      break;
    }
    case "daysPreset": S.batch.days = v === "tous" ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]; break;
    case "addBatch": {
      const b = S.batch;
      if (!b.from || !b.to) { S.err = "Choisissez la période."; break; }
      const n = joursEntre(b.from, b.to, b.days).length * heuresSerie(b.start, b.end, b.duration).length;
      if (!n) { S.err = "Aucun créneau à créer avec ces réglages."; break; }
      if (!window.confirm(`Ouvrir ${n} créneau${n > 1 ? "x" : ""} ?`)) return;
      const r = await manage({ action: "slot_batch", ...b }, (x) => {
        const rep = x.report;
        return `✅ ${rep.created} créneau${rep.created > 1 ? "x" : ""} ouvert${rep.created > 1 ? "s" : ""}` +
          (rep.skipped ? `, ${rep.skipped} ignoré${rep.skipped > 1 ? "s" : ""} (déjà pris)` : "") +
          (rep.past ? `, ${rep.past} déjà passé${rep.past > 1 ? "s" : ""}` : "") + ".";
      });
      return r;
    }
    case "selMode": S.selMode = !S.selMode; S.sel = new Set(); break;
    case "sel": S.sel.has(v) ? S.sel.delete(v) : S.sel.add(v); break;
    case "selDay": {
      const ids = D.slots.filter((x) => x.date === v).map((x) => x.id);
      const all = ids.every((id) => S.sel.has(id));
      ids.forEach((id) => (all ? S.sel.delete(id) : S.sel.add(id)));
      break;
    }
    case "bulk": {
      const ids = [...S.sel];
      const label = { hide: "Masquer", show: "Afficher", delete: "Supprimer" }[v];
      if (!window.confirm(`${label} ${ids.length} créneau${ids.length > 1 ? "x" : ""} ?`)) return;
      const r = await manage({ action: "slot_bulk", op: v, ids }, (x) => {
        const rep = x.report;
        if (v === "delete") return `🗑 ${rep.done} supprimé${rep.done > 1 ? "s" : ""}` +
          (rep.kept ? `. ${rep.kept} conservé${rep.kept > 1 ? "s" : ""} car des demandes existent : masquez-les plutôt.` : ".");
        return `${rep.done} créneau${rep.done > 1 ? "x" : ""} ${v === "hide" ? "masqué" : "affiché"}${rep.done > 1 ? "s" : ""}.`;
      });
      if (r) { S.sel = new Set(); render(); }
      return;
    }
    case "capMinus": case "capPlus": {
      const s = D.slots.find((x) => x.id === v);
      return manage({ action: "slot_update", id: v, capacity: s.capacity + (act === "capPlus" ? 1 : -1) });
    }
    case "toggleSlot": {
      const s = D.slots.find((x) => x.id === v);
      return manage({ action: "slot_update", id: v, active: !s.active },
        s.active ? "Créneau masqué : les joueurs ne le voient plus." : "Créneau de nouveau visible.");
    }
    case "delSlot":
      if (!window.confirm("Supprimer ce créneau ?")) return;
      return manage({ action: "slot_delete", id: v }, "Créneau supprimé.");
    case "past": S.showPast = !S.showPast; break;

    /* Résultats */
    case "resTab": S.resTab = v; S.fix = null; break;
    case "fix": {
      const r = requests.find((x) => x.id === v);
      S.fix = v; S.fixType = r.result_type || "normal"; S.fixWinner = r.winner_side || null;
      S.fixSets = [0, 1, 2].map((i) => (r.score?.[i] || ["", ""]).map(String));
      break;
    }
    case "fixX": S.fix = null; break;
    case "fixType": S.fixType = v; S.fixWinner = null; break;
    case "fixWin": S.fixWinner = Number(v); break;
    case "fixOk": {
      const sets = S.fixSets.filter(([a, b]) => a !== "" || b !== "").map(([a, b]) => [Number(a), Number(b)]);
      const check = analyseScore(sets, S.fixType, S.fixWinner);
      if (check.error) { S.err = check.error; break; }
      return action({ action: "score", id: v, sets, type: S.fixType, winner: S.fixWinner },
        (r) => `✅ Score enregistré : ${esc(fmtScore(r.score, r.result_type))}, victoire ${esc(vainqueur(r))}.`);
    }
    case "valScore": return action({ action: "validate_score", id: v },
      (r) => `✅ Résultat validé : ${esc(r.player)} ${esc(fmtScore(r.score, r.result_type))} ${esc(r.opponent)}.`);
    case "moja": return action({ action: "moja", id: v },
      (r) => (r.reported ? "📋 Marqué comme reporté dans MOJA." : "Marque « reporté » retirée."));

    /* Numéros */
    case "cf": S.contactFilter = v; break;
    case "saveTel": {
      const input = [...document.querySelectorAll("input.tel")].find((i) => i.dataset.name === v);
      return manage({ action: "contact_set", name: v, phone: input.value },
        input.value.trim() ? `Numéro de ${esc(v)} enregistré.` : `Numéro de ${esc(v)} supprimé.`);
    }
  }
  render();
});

function readBatch() {
  const g = (id) => document.getElementById(id);
  if (!g("bFrom")) return;
  Object.assign(S.batch, {
    from: g("bFrom").value, to: g("bTo").value, start: g("bStart").value, end: g("bEnd").value,
    duration: Number(g("bDur").value), capacity: Number(g("bCap").value),
  });
  if (S.batch.from && (!S.batch.to || S.batch.to < S.batch.from)) { S.batch.to = S.batch.from; g("bTo").value = S.batch.from; }
}
const onBatch = (e) => {
  if (!e.target.matches("[data-batch]")) return;
  readBatch();
  if (S.fix) [0, 1, 2].forEach((i) => {
    const a = document.getElementById(`f${i}a`), b = document.getElementById(`f${i}b`);
    if (a && b) S.fixSets[i] = [a.value, b.value];
  });
  const box = document.getElementById("batchPreview");
  if (box) box.innerHTML = batchPreview();
};
document.addEventListener("input", onBatch);
document.addEventListener("change", onBatch);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.matches("input.tel")) document.querySelector(`[data-act="saveTel"][data-v="${CSS.escape(e.target.dataset.name)}"]`)?.click();
  if (e.target.id === "renameInput") document.querySelector('[data-act="renOk"]')?.click();
});

render();
load();
