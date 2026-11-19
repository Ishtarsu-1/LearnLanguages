#!/usr/bin/env python3
"""Listes de fréquence pour le plan de contenu (CONTENU-PIPELINE, lot C3). Export unique.

    uv venv --python 3.12 ~/mochi-nlp && source ~/mochi-nlp/bin/activate
    uv pip install wordfreq simplemma kiwipiepy xlrd
    python tools/freq_export.py                       # écrit content/freq/en.tsv et ko.tsv
    python tools/freq_export.py --nikl liste.xls      # coréen : niveaux officiels du fichier 국립국어원

Format (TSV, commentaires « # ») : lemme  rang  niveau  pos  cog

Anglais : 6 000 premiers mots de wordfreq, ramenés au lemme (simplemma) et fusionnés.
  Niveau estimé par le rang (A1 < 500, A2 < 1500, B1 < 3000, sinon B2).
  cog = 1 : mot transparent pour un francophone (même mot en français, aux accents et
  suffixes réguliers près : -tion, -ty/-té, -ous/-eux, -ic/-ique…). Heuristique, à relire :
  les marques cog/faux du lexique Mochi l'emportent.
Coréen : les 5 965 mots du « 한국어 학습용 어휘 목록 » (국립국어원, 2003), classés par la
  fréquence wordfreq (radical pour les verbes en -다). Niveau : celui du fichier officiel avec
  --nikl, sinon estimé par tranches de rang calées sur les effectifs officiels
  (A : 982 mots, B : 2 111, C : 2 872).
"""
import argparse, json, os, re, sys, unicodedata, urllib.request

import math

from wordfreq import get_frequency_dict, top_n_list

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "content", "freq")
# Liste du 국립국어원 dans l'ordre de fréquence (Wiktionnaire coréen, page « 자주 쓰이는 한국어 낱말 5800 »)
NIKL_FREQ_URL = "https://ko.wiktionary.org/w/index.php?title=%EB%B6%80%EB%A1%9D:%EC%9E%90%EC%A3%BC_%EC%93%B0%EC%9D%B4%EB%8A%94_%ED%95%9C%EA%B5%AD%EC%96%B4_%EB%82%B1%EB%A7%90_5800&action=raw"


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# Correspondances régulières anglais → français (pour repérer les mots transparents)
COG_RULES = [
    (r"tion$", "tion"), (r"sion$", "sion"), (r"ty$", "te"), (r"ous$", "eux"), (r"ic$", "ique"), (r"ical$", "ique"),
    (r"(?<=.....)y$", "ie"), (r"or$", "eur"), (r"er$", "re"), (r"ism$", "isme"), (r"ist$", "iste"), (r"ive$", "if"),
    (r"ary$", "aire"), (r"ory$", "oire"), (r"ence$", "ence"), (r"ance$", "ance"), (r"ment$", "ment"), (r"al$", "el"),
    (r"ize$", "iser"), (r"ate$", "er"),
]


def zipf(freqs, w):
    f = freqs.get(w, 0)
    return math.log10(f * 1e9) if f > 0 else 0.0


def is_cognate(w, en, fr):
    """Transparent : même mot en français (accents ôtés) ou suffixe régulier. On écarte les mots
    anglais présents dans les textes français (« the », « with ») : le mot doit y être au moins aussi
    courant qu'attendu pour un mot français, pas un emprunt marginal."""
    if len(w) < 4:
        return False
    import simplemma
    zen = zipf(en, w)
    if zipf(fr, w) >= max(2.5, zen - 0.7) and simplemma.is_known(w, lang="fr"):
        return True
    for pat, rep in COG_RULES:
        if re.search(pat, w):
            c = re.sub(pat, rep, w)
            if c != w and zipf(fr, c) >= 3.0 and simplemma.is_known(c, lang="fr"):
                return True
    return False


# Noms propres et mots grossiers fréquents dans les corpus, inutiles pour le plan
NOT_LEMMA = {"john", "york", "fuck", "shit", "damn", "london", "trump", "obama", "america", "uk", "usa", "jesus", "god", "christmas", "facebook", "google", "twitter", "youtube", "instagram", "iphone", "david", "michael", "james", "robert", "george", "mary", "william", "richard", "thomas", "charles", "steve", "chris", "jack", "tom", "paul", "peter"}


