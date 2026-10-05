#!/usr/bin/env node
// Builds every image of the profile README and refreshes its language section.
//
//   node scripts/build.mjs             fetch live data from the GitHub API, then render
//   node scripts/build.mjs --no-fetch  render from scripts/data.json (after editing texts)
//
// No dependencies. Output is deterministic, so an unchanged profile produces no diff.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "assets");
const DATA_FILE = join(ROOT, "scripts", "data.json");

// ── Content ──────────────────────────────────────────────────────────────────

const USER = "AleksandrDruk";
const NAME = ["ALEKSANDR", "DRUK"];
const ROLE = ["WEB DEVELOPER", "WORDPRESS · PHP", "REACT · NEXT.JS"];

const STACK = {
  front: [
    ["HTML", "#e34f26"],
    ["CSS", "#2f7de1"],
    ["Sass", "#cf649a"],
    ["Tailwind", "#38bdf8"],
    ["Bootstrap", "#8a5cf5"],
    ["JavaScript", "#f7df1e"],
    ["TypeScript", "#3b8ee0"],
    ["React", "#61dafb"],
    ["Redux", "#8b5fd6"],
    ["Next.js", "#f2f0eb"],
  ],
  back: [
    ["PHP", "#8892bf"],
    ["WordPress", "#3a9bd9"],
    ["Node.js", "#6cc24a"],
    ["MongoDB", "#4db33d"],
  ],
  tools: [
    ["Git", "#f05032"],
    ["GitHub", "#f2f0eb"],
  ],
};

const LANGS_SHOWN = 6;

// ── Palette ──────────────────────────────────────────────────────────────────

const PANEL = "#101116";
const LINE = "#2a2c36";
const TEXT = "#ece8e1";
const MUTED = "#8b8d97";
// Firelight: from the white-hot core out to the cold edge of the night.
const FIRE = [
  [0.0, "#fff3cf"],
  [0.15, "#ffd98a"],
  [0.3, "#ffb454"],
  [0.48, "#f28a45"],
  [0.66, "#c9654a"],
  [0.82, "#8f5c63"],
  [1.0, "#5c5a78"],
];
// Languages by rank: hottest first, embers cooling down the list.
const RANK = ["#ffd166", "#ff9f43", "#f0643a", "#c53f3f", "#8a5a80", "#525b78"];

const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";
const REDUCED_MOTION = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";

// ── Helpers ──────────────────────────────────────────────────────────────────

