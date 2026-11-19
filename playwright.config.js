// Tests dans un vrai navigateur (v0.5, lot 5.3) : npm run test:e2e
// Le serveur démarre avec une base vide et temporaire, sans IA (correcteur hors ligne) ni voix serveur.
const { defineConfig } = require("@playwright/test");
const os = require("node:os"), path = require("node:path"), fs = require("node:fs");
const PORT = Number(process.env.E2E_PORT || 18766);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-e2e-"));
module.exports = defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: "fr-FR", serviceWorkers: "block" },
  webServer: {
    command: "node server.js",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(PORT), HOST: "127.0.0.1", DATA_DIR: DATA, MOCHI_LLM: "off", MAIL_QUIET: "1", TTS_URL: "", TTS_URL_EN: "", TTS_URL_KO: "", TTS_URL_ZH: "", TTS_URL_RU: "", FEEDBACK_TO: "" },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
