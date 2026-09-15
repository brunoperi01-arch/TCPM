// Page juge-arbitre : validation des demandes, terrains, WhatsApp
// Les appels passent par /tournoi-interne/admin/api/* (même dossier que la page,
// ce qui garantit que le navigateur renvoie l'identifiant saisi).
import { POULES, TERRAINS, MOTIFS, FORM_URL, SIGNATURE, capOf, prenom, fmtPhone, verifierConfig } from "./config.js";
import { esc, btnData, fmtDay, fmtTime, header, api, onAction } from "./ui.js";

const API = "/tournoi-interne/admin/api";
const app = document.getElementById("app");
let requests = [];
let loaded = false, loadError = null, busy = false;
let S = { tab: "pending", val: null, court: null, refuse: null, refReason: null, cancel: null, msg: null, msgId: null, err: null };
const configErrors = verifierConfig();

async function load() {
  try { requests = (await api(`${API}/requests`)).requests; loadError = null; }
  catch (e) { loadError = e.message; }
  loaded = true; render();
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

function vAdmin() {
  const by = (s) => requests.filter((r) => s.includes(r.status));
  const pend = by(["pending"]), conf = by(["confirmed"]), other = by(["refused", "cancelled"]);
  const aPrevenir = [...conf, ...other].reduce((n, r) => n + toNotify(r), 0);
  const list = { pending: pend, confirmed: conf, other }[S.tab];
  const empty = { pending: "Aucune demande en attente.", confirmed: "Aucun match confirmé.", other: "Aucune demande refusée ou annulée." }[S.tab];
  const msgReq = S.msgId && requests.find((r) => r.id === S.msgId);
  return `
    <div class="toolbar"><button ${btnData("reload")}>↻ Actualiser</button><a href="${API}/export" download>Exporter CSV</a></div>
    ${configErrors.length ? `<div class="err">Configuration à corriger :<br>${configErrors.map(esc).join("<br>")}</div>` : ""}
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
    ${S.err ? `<div class="err">${esc(S.err)}</div>` : ""}
    ${S.msg ? `<div class="info">${S.msg}${msgReq ? waButtons(msgReq) : ""}</div>` : ""}
    ${list.length ? list.map(card).join("") : `<div class="empty">${empty}</div>`}`;
}

function render() {
  let body;
  if (!loaded) body = `<div class="loading">Chargement…</div>`;
  else if (loadError) body = `<div class="err">${esc(loadError)}</div><button class="cta dark" ${btnData("reload")}>Réessayer</button>`;
  else body = vAdmin();
  app.innerHTML = header("Administration") + `<main>${body}</main>` + `<div class="ball" aria-hidden="true"></div>`;
}

onAction(async (act, v, e) => {
  if (!["court", "reason", "wa"].includes(act)) { S.msg = null; S.msgId = null; S.err = null; }
  switch (act) {
    case "reload": loaded = false; render(); return load();
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
  }
  render();
});

render();
load();
