// Docs pages: theme, code highlighting and copy buttons, the phone menu, and search.
import { highlight } from "./highlight.js";

// theme (shared with the home page)
const themeBtn = document.querySelector("[data-theme-toggle]");
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === "light" ? "☾" : "☀";
  themeBtn.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme");
  try { localStorage.setItem("tl-theme", t); } catch { /* storage blocked */ }
}
let saved = null;
try { saved = localStorage.getItem("tl-theme"); } catch { /* storage blocked */ }
setTheme(saved ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
themeBtn.onclick = () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");

// code: highlight and a copy button on each block
document.querySelectorAll(".doc pre code").forEach((code) => {
  const raw = code.textContent;
  highlight(code);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy-code";
  btn.textContent = "Copy";
  btn.onclick = async () => {
    try { await navigator.clipboard.writeText(raw); btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1500); } catch { /* clipboard blocked */ }
  };
  code.parentElement.append(btn);
});

// phone menu
const menu = document.querySelector(".menu");
const sidebar = document.getElementById("sidebar");
menu.onclick = () => {
  const open = sidebar.classList.toggle("open");
  menu.setAttribute("aria-expanded", String(open));
  menu.textContent = open ? "Close" : "Menu";
};
document.querySelector(".sidebar .pages").addEventListener("click", () => { sidebar.classList.remove("open"); menu.setAttribute("aria-expanded", "false"); menu.textContent = "Menu"; });

// search over the docs: headings count more than text
const input = document.getElementById("search");
const results = document.getElementById("results");
let index = null;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
async function run() {
  const q = input.value.trim().toLowerCase();
  if (!q) { results.hidden = true; results.innerHTML = ""; return; }
  index ??= await fetch("/docs/search.json").then((r) => r.json()).catch(() => []);
  const words = q.split(/\s+/).filter(Boolean);
  const hits = index.map((e) => {
    const t = e.t.toLowerCase(), x = e.x.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score += 10;
      else if (x.includes(w)) score += 2;
      else return null;
    }
    return { e, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 8);
  results.hidden = false;
  results.innerHTML = hits.length
    ? hits.map(({ e }) => `<a href="${e.p === "index" ? "/docs/" : `/docs/${e.p}/`}${e.id ? "#" + e.id : ""}"><strong>${esc(e.t)}</strong><span>${esc(e.pt)}${e.x ? " · " + esc(e.x.slice(0, 90)) : ""}</span></a>`).join("")
    : `<p class="none">Nothing found for “${esc(q)}”.</p>`;
}
input.addEventListener("input", run);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") results.querySelector("a")?.click();
  if (e.key === "Escape") { input.value = ""; run(); }
});
// "/" focuses search
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== input && !/input|textarea/i.test(document.activeElement?.tagName ?? "")) { e.preventDefault(); input.focus(); }
});