const n = (v) => +v.toFixed(2);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function rect(x, y, w, h, fill, attrs = "") {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${attrs && " " + attrs}/>`;
}

// Small seeded PRNG: the "random" sparks land in the same place on every build.
function prng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ramp(stops, t) {
  t = Math.min(1, Math.max(0, t));
  const i = Math.max(1, stops.findIndex(([at]) => at >= t));
  const [t0, c0] = stops[i - 1];
  const [t1, c1] = stops[i];
  const k = (t - t0) / (t1 - t0);
  const ch = (c, o) => parseInt(c.slice(o, o + 2), 16);
  return "#" + [1, 3, 5].map((o) => Math.round(ch(c0, o) + (ch(c1, o) - ch(c0, o)) * k).toString(16).padStart(2, "0")).join("");
}

// Draws a bitmap: rows of characters, each mapped to a fill through `fills`.
function bitmap(rows, x, y, px, fills) {
  let out = "";
  rows.forEach((row, r) =>
    [...row].forEach((c, col) => {
      if (fills[c]) out += rect(x + col * px, y + r * px, px, px, fills[c]);
    }),
  );
  return out;
}

// ── Pixel art ────────────────────────────────────────────────────────────────

// 5×7 dot-matrix glyphs — only the letters the name needs.
const GLYPHS = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
};

// Four frames of the flame; digits run from the red edge (1) to the white core (5).
const FLAME = [
  ["....1....", "....2....", "...121...", "...232...", "..12321..", "..23432..", ".1234321.", ".2345432.", ".2345432.", ".1234321.", "..12321.."],
  ["...1.....", "...2.....", "...12....", "..1231...", "..12321..", "..23432..", ".1234321.", ".2345432.", ".2345432.", ".1234321.", "..12321.."],
  [".....1...", "....1....", "....21...", "...1321..", "...2332..", "..123421.", ".1234432.", ".2345432.", ".2345432.", ".1234321.", "..12321.."],
  [".........", "....1....", "...12....", "...2321..", "..123321.", "..234432.", ".12345421", ".23455432", ".2345432.", ".1234321.", "..12321.."],
];
const FLAME_FILLS = { 1: "#e5482f", 2: "#ff8a3c", 3: "#ffb454", 4: "#ffd166", 5: "#fff3cf" };

const TORCH = ["..ccccc..", "..mmmmm..", "...lws...", "...lws...", "...lws...", "...lws...", "...lws...", "...lws...", "...lws...", "...lws..."];
const TORCH_FILLS = { c: "#7b7f8c", m: "#474a55", l: "#b07a3f", w: "#8a5a2b", s: "#5a3a1c" };

const ICONS = {
  mail: ["#########", "##.....##", "#.#...#.#", "#..#.#..#", "#...#...#", "#.......#", "#########"],
  plane: [".........##", "......###.#", "...#####.#.", "#######.##.", ".#####.###.", "...##.###..", ".....####..", ".....####..", "......##...", "......##...", "......#...."],
  arrow: ["..#####", ".....##", "....#.#", "...#..#", "..#...#", ".#.....", "#......"],
};

// ── Hero ─────────────────────────────────────────────────────────────────────

function hero({ since, repos }) {
  const W = 960, H = 440;
  const P = 15; // one "pixel" of the wordmark
  const X0 = 56, Y1 = 84, Y2 = Y1 + 7 * P + 27;
  const Q = 8; // one pixel of the torch
  const torchX = X0 + (NAME[1].length * 6 - 1) * P + 37;
  const flameY = Y2 - 14;
  const fire = { x: torchX + 4.5 * Q, y: flameY + 7 * Q };
  const rand = prng(20231030);

  // Wordmark: every pixel takes its colour from how far it sits from the flame.
  const groups = ["", "", "", ""];
  NAME.forEach((word, line) =>
    [...word].forEach((letter, i) =>
      GLYPHS[letter].forEach((row, r) =>
        [...row].forEach((c, col) => {
          if (c !== "#") return;
          const x = X0 + (i * 6 + col) * P;
          const y = (line ? Y2 : Y1) + r * P;
          const d = Math.hypot(x + P / 2 - fire.x, y + P / 2 - fire.y);
          const fill = ramp(FIRE, d / 470 + (rand() - 0.5) * 0.07);
          groups[Math.floor(rand() * 4)] += rect(x + 1, y + 1, P - 2, P - 2, fill, 'rx="1.5"');
        }),
      ),
    ),
  );

  // Stars thin out near the fire, the way they do around any light.
  let stars = "";
  for (let i = 0; i < 90; i++) {
    const x = 24 + rand() * (W - 48), y = 20 + rand() * (H - 40);
    const far = Math.min(1, Math.max(0, (Math.hypot(x - fire.x, y - fire.y) - 190) / 330));
    if (rand() > far) continue;
    const s = rand() > 0.8 ? 3 : 2;
    stars += rect(x, y, s, s, "#7c88ad", `opacity="${n(0.25 + rand() * 0.55)}"${rand() > 0.72 ? ` class="tw" style="animation-delay:-${n(rand() * 4)}s"` : ""}`);
  }

  // Sparks: the outer group drifts sideways, the inner one rises and fades.
  let sparks = "";
  for (let i = 0; i < 16; i++) {
    const s = 3 + Math.floor(rand() * 3);
    const vars = `--x:${Math.round(-40 + rand() * 430)}px;--y:${-Math.round(120 + rand() * 150)}px;--t:${n(3.4 + rand() * 4)}s;--d:-${n(rand() * 7)}s`;
    const fill = ["#ffe08a", "#ffb454", "#ff8a3c"][Math.floor(rand() * 3)];
    sparks += `<g class="ex" style="${vars}">${rect(fire.x - 14 + rand() * 28, flameY + 6 + rand() * 22, s, s, fill, `class="ey" style="${vars}"`)}</g>`;
  }

  const flame = FLAME.map((frame, i) => `<g class="fr fr${i}">${bitmap(frame, torchX, flameY, Q, FLAME_FILLS)}</g>`).join("");
  const torch = bitmap(TORCH, torchX, flameY + FLAME[0].length * Q, Q, TORCH_FILLS);

  const label = (x, y, text, anchor = "start", fill = "#6f6d6b") =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}">${esc(text)}</text>`;
  const roleY = Y2 + 7 * P / 2 - 19;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${NAME.join(" ")} — ${ROLE.join(", ").toLowerCase()}">
<style>
text{font:600 12px ${MONO};letter-spacing:2.2px}
.k0{animation:fl 3.1s ease-in-out infinite}
.k1{animation:fl 2.3s ease-in-out -1.1s infinite}
.k2{animation:fl 4.3s ease-in-out -2s infinite}
.k3{animation:fl 1.9s ease-in-out -.6s infinite}
@keyframes fl{0%,100%{opacity:1}22%{opacity:.84}41%{opacity:.97}63%{opacity:.78}82%{opacity:.93}}
.glow{transform-origin:${n(fire.x)}px ${n(fire.y)}px;animation:gl 2.6s ease-in-out infinite}
@keyframes gl{0%,100%{opacity:.88;transform:scale(1)}30%{opacity:1;transform:scale(1.05)}55%{opacity:.74;transform:scale(.96)}80%{opacity:.95;transform:scale(1.02)}}
.fr{opacity:0;animation:fr .64s step-end infinite}
.fr0{opacity:1}.fr1{animation-delay:.16s}.fr2{animation-delay:.32s}.fr3{animation-delay:.48s}
@keyframes fr{0%{opacity:1}25%,100%{opacity:0}}
.tw{animation:tw 4s ease-in-out infinite}
@keyframes tw{50%{opacity:.08}}
.ex{animation:ex var(--t) cubic-bezier(.35,0,.85,.6) var(--d) infinite}
.ey{opacity:0;animation:ey var(--t) cubic-bezier(.1,.5,.4,1) var(--d) infinite}
@keyframes ex{to{transform:translateX(var(--x))}}
@keyframes ey{0%{opacity:0}9%{opacity:1}60%{opacity:.75}100%{opacity:0;transform:translateY(var(--y))}}
${REDUCED_MOTION}
</style>
<defs>
<clipPath id="card"><rect width="${W}" height="${H}" rx="22"/></clipPath>
<linearGradient id="night" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#11121a"/><stop offset="1" stop-color="#090a12"/></linearGradient>
<pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><rect x="11" y="11" width="2" height="2" fill="#1b1d27"/></pattern>
<radialGradient id="glow" cx="${n(fire.x)}" cy="${n(fire.y)}" r="440" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff9a4a" stop-opacity=".5"/><stop offset=".22" stop-color="#ff7a3a" stop-opacity=".2"/><stop offset=".58" stop-color="#d9482f" stop-opacity=".06"/><stop offset="1" stop-color="#d9482f" stop-opacity="0"/></radialGradient>
<radialGradient id="core" cx="${n(fire.x)}" cy="${n(fire.y)}" r="84" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd166" stop-opacity=".42"/><stop offset="1" stop-color="#ffd166" stop-opacity="0"/></radialGradient>
</defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="url(#night)"/>
<rect width="${W}" height="${H}" fill="url(#grid)"/>
${stars}
<g class="glow"><circle cx="${n(fire.x)}" cy="${n(fire.y)}" r="440" fill="url(#glow)"/><circle cx="${n(fire.x)}" cy="${n(fire.y)}" r="84" fill="url(#core)"/></g>
${label(X0, 50, "HI, I'M")}
${label(W - X0, 50, `ON GITHUB SINCE ${since}`, "end")}
${label(X0, H - 32, `GITHUB.COM/${USER.toUpperCase()}`)}
${label(W - X0, H - 32, `${repos} PUBLIC REPOS`, "end")}
${label(W - X0, roleY, ROLE[0], "end", TEXT)}
${ROLE.slice(1).map((line, i) => label(W - X0, roleY + 24 * (i + 1), line, "end", "#b39a80")).join("\n")}
${groups.map((g, i) => `<g class="k${i}">${g}</g>`).join("\n")}
${torch}
${flame}
${sparks}
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="21.5" fill="none" stroke="${LINE}"/>
</svg>
`;
}

// ── Chips, buttons, language bar ─────────────────────────────────────────────

function chip(label, dot, value = "") {
  const fs = 13, cw = fs * 0.6, h = 30;
  const tw = label.length * cw, vw = value.length * cw;
  const w = Math.round(28 + tw + (value ? 8 + vw : 0) + 13);
  const text = (x, len, fill, s) => `<text x="${n(x)}" y="19.5" fill="${fill}" textLength="${n(len)}" lengthAdjust="spacing">${esc(s)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(`${label} ${value}`.trim())}">
<style>text{font:500 ${fs}px ${MONO}}</style>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="8" fill="${PANEL}" stroke="${LINE}"/>
${rect(12, 11, 8, 8, dot, 'rx="1.5"')}
${text(28, tw, TEXT, label)}${value ? text(36 + tw, vw, MUTED, value) : ""}
</svg>
`;
}

// Group labels carry no fill, so they sit on the page itself in both themes.
function tag(label) {
  const fs = 11, cw = fs * 0.6 + 1.6, h = 30;
  const tw = label.length * cw - 1.6;
  const w = Math.round(tw + 14);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
<style>text{font:600 ${fs}px ${MONO};letter-spacing:1.6px}</style>
<text x="2" y="19" fill="${MUTED}">${esc(label.toUpperCase())}</text>
</svg>
`;
}

