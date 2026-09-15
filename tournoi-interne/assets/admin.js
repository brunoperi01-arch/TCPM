// Page juge-arbitre : validation des demandes, terrains, WhatsApp
// Les appels passent par /tournoi-interne/admin/api/* (même dossier que la page,
// ce qui garantit que le navigateur renvoie l'identifiant saisi).
import {
  POULES, LISTE_POULES, TERRAINS, MOTIFS, FORM_URL, SIGNATURE, prenom, fmtPhone, joueursDe,
  getPoule, estAVenir,
} from "./config.js";
import { esc, btnData, fmtDay, fmtShort, fmtTime, header, api, onAction } from "./ui.js";

const API = "/tournoi-interne/admin/api";
const app = document.getElementById("app");
let requests = [];
let D = { entries: {}, slots: [], contacts: {} };
let loaded = false, loadError = null, busy = false;
let S = { section: "demandes", tab: "pending", val: null, court: null, refuse: null, refReason: null, cancel: null,
  msg: null, msgId: null, err: null, pool: LISTE_POULES[0].id, poolText: "", rename: null, report: null,
  slotForm: { date: "", time: "18:00", capacity: 2 }, showPast: false, contactFilter: "missing" };

async function load() {
  try {
    const r = await api(`${API}/requests`);
    requests = r.requests; D = { entries: r.entries, slots: r.slots, contacts: r.contacts };
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
    S.val = S.court = S.refuse = S.refReason = S.cancel = null;
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
const catLabel = (c) => POULES[c]?.label ?? c;

function waMessage(r, side) {
  const moi = side === 1 ? r.player : r.opponent;
  const lui = side === 1 ? r.opponent : r.player;
  const quand = `${fmtDay(r.date).toLowerCase()} à ${fmtTime(r.time)}`;
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
    <div class="pool">${catLabel(r.category)}, ${esc(r.pool)}</div>
    <div class="when">${fmtDay(r.date)} à ${fmtTime(r.time)}</div>
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
  const list = { pending: pend, confirmed: conf, other }[S.tab];
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

function vPoules() {
  const p = getPoule(S.pool), list = D.entries[p.id] || [], mixte = p.categorie === "mixte";
  const chips = LISTE_POULES.map((x) => {
    const n = (D.entries[x.id] || []).length;
    return `<button class="chip pool ${x.id === S.pool ? "on" : ""}" ${btnData("pool", x.id)}>${x.nom.replace("Poule ", "")} <b>${n}</b></button>`;
  }).join("");
  const rows = list.map((name) => {
    const nReq = requestsForName(p.nom, name);
    const tels = joueursDe(name).map((j) => D.contacts[j]);
    const telTxt = tels.every(Boolean) ? `<span class="ok">✓ ${tels.map(fmtPhone).join(" · ")}</span>`
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
  return `<div class="chips pools">${chips}</div>
    <p class="q">${p.nom}</p>
    <p class="sub">${list.length} ${mixte ? "équipe" : "joueur"}${list.length > 1 ? "s" : ""}${list.length < 2 ? " · la poule reste fermée aux joueurs tant qu'il y a moins de 2 noms" : ""}</p>
    ${r ? `<div class="info">${r.added.length} ajouté${r.added.length > 1 ? "s" : ""}${r.existing.length ? `, ${r.existing.length} déjà présent${r.existing.length > 1 ? "s" : ""}` : ""}${r.phones ? `, ${r.phones} numéro${r.phones > 1 ? "s" : ""} enregistré${r.phones > 1 ? "s" : ""}` : ""}.
      ${r.errors.length ? `<div class="reason">${r.errors.map(esc).join("<br>")}</div>` : ""}</div>` : ""}
    <div class="list">${rows || `<div class="empty">Aucun nom pour l'instant.</div>`}</div>
    <div class="login">
      <p class="ask-title" style="margin-top:0">Ajouter ${mixte ? "des équipes" : "des joueurs"}</p>
      <textarea id="poolText" rows="5" placeholder="${mixte
        ? "Bruno Peri / Sophie Rossi ; 06 12 34 56 78 ; 06 98 76 54 32\nJean Dupont / Marie Martin"
        : "Bruno Peri ; 06 12 34 56 78\nJean Dupont"}">${esc(S.poolText)}</textarea>
      <p class="hint">Un ${mixte ? "binôme" : "joueur"} par ligne, copié depuis MOJA. Numéro facultatif après « ; »${mixte ? " (un par joueur)" : ""}.</p>
      <button class="cta" ${busy ? "disabled" : ""} ${btnData("addEntries")}>AJOUTER</button>
    </div>`;
}

/* ---------- Créneaux ---------- */
function vCreneaux() {
  const f = S.slotForm;
  const withStats = D.slots.map((s) => {
    const on = requests.filter((r) => r.date === s.date && r.time === s.time);
    return { ...s, conf: on.filter((r) => r.status === "confirmed").length,
      pend: on.filter((r) => r.status === "pending").length, total: on.length, future: estAVenir(s) };
  });
  const future = withStats.filter((s) => s.future), past = withStats.filter((s) => !s.future);
  const byDay = (arr) => {
    const g = {};
    arr.forEach((s) => (g[s.date] ||= []).push(s));
    return Object.entries(g).map(([d, list]) => `<p class="day">${fmtDay(d)}</p>` + list.map(slotRow).join("")).join("");
  };
  return `<div class="login">
      <p class="ask-title" style="margin-top:0">Ouvrir un créneau</p>
      <div class="grid3">
        <div class="field"><label for="sDate">Date</label><input id="sDate" type="date" value="${esc(f.date)}"></div>
        <div class="field"><label for="sTime">Heure</label><input id="sTime" type="time" step="900" value="${esc(f.time)}"></div>
        <div class="field"><label for="sCap">Terrains</label><select id="sCap">${TERRAINS.map((_, i) =>
          `<option ${f.capacity === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></div>
      </div>
      <p class="hint">Terrains = nombre maximum de matchs du tournoi en même temps (tenir compte des cours).</p>
      <button class="cta" ${busy ? "disabled" : ""} ${btnData("addSlot")}>OUVRIR CE CRÉNEAU</button>
    </div>
    ${future.length ? byDay(future) : `<div class="empty">Aucun créneau à venir.</div>`}
    ${past.length ? `<button class="toggle" ${btnData("past")}>${S.showPast ? "Masquer" : "Afficher"} les ${past.length} créneaux passés</button>
      ${S.showPast ? byDay(past) : ""}` : ""}`;
}
function slotRow(s) {
  return `<div class="slotrow ${s.active ? "" : "off"} ${s.future ? "" : "past"}">
    <b class="h">${fmtTime(s.time)}</b>
    <div class="grow"><small>${s.conf} / ${s.capacity} confirmés${s.pend ? ` · ${s.pend} en attente` : ""}${s.active ? "" : " · <em>masqué</em>"}</small></div>
    ${s.future ? `<div class="stepper">
        <button ${btnData("capMinus", s.id)} ${s.capacity <= Math.max(1, s.conf) ? "disabled" : ""} aria-label="Moins">−</button>
        <span>${s.capacity}</span>
        <button ${btnData("capPlus", s.id)} ${s.capacity >= TERRAINS.length ? "disabled" : ""} aria-label="Plus">+</button>
      </div>
      <button class="icon" ${btnData("toggleSlot", s.id)} aria-label="${s.active ? "Masquer" : "Afficher"}">${s.active ? "👁" : "🚫"}</button>` : ""}
    ${s.total ? "" : `<button class="icon" ${btnData("delSlot", s.id)} aria-label="Supprimer">🗑</button>`}
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

const SECTIONS = [["demandes", "Demandes"], ["poules", "Poules"], ["creneaux", "Créneaux"], ["numeros", "Numéros"]];
function vAdmin() {
  const pend = requests.filter((r) => r.status === "pending").length;
  const nav = `<nav class="nav">${SECTIONS.map(([k, l]) =>
    `<button class="${S.section === k ? "on" : ""}" ${btnData("section", k)}>${l}${k === "demandes" && pend ? ` <i>${pend}</i>` : ""}</button>`).join("")}</nav>`;
  const alerts = `${S.err ? `<div class="err">${esc(S.err)}</div>` : ""}${S.section !== "demandes" && S.msg ? `<div class="info">${S.msg}</div>` : ""}`;
  const views = { demandes: vDemandes, poules: vPoules, creneaux: vCreneaux, numeros: vNumeros };
  return nav + alerts + views[S.section]();
}

function render() {
  const ta = document.getElementById("poolText");
  if (ta) S.poolText = ta.value;
  let body;
  if (!loaded) body = `<div class="loading">Chargement…</div>`;
  else if (loadError) body = `<div class="err">${esc(loadError)}</div><button class="cta dark" ${btnData("reload")}>Réessayer</button>`;
  else body = vAdmin();
  app.innerHTML = header("Administration") + `<main>${body}</main>` + `<div class="ball" aria-hidden="true"></div>`;
}

const keep = ["court", "reason", "wa", "pool", "ren", "renX", "cf", "past"];
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

    /* Poules */
    case "pool": S.pool = v; S.report = null; S.rename = null; S.poolText = ""; break;
    case "addEntries": {
      S.poolText = document.getElementById("poolText").value;
      const r = await manage({ action: "entry_add", poolId: S.pool, text: S.poolText });
      if (r) { S.report = r; if (!r.errors.length) S.poolText = ""; render(); }
      return;
    }
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
    case "addSlot": {
      const f = { date: document.getElementById("sDate").value, time: document.getElementById("sTime").value,
        capacity: Number(document.getElementById("sCap").value) };
      S.slotForm = f;
      if (!f.date || !f.time) { S.err = "Choisissez une date et une heure."; break; }
      if (!estAVenir(f)) { S.err = "Ce créneau est déjà passé."; break; }
      const r = await manage({ action: "slot_add", ...f }, `Créneau ajouté : ${fmtShort(f.date)} à ${fmtTime(f.time)}.`);
      if (r) { S.slotForm = { ...f, time: "" }; render(); } // même date, prêt pour le suivant
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

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.matches("input.tel")) document.querySelector(`[data-act="saveTel"][data-v="${CSS.escape(e.target.dataset.name)}"]`)?.click();
  if (e.target.id === "renameInput") document.querySelector('[data-act="renOk"]')?.click();
});

render();
load();
