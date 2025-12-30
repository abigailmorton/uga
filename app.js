// app.js
// UGA QB Name Generator (static-site friendly)
// Expects: names.json in the same folder as index.html

"use strict";

const $ = (sel) => document.querySelector(sel);

const els = {
  seed: $("#seed"),
  generate: $("#btn-generate"),
  copy: $("#btn-copy"),
  result: $("#result"),
  meta: $("#meta"),
};

let NAME_DATA = null;

// ---- Utilities ----

function normalizeSeed(s) {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

// Fast, simple deterministic hash for a string -> uint32
// (FNV-1a)
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Mulberry32 PRNG: deterministic from a uint32 seed
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function chance(p, rng) {
  return rng() < p;
}

function titleCaseWord(w) {
  if (!w) return w;
  // Preserve initials like "D. J." and apostrophes like "D'Wan"
  if (/[A-Z]\./.test(w) || w.includes("'")) return w;
  return w[0].toUpperCase() + w.slice(1);
}

function ensureNotRealFullName(full, rng, maxTries = 8) {
  // Optional: avoid accidentally outputting a real starter exactly.
  // If you do not care, you can delete this function and call.
  const realSet = NAME_DATA?.fullSet;
  if (!realSet) return full;

  let candidate = full;
  let tries = 0;

  while (realSet.has(candidate) && tries < maxTries) {
    const first = generateFirst(rng);
    const last = generateLast(rng);
    candidate = `${first} ${last}`;
    tries++;
  }

  return candidate;
}

// ---- Generation rules ----

// Some UGA-ish vibe knobs
const NICKNAMES = [
  "Stetson",
  "Gunner",
  "Hutson",
  "Greyson",
  "Carson",
  "Brock",
  "Jake",
  "Quincy",
  "Fran",
  "Zeke",
];

const SOUTHERN_FIRST = [
  "Beau",
  "Wade",
  "Tate",
  "Cade",
  "Hayes",
  "Rhett",
  "Boone",
  "Clay",
  "Tripp",
  "Jeb",
  "Cole",
  "Davis",
  "Parker",
  "Bennett",
  "Cooper",
  "Landon",
];

const INITIAL_SETS = [
  "D. J.",
  "A. J.",
  "J. T.",
  "J. R.",
  "T. J.",
  "C. J.",
];

const APOSTROPHE_FIRST = ["D'Wan", "D'Andre", "D'Angelo", "De'Quan", "La'Darius"];

function generateFirst(rng) {
  // 10%: initials
  if (chance(0.1, rng)) return pick(INITIAL_SETS, rng);

  // 6%: apostrophe style first name
  if (chance(0.06, rng)) return pick(APOSTROPHE_FIRST, rng);

  // 28%: nickname-y first
  if (chance(0.28, rng)) return pick(NICKNAMES, rng);

  // Otherwise from corpus first names, with a sprinkle of extra southern-first
  if (chance(0.2, rng)) return pick(SOUTHERN_FIRST, rng);

  return pick(NAME_DATA.first, rng);
}

function generateLast(rng) {
  // Mostly corpus last names
  let last = pick(NAME_DATA.last, rng);

  // Small chance to tweak spelling to feel "new" but plausible
  if (chance(0.12, rng)) {
    last = mutateSurname(last, rng);
  }
  return last;
}

function mutateSurname(last, rng) {
  // Very light-touch transformations:
  // - double a consonant
  // - add -son / -ton / -er / -man
  // - swap a vowel
  const base = last;

  const ops = [];

  ops.push(() => {
    // Double a random consonant (if exists)
    const idxs = [];
    for (let i = 0; i < base.length; i++) {
      if (/[bcdfghjklmnpqrstvwxyz]/i.test(base[i])) idxs.push(i);
    }
    if (!idxs.length) return base;
    const i = idxs[Math.floor(rng() * idxs.length)];
    return base.slice(0, i + 1) + base[i] + base.slice(i + 1);
  });

  ops.push(() => {
    // Add a suffix if not already ending similarly
    const suffixes = ["son", "ton", "er", "man", "well", "field"];
    const sfx = pick(suffixes, rng);
    if (base.toLowerCase().endsWith(sfx)) return base;
    return base + sfx;
  });

  ops.push(() => {
    // Swap a vowel
    const vowels = ["a", "e", "i", "o", "u"];
    const chars = base.split("");
    const vowelIdxs = [];
    for (let i = 0; i < chars.length; i++) {
      if (/[aeiou]/i.test(chars[i])) vowelIdxs.push(i);
    }
    if (!vowelIdxs.length) return base;
    const i = vowelIdxs[Math.floor(rng() * vowelIdxs.length)];
    const orig = chars[i];
    const repl = pick(vowels, rng);
    chars[i] = orig === orig.toUpperCase() ? repl.toUpperCase() : repl;
    return chars.join("");
  });

  const op = pick(ops, rng);
  const out = op();

  // If mutation looks too weird, fall back
  if (out.length > 18) return base;
  if (!/^[A-Za-z'.-]+$/.test(out)) return base;
  return out;
}

function generate(seedInput) {
  const seedNorm = normalizeSeed(seedInput);

  // If user provides a seed, deterministic; otherwise random-ish
  const seed =
    seedNorm.length > 0
      ? hash32(seedNorm.toLowerCase())
      : (crypto?.getRandomValues?.(new Uint32Array(1))?.[0] ?? Date.now()) >>> 0;

  const rng = mulberry32(seed);

  const first = titleCaseWord(generateFirst(rng));
  const last = titleCaseWord(generateLast(rng));
  let full = `${first} ${last}`;

  full = ensureNotRealFullName(full, rng);

  // Extra flavor: jersey number, class, hometown
  const number = 1 + Math.floor(rng() * 19); // 1–19 QB-ish
  const classYear = pick(["FR", "SO", "JR", "SR", "RS-SO", "RS-JR"], rng);
  const hometown = makeHometown(rng);

  return {
    full,
    meta: `QB${chance(0.55, rng) ? "1" : "2"} • #${number} • ${classYear} • ${hometown}`,
    seeded: seedNorm.length > 0,
  };
}

function makeHometown(rng) {
  // Not real, just vibes
  const towns = [
    "Valdosta, GA",
    "Rome, GA",
    "Marietta, GA",
    "Warner Robins, GA",
    "Cartersville, GA",
    "Macon, GA",
    "Dublin, GA",
    "Athens, GA",
    "Savannah, GA",
    "Albany, GA",
    "Augusta, GA",
    "Columbus, GA",
    "Tifton, GA",
    "Statesboro, GA",
    "Gainesville, GA",
    "Dothan, AL",
    "Pensacola, FL",
    "Chattanooga, TN",
  ];
  return pick(towns, rng);
}

// ---- UI ----

function setStatus(text) {
  els.meta.textContent = text;
}

function render() {
  if (!NAME_DATA) return;

  const out = generate(els.seed.value);
  els.result.textContent = out.full;
  els.meta.textContent = out.meta + (out.seeded ? " • (stable)" : " • (random)");
}

async function copyResult() {
  const text = els.result.textContent?.trim();
  if (!text || text === "Loading names…") return;

  try {
    await navigator.clipboard.writeText(text);
    const old = els.meta.textContent;
    setStatus(`${old} • copied`);
    window.setTimeout(() => {
      // remove the "copied" tag if unchanged
      if (els.meta.textContent.includes("• copied")) render();
    }, 900);
  } catch {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    const old = els.meta.textContent;
    setStatus(`${old} • copied`);
    window.setTimeout(() => {
      if (els.meta.textContent.includes("• copied")) render();
    }, 900);
  }
}

async function loadNames() {
  // If you host under a subpath (GitHub Pages project site), "./names.json" is correct.
  // If you later move names.json into /public, adjust path as needed.
  const res = await fetch("./names.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`names.json fetch failed: ${res.status}`);

  const data = await res.json();
  if (!data?.first?.length || !data?.last?.length) {
    throw new Error("names.json missing first/last arrays");
  }

  // Build a set of real full names if provided (optional).
  // If you generate names.json from Wikipedia, you can also include "full" list.
  const fullSet = new Set((data.full ?? []).map((s) => s.trim()).filter(Boolean));

  NAME_DATA = {
    first: data.first,
    last: data.last,
    fullSet,
  };
}

function wireEvents() {
  els.generate.addEventListener("click", render);
  els.copy.addEventListener("click", copyResult);

  // Enter in the input generates
  els.seed.addEventListener("keydown", (e) => {
    if (e.key === "Enter") render();
  });

  // Optional: generate live as they type (commented out)
  // els.seed.addEventListener("input", () => render());
}

(async function init() {
  try {
    wireEvents();
    await loadNames();
    render();
  } catch (err) {
    console.error(err);
    els.result.textContent = "Could not load names.json";
    els.meta.textContent =
      "Make sure names.json is in the same folder as index.html and app.js.";
  }
})();
