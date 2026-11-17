# SETUP.md : installer et configurer Mochi

Ce guide explique comment lancer Mochi sur ta machine et comment activer le **correcteur Claude** (la correction des phrases dans l'onglet « Produire »).

---

## 1. Prérequis

- **Node.js 22.5 ou plus récent** (`node --version` pour vérifier). Mochi utilise la base SQLite intégrée à Node, il n'y a rien d'autre à installer.
- **git**

## 2. Installer et lancer

```bash
git clone git@github.com:Ishtarsu-1/LearnLanguages.git
cd LearnLanguages
npm install        # installe le SDK Claude et zod (validation)
npm start          # → http://localhost:8000
```

Ouvre **http://localhost:8000** dans ton navigateur. Le site fonctionne tout de suite : comptes, révisions, exercices et correcteur hors ligne. Seul le correcteur Claude demande une clé API (section suivante).

> Sans le serveur (par exemple avec `python3 -m http.server`), le site marche en **mode invité** : progression dans le navigateur, pas de comptes ni de correcteur Claude.

---

## 3. Obtenir une clé API Claude

1. **Crée un compte** sur la console Claude : **https://platform.claude.com**
2. **Ajoute des crédits** : menu *Billing* (Facturation), puis ajoute un moyen de paiement et achète quelques crédits (5 $ suffisent largement pour tester).
3. **Fixe une limite de dépense** (fortement conseillé) : dans *Limits*, mets un plafond mensuel, par exemple 10 $. Tu ne pourras pas dépasser ce montant, même en cas de bug.
4. **Crée la clé** : *Settings*, puis *API Keys*, puis *Create Key*. Donne-lui un nom (par exemple `mochi-local`).
5. **Copie la clé tout de suite** : elle commence par `sk-ant-…` et ne s'affiche **qu'une seule fois**. Si tu la perds, supprime-la et recrées-en une.

> 🔒 **La clé est un secret, comme un mot de passe bancaire.** Ne la colle jamais dans le code, dans un commit, sur Discord ou dans une capture d'écran. Si elle fuit, supprime-la immédiatement dans la console (*API Keys*, puis *Delete*) et crée-en une nouvelle.

## 4. Donner la clé à Mochi

**Méthode conseillée : fichier `.env`**

```bash
cp .env.example .env
```

Ouvre `.env` et colle ta clé :

```
ANTHROPIC_API_KEY=sk-ant-ta-cle-ici
```

Puis relance le serveur avec `npm start`. Le fichier `.env` est dans le `.gitignore` : il ne sera **jamais** commité.

**Autre méthode : variable d'environnement, juste pour une session**

```bash
ANTHROPIC_API_KEY=sk-ant-ta-cle-ici npm start
```

## 5. Vérifier que ça marche

1. Ouvre http://localhost:8000 et **crée un compte** (le correcteur Claude est réservé aux comptes).
2. Choisis une langue, puis l'onglet **💬 Produire**, puis **✍️ Phrase libre**.
3. Écris une phrase avec une petite faute, par exemple en coréen `저는 커피을 좋아해`, et clique sur **Vérifier**.
4. Sous la correction, tu dois voir **« ✨ Corrigé par Claude · N correction(s) restante(s) aujourd'hui »**.

Si tu vois plutôt **« Correcteur hors ligne (…) »**, le message entre parenthèses donne la cause (voir la section Dépannage).

---

## 6. Combien ça coûte ?

Par défaut, le correcteur utilise **Claude Opus 5.5** (4 $ par million de tokens en entrée, 20 $ par million en sortie). Une correction, c'est une phrase courte plus les consignes, soit **environ 1 à 3 centimes** (estimation : le coût réel dépend de la longueur de la réponse et de la réflexion du modèle). Tu peux suivre la dépense exacte dans la console, onglet *Usage*.

Protections déjà en place :
- **60 corrections maximum par compte et par jour** (`MOCHI_LLM_DAILY` pour changer).
- Une correction qui échoue n'est **pas** décomptée.
- Les invités n'ont pas accès au correcteur Claude.
- Ajoute à ça la **limite de dépense** de la console (étape 3).

Pour réduire le coût, tu peux choisir un modèle moins cher dans `.env`, en échange d'une qualité de correction un peu moindre (surtout pour les nuances de registre en coréen) :

```
MOCHI_MODEL=claude-sonnet-5-5   # environ 2 fois moins cher
MOCHI_MODEL=claude-haiku-5-5    # environ 40 fois moins cher
```

---

## 7. Toutes les variables d'environnement

| Variable | Par défaut | Rôle |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Clé API Claude pour le correcteur |
| `MOCHI_MODEL` | `claude-opus-5-5` | Modèle utilisé pour les corrections |
| `MOCHI_LLM_DAILY` | `60` | Corrections max par compte et par jour |
| `MOCHI_LLM` | activé | Mettre `off` pour couper le correcteur Claude |
| `PORT` | `8000` | Port du serveur |
| `DATA_DIR` | `./data` | Base de données et photos de profil |
| `COOKIE_SECURE` | — | Mettre `1` quand le site est servi en HTTPS |

## 8. Données et sauvegarde

Tout est dans **`data/`** : `mochi.db` (comptes, progression, révisions) et `avatars/` (photos de profil). Pour sauvegarder, arrête le serveur et copie le dossier `data/`. Ne commite jamais ce dossier (il est dans le `.gitignore`).

## 9. Tests

```bash
npm test
```

Ils couvrent l'application, l'API des comptes, la synchronisation entre plusieurs appareils et le correcteur. Claude y est simulé : **les tests ne consomment aucun crédit**.

---

## 10. Dépannage

| Message affiché | Cause et solution |
|---|---|
| « LLM non configuré (clé API manquante ou invalide) » | Pas de clé, ou clé erronée ou supprimée. Vérifie `.env`, puis relance `npm start` (le fichier n'est lu qu'au démarrage). |
| « Erreur du correcteur (400) » | Souvent des crédits épuisés. Vérifie *Billing* dans la console. |
| « Le correcteur est très sollicité… » | Limite de débit de l'API atteinte. Réessaie dans une minute. |
| « Tu as utilisé tes 60 corrections du jour » | Quota Mochi atteint. Il se remet à zéro chaque jour (UTC), sinon augmente `MOCHI_LLM_DAILY`. |
| « Correcteur désactivé » | `MOCHI_LLM=off` est défini : retire-le. |
| « Phrases libres : connecte-toi » | Tu es en mode invité. Crée un compte ou connecte-toi. |
| Pas de bouton « Se connecter » | Tu n'es pas passé par `npm start` (site servi sans serveur). |
| `node: bad option: --env-file-if-exists` | Node est trop ancien : installe Node 22.5 ou plus récent. |
