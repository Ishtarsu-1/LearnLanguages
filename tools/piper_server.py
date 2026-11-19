#!/usr/bin/env python3
"""Petit serveur de voix pour Mochi avec Piper (licence MIT) : voix russes.

Expose POST /v1/audio/speech (protocole « OpenAI audio/speech », réponse WAV),
ce que tts.js sait relayer. Voir SETUP.md, section « Vraies voix ».

    uv venv --python 3.12 ~/piper && source ~/piper/bin/activate
    uv pip install piper-tts
    # voix : fichiers .onnx + .onnx.json dans ~/piper/voices (voir SETUP.md)
    python tools/piper_server.py              # → http://127.0.0.1:8883/v1

Puis dans .env :  TTS_URL_RU=http://127.0.0.1:8883/v1   TTS_VOICES_RU=irina,denis,dmitri,ruslan
Le nom d'une voix est la partie du milieu du fichier : ru_RU-irina-medium.onnx → « irina ».
Rapide sur processeur (une phrase courte en une fraction de seconde). N'écoute que sur 127.0.0.1.
"""
import glob, io, json, os, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

from piper import PiperVoice, SynthesisConfig

PORT = int(os.environ.get("PORT", "8883"))
VOICES_DIR = os.path.expanduser(os.environ.get("PIPER_VOICES", "~/piper/voices"))
voices = {}
for path in sorted(glob.glob(os.path.join(VOICES_DIR, "*.onnx"))):
    parts = os.path.basename(path)[: -len(".onnx")].split("-")
    name = parts[1] if len(parts) >= 3 else parts[0]
    voices[name] = PiperVoice.load(path)
if not voices:
    raise SystemExit(f"Aucune voix dans {VOICES_DIR} (fichiers .onnx + .onnx.json, voir SETUP.md).")
lock = Lock()  # une génération à la fois (Mochi met déjà les demandes en file)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.rstrip("/") in ("/v1/audio/voices", "/health"):
            body = json.dumps({"voices": [{"id": v, "name": v} for v in voices]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        self.send_error(404)

    def do_POST(self):
        if self.path.rstrip("/") != "/v1/audio/speech":
            return self.send_error(404)
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0) or b"{}")
            text = str(body.get("input", "")).strip()[:300]
            voice = voices.get(body.get("voice", ""))
            if not text or voice is None:
                return self.send_error(400, "texte vide ou voix inconnue")
            speed = min(2.0, max(0.5, float(body.get("speed", 1.0) or 1.0)))
            buf = io.BytesIO()
            with lock, wave.open(buf, "wb") as wav:
                voice.synthesize_wav(text, wav, syn_config=SynthesisConfig(length_scale=1.0 / speed))
            data = buf.getvalue()
        except Exception as e:  # erreur propre : Mochi repassera sur la voix du navigateur
            return self.send_error(500, str(e)[:200])
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Piper → http://127.0.0.1:{PORT}/v1 · voix : {', '.join(voices)}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