function button(label, icon, primary) {
  const fs = 13, ls = 2, cw = fs * 0.6 + ls, h = 44, px = 2;
  const iw = ICONS[icon][0].length * px, ih = ICONS[icon].length * px;
  const tw = label.length * cw - ls;
  const aw = ICONS.arrow[0].length * px;
  const w = Math.round(18 + iw + 12 + tw + 14 + aw + 18);
  const ink = primary ? "#1d1206" : TEXT;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
<style>text{font:700 ${fs}px ${MONO};letter-spacing:${ls}px}</style>
<defs><linearGradient id="hot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd98a"/><stop offset=".55" stop-color="#ffab4d"/><stop offset="1" stop-color="#f6803c"/></linearGradient></defs>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="11" fill="${primary ? "url(#hot)" : PANEL}" stroke="${primary ? "#ffd98a" : "#3b3d49"}"/>
${bitmap(ICONS[icon], 18, (h - ih) / 2, px, { "#": primary ? ink : "#ffb454" })}
<text x="${18 + iw + 12}" y="26.5" fill="${ink}">${esc(label)}</text>
${bitmap(ICONS.arrow, w - 18 - aw, (h - 14) / 2, px, { "#": primary ? ink : MUTED })}
</svg>
`;
}

function languages(bytes) {
  const top = Object.entries(bytes).sort((a, b) => b[1] - a[1]).slice(0, LANGS_SHOWN);
  const total = top.reduce((sum, [, size]) => sum + size, 0);
  return top.map(([name, size], i) => {
    const pct = (size / total) * 100;
    return { name, share: size / total, label: pct < 0.1 ? "<0.1%" : pct.toFixed(1) + "%", color: RANK[i] };
  });
}

// One block per 1/60 of the code; every language shown keeps at least one.
// The dark track keeps the pale end of the scale readable on a white page.
function bar(langs) {
  const N = 60, BW = 13, GAP = 3, BH = 24, PAD = 7;
  const blocks = langs.map((l) => Math.max(1, Math.floor(l.share * N)));
  const byRemainder = langs.map((l, i) => [i, l.share * N - Math.floor(l.share * N)]).sort((a, b) => b[1] - a[1]);
  for (let k = 0, sum = blocks.reduce((a, b) => a + b); sum !== N; k++) {
    const i = sum < N ? byRemainder[k % langs.length][0] : blocks.indexOf(Math.max(...blocks));
    blocks[i] += sum < N ? 1 : -1;
    sum += sum < N ? 1 : -1;
  }
  let out = "", at = 0;
  blocks.forEach((count, i) => {
    for (let k = 0; k < count; k++, at++) out += rect(PAD + at * (BW + GAP), PAD, BW, BH, langs[i].color, `rx="2.5" class="b" style="animation-delay:${at * 16}ms"`);
  });
  const W = N * (BW + GAP) - GAP + PAD * 2, H = BH + PAD * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(langs.map((l) => `${l.name} ${l.label}`).join(", "))}">
<style>.b{animation:on .5s ease-out both}@keyframes on{from{opacity:0;transform:translateY(8px)}}${REDUCED_MOTION}</style>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="9" fill="${PANEL}" stroke="${LINE}"/>
${out}
</svg>
`;
}

// ── Data ─────────────────────────────────────────────────────────────────────

async function api(path) {
  const headers = { "User-Agent": USER, Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API answered ${res.status} for ${path}`);
  return res.json();
}

async function fetchData() {
  const user = await api(`/users/${USER}`);
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await api(`/users/${USER}/repos?per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  const languages = {};
  for (const repo of repos.filter((r) => !r.fork)) {
    for (const [name, size] of Object.entries(await api(`/repos/${repo.full_name}/languages`))) {
      languages[name] = (languages[name] ?? 0) + size;
    }
  }
  return { since: new Date(user.created_at).getUTCFullYear(), repos: user.public_repos, languages };
}

// ── Build ────────────────────────────────────────────────────────────────────

async function write(path, content) {
  await mkdir(dirname(join(ASSETS, path)), { recursive: true });
  await writeFile(join(ASSETS, path), content);
}

let data;
if (process.argv.includes("--no-fetch")) {
  data = JSON.parse(await readFile(DATA_FILE, "utf8"));
} else {
  data = await fetchData();
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
}

await write("hero.svg", hero(data));

for (const [group, items] of Object.entries(STACK)) {
  await write(`stack/_${group}.svg`, tag(group));
  for (const [label, color] of items) await write(`stack/${slug(label)}.svg`, chip(label, color));
}

await write("contact/email.svg", button("E-MAIL", "mail", true));
await write("contact/telegram.svg", button("TELEGRAM", "plane", false));

const langs = languages(data.languages);
await rm(join(ASSETS, "langs"), { recursive: true, force: true });
await write("langs/bar.svg", bar(langs));
for (const [i, l] of langs.entries()) await write(`langs/${i + 1}.svg`, chip(l.name, l.color, l.label));

const section = [
  `<img src="assets/langs/bar.svg" width="100%" alt="${esc(langs.map((l) => `${l.name} ${l.label}`).join(", "))}">`,
  "<br>",
  ...langs.map((l, i) => `<img src="assets/langs/${i + 1}.svg" height="30" alt="${esc(`${l.name} ${l.label}`)}">`),
].join("\n");
const readmeFile = join(ROOT, "README.md");
const readme = await readFile(readmeFile, "utf8");
const marked = /(<!-- langs:start -->\n)[\s\S]*?(<!-- langs:end -->)/;
if (!marked.test(readme)) throw new Error("README.md has lost its <!-- langs:start --> / <!-- langs:end --> markers");
await writeFile(readmeFile, readme.replace(marked, `$1${section}\n$2`));

console.log(`Built ${langs.map((l) => `${l.name} ${l.label}`).join(" · ")}`);
