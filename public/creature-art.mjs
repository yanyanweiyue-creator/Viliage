const commonSvg = (species, body) => `
  <svg class="actor-art creature-${species}" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="animal-light-${species}" x1="18%" y1="8%" x2="86%" y2="92%">
        <stop offset="0" stop-color="#fff7df" stop-opacity=".42"/>
        <stop offset=".45" stop-color="#fff7df" stop-opacity=".05"/>
        <stop offset="1" stop-color="#14251f" stop-opacity=".18"/>
      </linearGradient>
    </defs>
    <ellipse class="model-shadow" cx="47" cy="65" rx="29" ry="5" fill="rgba(20,35,29,.52)" opacity=".18"/>
    <g class="actor-surface">${body}</g>
    <ellipse class="model-highlight" cx="49" cy="38" rx="32" ry="19" fill="url(#animal-light-${species})" opacity=".46" pointer-events="none"/>
  </svg>`;

const CREATURE_MARKUP = Object.freeze({
  rabbit: commonSvg("rabbit", `
    <g class="creature-tail"><circle cx="19" cy="45" r="9" fill="#f8f5eb" stroke="#3b554d" stroke-width="2"/></g>
    <g class="creature-body"><ellipse cx="48" cy="45" rx="29" ry="18" fill="#e9dfce" stroke="#3b554d" stroke-width="2.4"/></g>
    <g class="creature-leg leg-back"><ellipse cx="34" cy="60" rx="11" ry="5" fill="#d4c7b4" stroke="#3b554d" stroke-width="2"/></g>
    <g class="creature-leg leg-front"><ellipse cx="64" cy="59" rx="10" ry="5" fill="#d4c7b4" stroke="#3b554d" stroke-width="2"/></g>
    <g class="creature-head">
      <ellipse class="creature-ear ear-back" cx="57" cy="15" rx="6" ry="17" transform="rotate(-8 57 15)" fill="#dccdbb" stroke="#3b554d" stroke-width="2"/>
      <ellipse class="creature-ear ear-front" cx="70" cy="16" rx="6" ry="18" transform="rotate(8 70 16)" fill="#eadfce" stroke="#3b554d" stroke-width="2"/>
      <circle cx="65" cy="36" r="17" fill="#eadfce" stroke="#3b554d" stroke-width="2.4"/>
      <circle cx="70" cy="33" r="2.3" fill="#253c36"/><circle cx="82" cy="40" r="2.2" fill="#8d5d55"/>
    </g>`),
  deer: commonSvg("deer", `
    <g class="creature-body"><ellipse cx="43" cy="44" rx="30" ry="16" fill="#ba7b52" stroke="#3a5048" stroke-width="2.4"/><circle cx="34" cy="40" r="2" fill="#f5d5ae"/><circle cx="44" cy="35" r="2" fill="#f5d5ae"/></g>
    <g class="creature-leg leg-back"><path d="M27 53v14M37 55l-2 12" fill="none" stroke="#654632" stroke-width="5" stroke-linecap="round"/></g>
    <g class="creature-leg leg-front"><path d="M56 53v14M65 51l2 15" fill="none" stroke="#654632" stroke-width="5" stroke-linecap="round"/></g>
    <g class="creature-head">
      <path d="M64 39 70 21" stroke="#8a5938" stroke-width="8" stroke-linecap="round"/>
      <path class="creature-antler" d="M70 20 65 8m5 8 7-9m-4 10 9-2" fill="none" stroke="#584438" stroke-width="2.7" stroke-linecap="round"/>
      <path d="M67 24c8-6 19-2 18 6-1 8-9 13-18 9z" fill="#c98a5d" stroke="#3a5048" stroke-width="2.3"/>
      <path class="creature-ear" d="m70 23-8-9c-3 8 0 11 8 12m10-2 8-8c2 8-1 11-8 11" fill="#d39a70" stroke="#3a5048" stroke-width="2"/>
      <circle cx="78" cy="29" r="2" fill="#263b35"/><circle cx="85" cy="35" r="2" fill="#45352e"/>
    </g>`),
  sheep: commonSvg("sheep", `
    <g class="creature-leg leg-back"><path d="M31 51v15M41 52v14" fill="none" stroke="#5b5146" stroke-width="5" stroke-linecap="round"/></g>
    <g class="creature-leg leg-front"><path d="M57 52v14M66 50v16" fill="none" stroke="#5b5146" stroke-width="5" stroke-linecap="round"/></g>
    <g class="creature-body wool-cloud"><circle cx="28" cy="42" r="15" fill="#fbf7ea"/><circle cx="43" cy="36" r="18" fill="#fffaf0"/><circle cx="58" cy="40" r="17" fill="#f7f0df"/><circle cx="45" cy="49" r="19" fill="#fffaf0"/><path d="M17 43c1-19 20-27 31-20 15-7 32 5 29 20 3 17-14 25-28 21-16 7-34-3-32-21z" fill="none" stroke="#3c544d" stroke-width="2.4"/></g>
    <g class="creature-head"><path d="M63 34c17-6 25 3 21 17-3 10-16 13-23 4-5-7-4-17 2-21z" fill="#575047" stroke="#344a44" stroke-width="2.3"/><path class="creature-ear" d="m67 36-8-8c-3 7 0 11 8 11m12-3 8-7c2 8-1 11-8 11" fill="#766b5f" stroke="#344a44" stroke-width="2"/><circle cx="76" cy="43" r="2" fill="#f8f1dc"/></g>`),
  fox: commonSvg("fox", `
    <g class="creature-tail"><path d="M31 45C10 28 4 45 16 58c9 10 25 3 31-6" fill="#d96f42" stroke="#3b5049" stroke-width="2.4"/><path d="M14 53c6 9 15 10 22 5-7-1-11-6-14-12z" fill="#fff1d7"/></g>
    <g class="creature-body"><ellipse cx="52" cy="46" rx="26" ry="14" fill="#d96f42" stroke="#3b5049" stroke-width="2.4"/><path d="M45 52c8 5 18 6 27 1" fill="none" stroke="#f7c18f" stroke-width="5" stroke-linecap="round"/></g>
    <g class="creature-leg leg-back"><path d="M42 54v12" stroke="#684338" stroke-width="5" stroke-linecap="round"/></g><g class="creature-leg leg-front"><path d="M65 54v12" stroke="#684338" stroke-width="5" stroke-linecap="round"/></g>
    <g class="creature-head"><path d="M65 38 69 18l10 10 9-8 1 22c-4 11-18 14-24 3z" fill="#e47b49" stroke="#3b5049" stroke-width="2.4" stroke-linejoin="round"/><path d="m69 18 2 13 8-3zm20 2-3 13-7-5z" fill="#71443c"/><path d="M72 43c5 6 12 6 17 0-3 12-14 13-17 0z" fill="#fff2d8"/><circle cx="75" cy="36" r="2" fill="#293c37"/><circle cx="84" cy="36" r="2" fill="#293c37"/><circle cx="80" cy="43" r="2.3" fill="#3d302d"/></g>`),
  cow: commonSvg("cow", `
    <g class="creature-leg leg-back"><path d="M26 51v16M38 52v15" fill="none" stroke="#694d3c" stroke-width="5.5" stroke-linecap="round"/></g><g class="creature-leg leg-front"><path d="M60 52v15M71 49v18" fill="none" stroke="#694d3c" stroke-width="5.5" stroke-linecap="round"/></g>
    <g class="creature-body"><path d="M14 34c10-10 47-11 61 1l-2 23c-15 7-47 7-58-2z" fill="#f3e7d2" stroke="#354d46" stroke-width="2.4"/><path d="M25 31c-1 10 7 15 17 11 8-4 8-11 4-16m13 6c-7 4-6 13 3 16 5 1 9-1 13-5" fill="#6f493b" opacity=".9"/></g>
    <g class="creature-tail"><path d="M15 38 8 51" stroke="#5f483c" stroke-width="3" stroke-linecap="round"/><path d="m8 51-4 5" stroke="#5f483c" stroke-width="5" stroke-linecap="round"/></g>
    <g class="creature-head"><path d="M68 27c6-8 21-6 24 4l-2 20c-6 8-19 8-25 0z" fill="#f1dfc6" stroke="#354d46" stroke-width="2.4"/><path class="creature-ear" d="m70 30-10-5c0 8 4 10 11 9m16-4 8-6c2 7-1 10-8 10" fill="#b78468" stroke="#354d46" stroke-width="2"/><path d="M69 25c-3-7 2-11 7-9m10 9c4-7 0-11-5-10" fill="none" stroke="#d3b086" stroke-width="3" stroke-linecap="round"/><ellipse cx="78" cy="47" rx="11" ry="7" fill="#d69e8b"/><circle cx="73" cy="35" r="2" fill="#243b35"/><circle cx="84" cy="35" r="2" fill="#243b35"/></g>`),
  gull: commonSvg("gull", `
    <g class="creature-tail"><path d="m35 45-12 8 16-1" fill="#eff3ef" stroke="#35504a" stroke-width="2"/></g>
    <g class="creature-body"><ellipse cx="51" cy="43" rx="21" ry="10" fill="#f8faf6" stroke="#35504a" stroke-width="2.2"/></g>
    <path class="creature-wing wing-back" d="M48 42C36 20 20 17 10 25c13 3 22 14 31 24z" fill="#d9e4e4" stroke="#35504a" stroke-width="2.2"/>
    <path class="creature-wing wing-front" d="M52 42c12-22 29-25 38-17-13 3-22 14-31 24z" fill="#eef3f0" stroke="#35504a" stroke-width="2.2"/>
    <g class="creature-head"><circle cx="70" cy="40" r="9" fill="#fffdf7" stroke="#35504a" stroke-width="2"/><path d="m78 40 13 4-13 3z" fill="#dca64f" stroke="#35504a" stroke-width="1.5"/><circle cx="73" cy="37" r="1.7" fill="#203934"/></g>`),
  bird: commonSvg("bird", `
    <g class="creature-tail"><path d="m36 46-13 8 17-2" fill="#527c88" stroke="#304b48" stroke-width="2"/></g>
    <g class="creature-body"><ellipse cx="51" cy="44" rx="20" ry="11" fill="#6d98a2" stroke="#304b48" stroke-width="2.2"/><path d="M38 46c9 7 20 8 30 2" fill="none" stroke="#d8ece7" stroke-width="4" stroke-linecap="round"/></g>
    <path class="creature-wing wing-back" d="M48 42C37 20 21 18 12 26c13 3 21 13 29 23z" fill="#4f7b88" stroke="#304b48" stroke-width="2.2"/>
    <path class="creature-wing wing-front" d="M53 42c11-22 27-24 36-16-12 3-20 13-29 23z" fill="#83afb4" stroke="#304b48" stroke-width="2.2"/>
    <g class="creature-head"><circle cx="70" cy="39" r="9" fill="#7ca9ad" stroke="#304b48" stroke-width="2"/><path d="m78 40 11 3-11 3z" fill="#d6a44e" stroke="#304b48" stroke-width="1.5"/><circle cx="72" cy="36" r="1.7" fill="#19352f"/></g>`),
  villager: commonSvg("villager", `
    <g class="creature-body"><circle cx="48" cy="16" r="10" fill="var(--skin, #bd7955)" stroke="#314a44" stroke-width="2.2"/><path d="M35 29c6-6 20-6 26 0l2 25H33z" fill="var(--coat, #d27a5c)" stroke="#314a44" stroke-width="2.3" stroke-linejoin="round"/></g>
    <g class="creature-arm arm-back"><path d="m36 32-12 17" fill="none" stroke="var(--coat, #d27a5c)" stroke-width="7" stroke-linecap="round"/></g><g class="creature-arm arm-front"><path d="m60 32 12 17" fill="none" stroke="var(--coat, #d27a5c)" stroke-width="7" stroke-linecap="round"/></g>
    <g class="creature-leg leg-back"><path d="M42 52 35 68" fill="none" stroke="#39566b" stroke-width="7" stroke-linecap="round"/></g><g class="creature-leg leg-front"><path d="m54 52 7 16" fill="none" stroke="#39566b" stroke-width="7" stroke-linecap="round"/></g>
    <path d="M39 13c2-10 17-10 19 0-5-3-14-3-19 0z" fill="var(--hair, #4c372f)"/><circle cx="44" cy="17" r="1.4" fill="#243b35"/><circle cx="52" cy="17" r="1.4" fill="#243b35"/>`),
  dragon: commonSvg("dragon", `
    <g class="dragon-whiskers"><path d="M75 31c11-8 17-7 20-3M75 37c12 3 16 7 19 12" fill="none" stroke="#d7b85f" stroke-width="2" stroke-linecap="round"/></g>
    <g class="creature-body dragon-body"><path d="M10 47c15-20 23 14 38-5 13-17 17-3 27-8" fill="none" stroke="#3f9a9b" stroke-width="14" stroke-linecap="round"/><path d="M10 45c15-19 23 14 38-5 13-17 17-3 27-8" fill="none" stroke="#72c7bd" stroke-width="7" stroke-linecap="round"/><path d="M18 36 13 25l12 7m16 9-2-14 10 9m12-10 2-12 8 9" fill="#d7b85f" stroke="#326e72" stroke-width="2" stroke-linejoin="round"/></g>
    <g class="creature-head"><path d="M67 24c9-8 23-2 23 9s-13 19-24 11c-7-5-7-14 1-20z" fill="#65b8ad" stroke="#28575b" stroke-width="2.4"/><path class="creature-antler" d="m73 23-2-13m3 8 8-8m-2 15 7-11" fill="none" stroke="#d7b85f" stroke-width="2.8" stroke-linecap="round"/><circle cx="78" cy="30" r="2" fill="#193b3d"/><circle cx="88" cy="35" r="2" fill="#193b3d"/></g>`)
});

export const creatureSpecies = Object.freeze(Object.keys(CREATURE_MARKUP));

export function getCreatureMarkup(species) {
  return CREATURE_MARKUP[species] || CREATURE_MARKUP.bird;
}

export function createCreatureArt(documentRef, species, variant = 0) {
  const template = documentRef.createElement("template");
  template.innerHTML = getCreatureMarkup(species).trim();
  const artwork = template.content.firstElementChild;
  artwork.dataset.variant = String(variant);
  return artwork;
}
