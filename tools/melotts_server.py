#!/usr/bin/env python3
"""Petit serveur de voix coréenne pour Mochi (MeloTTS, licence MIT).

Expose POST /v1/audio/speech (protocole « OpenAI audio/speech », réponse WAV),
ce que tts.js sait relayer. Voir SETUP.md, section « Vraies voix ».

    pip install git+https://github.com/myshell-ai/MeloTTS.git
    python -m unidic download
    python tools/melotts_server.py            # → http://127.0.0.1:8881/v1

Puis dans .env :  TTS_URL_KO=http://127.0.0.1:8881/v1   TTS_VOICES_KO=KR
MeloTTS n'a qu'une voix coréenne : Mochi la décline en plusieurs « locuteurs »
(hauteur et débit) pour l'écoute multi-voix.
"""
import json, os, tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

from melo.api import TTS

PORT = int(os.environ.get("PORT", "8881"))
model = TTS(language="KR", device=os.environ.get("DEVICE", "cpu"))
speakers = model.hps.data.spk2id
lock = Lock()  # le modèle n'est pas prévu pour des appels simultanés


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path.rstrip("/") != "/v1/audio/speech":
            return self.send_error(404)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0) or b"{}")
            text = str(body.get("input", "")).strip()[:300]
            voice = body.get("voice", "KR")
            if not text or voice not in speakers:
                return self.send_error(400, "texte vide ou voix inconnue")
            with tempfile.NamedTemporaryFile(suffix=".wav") as f, lock:
                model.tts_to_file(text, speakers[voice], f.name, speed=float(body.get("speed", 1.0)))
                data = open(f.name, "rb").read()
        except Exception as e:  # on renvoie une erreur propre, Mochi repassera sur la voix du navigateur
            return self.send_error(500, str(e)[:200])
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    print(f"MeloTTS coréen → http://127.0.0.1:{PORT}/v1 · voix : {', '.join(speakers)}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
