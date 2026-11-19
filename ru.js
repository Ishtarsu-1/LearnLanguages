// ============================================================
//  Mochi — ru.js : outils pour le russe
//  ruKey(texte) : clé de comparaison d'une réponse, tolérante. Une réponse tapée en cyrillique
//  (спасибо), en translittération à l'anglaise (spasibo, privet, khorosho) ou à la française
//  (spassibo, privièt, kharacho) donne la même clé : pas besoin d'un clavier russe.
//  On ramène tout à un squelette latin : chuintantes regroupées (ш щ ч → X), ж → J, х → H,
//  ц → C, voyelles mouillées sans leur « i/y », signes mou/dur retirés, ё = е, accents ignorés.
//  C'est volontairement indulgent : c'est une aide pour débutants, pas une dictée notée.
//  Script classique chargé dans l'ordre par index.html (après content.js).
// ============================================================
const RU_LAT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
function ruKey(text) {
  let s = String(text).toLowerCase().normalize("NFD").replace(/́/g, "").normalize("NFC"); // accent tonique (молоко́)
  s = [...s].map((c) => RU_LAT[c] ?? c).join("");
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // privièt → priviet
  return s
    .replace(/shch|chtch|sch|tch|ch|sh|tsch/g, "X") // ш щ ч (« ch » français = ш, anglais = ч)
    .replace(/zh|j/g, "J").replace(/kh|h|x/g, "H").replace(/ts|tz|c/g, "C")
    .replace(/ou/g, "u").replace(/w/g, "v").replace(/y/g, "i")
    .replace(/i(?=[aeiou])/g, "").replace(/ss/g, "s") // я ю ё е mouillés (ya/ia/a) ; « spassibo »
    .replace(/[^a-zXJHC]/g, "");
}
// Forme accentuée d'un lemme (pour le glossaire : молоко́), ou le lemme lui-même
const ruStressed = (lemma) => LEXICON.ru?.[lemma]?.st || lemma;
