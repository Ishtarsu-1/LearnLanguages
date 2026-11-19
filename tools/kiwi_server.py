#!/usr/bin/env python3
"""Analyseur morphologique coréen pour Mochi (Kiwi / kiwipiepy, licence LGPL-3.0).

Expose POST /analyze { "text": "..." } → { "tokens": [ ... ] }, utilisé par
tools/annotate.js pour produire le format annoté de Mochi (CONTENU-PIPELINE, lot C2).
Chaque token : { surface, lemma, pos, is_particle, start, len }
  - surface : forme du morphème (peut différer du texte : 했 → 하 + 었)
  - lemma   : forme de base (먹 → 먹다), sinon la forme
  - pos     : étiquette Sejong de Kiwi (NNG, VV, JKS, EF…)
  - start / len : position dans le texte d'origine (pour retrouver les mots)
GET /health → { "ok": true }

    uv venv --python 3.12 ~/mochi-nlp && source ~/mochi-nlp/bin/activate
    uv pip install kiwipiepy
    python tools/kiwi_server.py                # → http://127.0.0.1:8882

Puis dans .env (facultatif, c'est la valeur par défaut) : KIWI_URL=http://127.0.0.1:8882
N'écoute que sur 127.0.0.1 : jamais exposé sur le réseau.
"""
import json, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

from kiwipiepy import Kiwi

PORT = int(os.environ.get("PORT", "8882"))
kiwi = Kiwi()
lock = Lock()  # Kiwi est sûr en lecture, mais on reste prudent et l'appel est rapide
MAX_TEXT = 20000


def analyze(text):
    with lock:
        tokens = kiwi.tokenize(text)
    out = []
    for t in tokens:
        tag = str(t.tag)
        out.append({
            "surface": t.form,
            "lemma": getattr(t, "lemma", None) or t.form,
            "pos": tag,
            "is_particle": tag.startswith("J"),
            "start": t.start,
            "len": t.len,
        })
    return out


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            return self._json(200, {"ok": True, "engine": "kiwi"})
        self.send_error(404)

    def do_POST(self):
        if self.path.rstrip("/") != "/analyze":
            return self.send_error(404)
        try:
            n = int(self.headers.get("Content-Length", 0) or 0)
            if n > MAX_TEXT * 4:
                return self._json(413, {"error": "texte trop long"})
            body = json.loads(self.rfile.read(n) or b"{}")
            text = str(body.get("text", ""))[:MAX_TEXT]
            if not text.strip():
                return self._json(400, {"error": "texte vide"})
            return self._json(200, {"tokens": analyze(text)})
        except Exception as e:  # erreur propre : annotate.js l'affiche
            return self._json(500, {"error": str(e)})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Kiwi prêt → http://127.0.0.1:{PORT}/analyze")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