def export_en(n=6000):
    import simplemma
    fr = {}
    for w, f in get_frequency_dict("fr").items():
        if w.isalpha():
            k = strip_accents(w)
            fr[k] = fr.get(k, 0) + f
    en = get_frequency_dict("en")
    lex = json.load(open(os.path.join(ROOT, "content", "lexicon", "en.json"), encoding="utf-8"))
    seen, rows = {}, []
    for w in top_n_list("en", n * 2):
        if not re.fullmatch(r"[a-z]+(?:'[a-z]+)?", w) or "'" in w:
            continue
        lem = simplemma.lemmatize(w, lang="en").lower()
        if lem in seen or not simplemma.is_known(lem, lang="en") or lem in NOT_LEMMA:
            continue
        seen[lem] = True
        rows.append(lem)
        if len(rows) >= n:
            break
    out = []
    for i, lem in enumerate(rows, 1):
        level = "A1" if i <= 500 else "A2" if i <= 1500 else "B1" if i <= 3000 else "B2"
        e = lex.get(lem, {})
        cog = bool(e.get("cog")) if "cog" in e or e.get("faux") else is_cognate(lem, en, fr)
        if e.get("faux"):
            cog = False
        out.append((lem, i, level, "", "1" if cog else ""))
    head = [
        "# Fréquences anglaises pour Mochi (CONTENU-PIPELINE, lot C3), générées par tools/freq_export.py",
        "# Source : wordfreq (Robyn Speer et al.), données CC BY-SA 4.0 — https://github.com/rspeer/wordfreq",
        "# Lemmes : simplemma (MIT). Niveau estimé par le rang. cog = mot transparent pour un francophone (heuristique).",
        "lemme\trang\tniveau\tpos\tcog",
    ]
    write("en.tsv", head, out)


KIWI_POS = {"NNG": "명사", "NNP": "명사", "NNB": "의존명사", "NP": "대명사", "NR": "수사", "VV": "동사", "VA": "형용사",
            "VX": "보조용언", "MM": "관형사", "MAG": "부사", "MAJ": "부사", "IC": "감탄사", "VCP": "조사", "VCN": "형용사"}


PARTICLES = {"이", "가", "은", "는", "을", "를", "에", "에서", "도", "의", "와", "과", "하고", "로", "으로", "랑", "이랑", "한테", "께", "에게", "부터", "까지", "만", "보다", "처럼", "마다", "이다"}


def read_nikl(path):
    """Fichier officiel (.xls / .csv) : colonnes 순위, 단어, 품사, 등급 (noms détectés)."""
    rows = []
    if path.endswith(".xls") or path.endswith(".xlsx"):
        import xlrd
        sh = xlrd.open_workbook(path).sheet_by_index(0)
        table = [[str(c.value).strip() for c in sh.row(r)] for r in range(sh.nrows)]
    else:
        import csv
        table = list(csv.reader(open(path, encoding="utf-8-sig")))
    head = table[0]
    col = lambda name: next(i for i, h in enumerate(head) if name in h)
    iw, ip, il = col("단어"), col("품사"), col("등급")
    for r in table[1:]:
        if len(r) > il and r[iw]:
            rows.append((re.sub(r"\d+$", "", r[iw]), r[ip], r[il]))
    return rows


def export_ko(nikl=None):
    """Ordre : fréquence d'usage du 국립국어원 (via le Wiktionnaire). Niveaux : fichier officiel
    (--nikl) s'il est fourni, sinon tranches de rang calées sur les effectifs officiels."""
    from kiwipiepy import Kiwi
    kiwi = Kiwi()
    raw = urllib.request.urlopen(urllib.request.Request(NIKL_FREQ_URL, headers={"User-Agent": "mochi-freq-export"}), timeout=30).read().decode("utf-8")
    words = []
    for m in re.finditer(r"^:\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", raw, re.M):
        w = re.sub(r"\d+$", "", m.group(1).strip())
        if w and w not in words:
            words.append(w)
    official = {w: (pos, lvl) for w, pos, lvl in read_nikl(nikl)} if nikl else {}
    out = []
    for i, w in enumerate(words, 1):
        pos, lvl = official.get(w, ("", ""))
        lvl = lvl or ("A" if i <= 982 else "B" if i <= 982 + 2111 else "C")
        if not pos and w.endswith("다"):
            pos = "동사/형용사"  # Kiwi hors contexte se trompe souvent sur ce point
        if not pos:
            toks = kiwi.tokenize(w)
            pos = KIWI_POS.get(str(toks[0].tag).split("-")[0], "") if toks else ""
        out.append((w, i, lvl, pos, ""))
    head = [
        "# Vocabulaire coréen pour Mochi (CONTENU-PIPELINE, lot C3), généré par tools/freq_export.py",
        "# Liste et ordre de fréquence : 국립국어원 « 한국어 학습용 어휘 목록 » (공공누리 제1유형, mention de la source),",
        "#   recopiée dans l'ordre de fréquence par le Wiktionnaire coréen (« 자주 쓰이는 한국어 낱말 5800 », CC BY-SA). Particules exclues.",
        "# Niveau A/B/C : " + ("fichier officiel." if nikl else "ESTIMÉ par le rang (982 / 2 111 / 2 872) ; relancer avec --nikl <fichier .xls> pour les niveaux officiels."),
        "lemme\trang\tniveau\tpos\tcog",
    ]
    write("ko.tsv", head, out)


def write(name, head, rows):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write("\n".join(head) + "\n")
        for r in rows:
            f.write("\t".join(str(x) for x in r) + "\n")
    print(f"content/freq/{name} : {len(rows)} lemmes")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", choices=["en", "ko"])
    ap.add_argument("--nikl", help="fichier officiel 국립국어원 (.xls ou .csv) pour les niveaux du coréen")
    a = ap.parse_args()
    if a.lang in (None, "en"):
        export_en()
    if a.lang in (None, "ko"):
        export_ko(a.nikl)
