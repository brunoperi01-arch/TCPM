// Outils d'affichage communs (navigateur)
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const btnData = (act, v = "") => `data-act="${act}" data-v="${esc(v)}"`;

const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const d12 = (d) => new Date(d + "T12:00:00");
export const fmtDay = (d) => cap1(d12(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
export const fmtShort = (d) => d12(d).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" });
export const fmtTime = (t) => String(t).replace(":", "h");

export function header(label, extra = "") {
  return `<header class="top">
    <div class="club">${label}</div>
    <h1><span class="t1">Tournoi</span><span class="t2">Interne</span></h1>
    <svg class="swoosh" viewBox="0 0 230 18" aria-hidden="true"><defs><linearGradient id="sw" x1="0" x2="1"><stop offset="0" stop-color="#4fb3ff" stop-opacity="0"/><stop offset=".35" stop-color="#4fb3ff"/><stop offset="1" stop-color="#bfe6ff" stop-opacity=".2"/></linearGradient></defs><path d="M4 14 C60 9 140 5 226 3 L224 7 C150 8 80 12 6 16 Z" fill="url(#sw)"/></svg>
    ${extra}
  </header>`;
}

export function matchCard(catLabel, poolNom, a, b, date, time, end) {
  return `<div class="vs">
    <div class="cat"><span>${esc(catLabel)}</span><span>${esc(poolNom)}</span></div>
    <div class="side">${esc(a)}</div><div class="x">VS</div><div class="side">${esc(b)}</div>
    <div class="when"><span>${fmtDay(date)}${end ? `<br><small>jusqu'à ${fmtTime(end)}</small>` : ""}</span><b>${fmtTime(time)}</b></div></div>`;
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) {
    const err = new Error(data.error || (res.status === 401 ? "Accès refusé." : "Connexion impossible. Réessayez."));
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Délégation des clics sur [data-act] */
export function onAction(handler) {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    handler(el.dataset.act, el.dataset.v, e);
  });
}
