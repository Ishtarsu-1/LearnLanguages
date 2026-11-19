#!/usr/bin/env node
// ============================================================
//  npm run doctor : diagnostic de la machine qui héberge Mochi (CORRECTIFS v0.4, lot 8)
//    npm run doctor                 affiche le rapport et les recommandations (ne change rien)
//    npm run doctor -- --write      écrit les variables recommandées dans .env (copie de sauvegarde
//                                   avant, seulement TTS_*, MOCHI_LLM_PROVIDER, MOCHI_MODEL, OLLAMA_URL ;
//                                   jamais les secrets)
//    npm run doctor -- --pull       propose de télécharger le modèle Ollama recommandé (o/N)
//  N'installe jamais rien tout seul : les commandes sont affichées, à copier.
// ============================================================
const path = require("node:path");
const readline = require("node:readline/promises");
const { spawn } = require("node:child_process");
const hw = require("../hardware.js");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = { write: args.includes("--write"), pull: args.includes("--pull") };
for (const a of args) if (!["--write", "--pull"].includes(a)) { console.error(`Option inconnue : ${a}`); process.exit(2); }

const yes = (b) => (b ? "✅" : "❌");
const secs = (ms) => `${(ms / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const OS = { win32: "Windows", linux: "Linux", darwin: "macOS" };

(async () => {
  console.log("🩺 Mochi · diagnostic de cette machine (celle qui fait tourner le serveur)\n");
  const r = await hw.detect();
  const rec = hw.recommend(r);
  const gpu = r.gpus[0];
  const lines = [
    ["Système", `${OS[r.system.platform] || r.system.platform} ${r.system.release} (${r.system.arch})`],
    ["Processeur", `${r.cpu.model} · ${r.cpu.cores} cœurs`],
    ["Mémoire vive", `${hw.fmtGB(r.ram.total)} (${hw.fmtGB(r.ram.free)} libres)`],
    ["Carte graphique", gpu ? r.gpus.map((g) => `${g.name} · ${(g.memTotalMB / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go (${g.memUsedMB} Mo utilisés) · pilote ${g.driver}`).join(" | ") : r.apple ? "Apple Silicon (Metal)" : r.nvidiaSmi === "absent" ? "aucune carte NVIDIA détectée" : "nvidia-smi ne répond pas"],
    ["Docker", !r.docker.installed ? "❌ non installé" : !r.docker.running ? "⚠️ installé mais arrêté" : `✅ démarré${r.docker.nvidia ? " · carte graphique accessible" : ""}${r.docker.kokoroImage ? ` · Kokoro : ${r.docker.kokoroImage}` : ""}`],
    ["Python 3.10 / uv", `${r.python.py310 ? `✅ ${r.python.py310}` : "Python 3.10 : —"} · ${r.python.uv ? `✅ ${r.python.uv}` : "uv : ❌"}`],
    ["Ollama", r.ollama.up ? `✅ ${r.ollama.url} · ${r.ollama.models.length ? r.ollama.models.join(", ") : "aucun modèle"}${r.ollama.loaded.length ? ` · chargé : ${r.ollama.loaded.map((m) => `${m.name} (${m.gpuShare} % GPU)`).join(", ")}` : ""}` : `❌ ne répond pas sur ${r.ollama.url}`],
    ...["en", "ko", "zh"].map((l) => [`Voix ${{ en: "anglaises (Kokoro)", ko: "coréennes (MeloTTS)", zh: "chinoises (Kokoro)" }[l]}`, !r.voices[l].configured ? "— non configurées (voix du navigateur)" : r.voices[l].up ? `✅ ${r.voices[l].base} · une phrase courte en ${secs(r.voices[l].ms)}` : `❌ ${r.voices[l].base} ne répond pas (${r.voices[l].error})`]),
    ["Analyseur coréen (Kiwi)", r.nlp.kiwiUp ? `✅ ${r.nlp.kiwiUrl} (production de contenu)` : `— ne répond pas sur ${r.nlp.kiwiUrl} (seulement utile pour produire du contenu coréen)`],
    ["Clé Anthropic", r.anthropicKey ? "✅ présente" : "— absente"],
  ];
  const w = Math.max(...lines.map(([k]) => k.length));
  for (const [k, v] of lines) console.log(`  ${k.padEnd(w)}  ${v}`);

  console.log(`\n🧭 Profil : ${rec.profile} · ${rec.label}`);
  if (rec.warnings.length) { console.log("\n⚠️  À corriger"); for (const x of rec.warnings) console.log(`  • ${x}`); }
  if (rec.notes.length) { console.log("\n💡 Bon à savoir"); for (const x of rec.notes) console.log(`  • ${x}`); }
  if (rec.commands.length) {
    console.log(`\n📋 Commandes à copier (${r.system.platform === "win32" ? "PowerShell" : "terminal"}) : rien n'est lancé automatiquement`);
    for (const c of rec.commands) { console.log(`\n  ${c.title}`); for (const l of c.lines) console.log(`    ${l}`); }
  }
  console.log("\n⚙️  Variables recommandées pour .env");
  for (const [k, v] of Object.entries(rec.env)) console.log(`    ${k}=${v}`);

  if (opt.write) {
    const res = hw.writeEnv(path.join(ROOT, ".env"), rec.env);
    if (!res.changed) console.log("\n✓ .env est déjà à jour.");
    else {
      console.log(`\n✍️  .env mis à jour${res.backup ? ` (sauvegarde : ${path.basename(res.backup)})` : " (nouveau fichier)"} :`);
      for (const d of res.diff) console.log(`    ${d}`);
      console.log("  Les secrets (ANTHROPIC_API_KEY, RESEND_API_KEY…) n'ont pas été touchés. Relance npm start.");
    }
  } else console.log("\n→ Pour les écrire dans .env (avec une copie de sauvegarde) : npm run doctor -- --write");

  if (opt.pull) {
    const model = rec.env.MOCHI_MODEL;
    if (!model) console.log("\nPas de modèle Ollama recommandé pour ce profil.");
    else if (r.ollama.models.includes(model)) console.log(`\n✓ ${model} est déjà installé.`);
    else if (!process.stdin.isTTY) console.log(`\n--pull demande une confirmation : lance-le dans un terminal (ou : ollama pull ${model}).`);
    else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const a = (await rl.question(`\nTélécharger ${model} avec Ollama maintenant ? (o/N) `)).trim().toLowerCase();
      rl.close();
      if (a === "o" || a === "oui") {
        // Arguments fixes : le nom du modèle vient de la table des profils, jamais d'une saisie
        await new Promise((ok) => spawn("ollama", ["pull", model], { stdio: "inherit", shell: false }).on("close", ok).on("error", (e) => { console.error(`ollama : ${e.message}`); ok(); }));
      }
    }
  }
})().catch((e) => { console.error("Diagnostic interrompu :", e.message); process.exit(1); });
