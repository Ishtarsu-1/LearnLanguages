// Lance toutes les suites de tests : node tests/run.js
const { execFileSync } = require("node:child_process");
const path = require("node:path");
let failed = 0;
process.env.MAIL_QUIET = "1"; // les e-mails « console » des tests ne s'affichent pas
for (const f of ["client-harness.js", "server.test.js", "tts.test.js", "mail.test.js", "sync.test.js", "llm.test.js", "ollama.test.js", "hardware.test.js", "content.test.js", "social.test.js", "live.test.js", "backup.test.js", "portable.test.js"]) {
  console.log(`\n▶ ${f}`);
  try { process.stdout.write(execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8" }).split("\n").filter((l) => !l.startsWith("  ok")).join("\n")); }
  catch (e) { failed++; process.stdout.write(e.stdout || ""); process.stderr.write(e.stderr || ""); }
}
console.log(failed ? `\n✗ ${failed} suite(s) en échec` : "\n✓ Toutes les suites passent");
process.exit(failed ? 1 : 0);
