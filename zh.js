// ============================================================
//  Mochi — zh.js : outils pour le chinois
//  - zhPinyin(texte) : pinyin avec les tons, mot par mot, grâce au lexique (LEXICON.zh[mot].py)
//  - zhKey(texte)    : clé de comparaison : pinyin SANS tons, sans espaces ni ponctuation.
//    Une réponse tapée en caractères (我喝咖啡), en pinyin (wo he kafei, wǒ hē kāfēi, wo3 he1)
//    ou en mélange donne la même clé : pas besoin d'un clavier chinois pour faire les exercices.
//  Script classique chargé dans l'ordre par index.html (après content.js).
// ============================================================
const HAN_RE = /[㐀-鿿]/u;
// Découpe gloutonne (le mot connu le plus long d'abord, 4 caractères au plus)
function zhSplit(text) {
  const lex = LEXICON.zh || {}, chars = [...String(text)], out = [];
  for (let i = 0; i < chars.length;) {
    let hit = null;
    for (let n = Math.min(4, chars.length - i); n >= 1 && !hit; n--) { const w = chars.slice(i, i + n).join(""); if (lex[w]?.py) hit = w; }
    if (hit) { out.push({ w: hit, py: lex[hit].py }); i += [...hit].length; }
    else { out.push({ w: chars[i], py: null }); i++; }
  }
  return out;
}
const zhPinyin = (text) => zhSplit(text).map((x) => x.py ?? x.w).join(" ").replace(/\s+([，。！？、：；,.!?])/gu, "$1").replace(/\s+/g, " ").trim();
const zhKey = (text) => zhSplit(text).map((x) => x.py ?? x.w).join("")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[üv]/g, "u").replace(/[^a-z㐀-鿿]/gu, "");
// Pinyin d'un mot annoté (lemmes : « 十+八 » → « shí bā »)
const zhLemmaPy = (lemmas) => lemmas.map((l) => LEXICON.zh?.[l]?.py || zhPinyin(l)).join(" ");
