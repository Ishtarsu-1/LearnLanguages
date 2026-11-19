# Bêta entre amis : la marche à suivre

## 1. Avant de lancer (une fois)

- [ ] **Mentions légales** : remplir `LEGAL_INFO` dans `legal.js` (éditeur, contact, hébergeur : « l'ordinateur personnel de l'éditeur, rendu accessible via Cloudflare, Inc. »).
- [ ] **Retours par e-mail** : `RESEND_API_KEY` et `FEEDBACK_TO` dans `.env` (déjà fait). Les e-mails de mot de passe oublié et de confirmation **ne partent pas** vers tes amis tant qu'aucun domaine n'est vérifié chez Resend : préviens-les (ils n'en ont pas besoin pour tester).
- [ ] **Audio d'avance** : `npm run tts:pregen` (sinon la première écoute de chaque phrase est lente).
- [ ] **Sauvegarde** : `npm run backup`.
- [ ] **Installer le tunnel** : `sudo pacman -S cloudflared`.

## 2. Le jour J

Trois terminaux :

```bash
# 1. les voix (si elles ne tournent pas déjà)
tools/start-voices.sh

# 2. le tunnel : note l'adresse https://….trycloudflare.com qu'il affiche
cloudflared tunnel --url http://localhost:8000

# 3. le site, avec cette adresse dans .env :
#    PUBLIC_URL=https://….trycloudflare.com
#    COOKIE_SECURE=1
#    TRUST_PROXY=127.0.0.1,::1
#    TRUST_CF=1          (voir « Vraie adresse IP » ci-dessous)
#    HOST=127.0.0.1
npm start
```

Vérifie depuis ton téléphone (en 4G, pas en Wi-Fi) que l'adresse s'ouvre, crée ton compte, choisis ton pseudo (onglet **Amis**), copie ton **lien d'invitation**.

### ⚠️ L'adresse change à chaque lancement

Un tunnel rapide (`trycloudflare.com`) donne une **nouvelle adresse à chaque lancement** de `cloudflared` : l'ancienne cesse de marcher, et avec elle **les liens d'invitation d'ami** déjà envoyés (`…/#/ami/…`). Si tu dois relancer :
1. mets la nouvelle adresse dans `PUBLIC_URL` et relance `npm start` ;
2. renvoie l'adresse **et** ton lien d'invitation aux testeurs (les comptes, eux, ne bougent pas : chacun se reconnecte normalement).

**Adresse fixe** : un *tunnel nommé* avec un compte Cloudflare gratuit et un nom de domaine à toi (une dizaine d'euros par an) : `cloudflared tunnel login`, `cloudflared tunnel create mochi`, `cloudflared tunnel route dns mochi mochi.ton-domaine.fr`, puis `cloudflared tunnel run --url http://localhost:8000 mochi`. L'adresse ne change plus et les liens restent valables.

### 🖥️ Le PC doit rester allumé

Le site tourne sur ton ordinateur : s'il s'éteint ou se met en veille, **le site est hors ligne** pour tout le monde. Pendant la bêta :
- désactive la mise en veille automatique ;
- vérifie de temps en temps la santé du site : `https://….trycloudflare.com/api/health` doit répondre `{"ok":true,…}` (ou branche UptimeRobot, gratuit, sur cette adresse : il t'envoie un e-mail si le site tombe) ;
- si tu dois couper, préviens les testeurs (« Mochi est en pause jusqu'à demain 18 h ») : l'appli installée garde les révisions hors ligne et synchronise au retour.

### 🌐 Vraie adresse IP des testeurs

Derrière le tunnel, toutes les requêtes arrivent de `cloudflared` (sur ta machine). Avec `TRUST_PROXY=127.0.0.1,::1`, Mochi lit l'adresse du visiteur dans `X-Forwarded-For`. Pour plus de sûreté, ajoute `TRUST_CF=1` : Mochi lit alors `CF-Connecting-IP`, posé par Cloudflare. **Seulement** avec `HOST=127.0.0.1` (le site n'est joignable que par le tunnel ; sinon quelqu'un pourrait inventer cet en-tête). Vérification : connecte-toi depuis ton téléphone en 4G **et** depuis ton PC, puis rate 3 mots de passe sur le téléphone : le PC ne doit pas être freiné.

### ✉️ Quota d'e-mails

Resend gratuit : 100 e-mails par jour, partagés entre les retours et les mots de passe. Tous les retours sont **enregistrés en base** et visibles dans l'admin ; l'e-mail n'est qu'une notification. Avec beaucoup de testeurs, mets `FEEDBACK_MAIL=daily` : un seul récapitulatif par jour (à partir de 19 h), au lieu d'un e-mail par avis (`off` : aucun e-mail).

## 2 bis. Ou bien : la version portable (sans tunnel, sans PC allumé)

Un dossier à envoyer, qui tourne **sur l'ordinateur de ton ami** : il double-clique sur « Lancer Mochi », le site s'ouvre dans son navigateur. Rien à installer.

```bash
npm run tts:pregen                        # d'abord : l'audio de toutes les phrases (il part dans le paquet)
npm run portable                          # Windows → dist/Mochi-portable-win.zip
npm run portable -- --os mac              # macOS (Apple Silicon)
npm run portable -- --os linux            # Linux
npm run portable -- --with-feedback       # les avis t'arrivent par e-mail (sinon ils restent sur son PC)
```

- **Dedans** : Node.js, le site, l'**audio pré-généré** des voix configurées (licence libre, au moins la moitié des phrases faites ; sinon voix de l'ordinateur), un lanceur et une notice (`LISEZMOI.txt`). Environ 90 Mo zippé avec l'audio chinois et russe, davantage avec l'anglais et le coréen.
- **Ce qui marche** : tout le parcours (lire, réviser, exercices, écrire avec le correcteur hors ligne, Hangul, pinyin, alphabet cyrillique, thèmes, livres, histoire). La progression est dans le dossier `donnees`.
- **Ce qui ne marche pas** : comptes, amis, défis, duels, correcteur IA ; et **tu ne vois pas leurs chiffres** dans ton admin (entonnoir, rétention). Pour ces retours-là, le tunnel reste mieux.
- **`--with-feedback`** met ta clé Resend dans le paquet. Avec l'expéditeur de test (`onboarding@resend.dev`), elle ne peut écrire **qu'à ton adresse** : au pire, quelqu'un t'enverrait des e-mails. Crée quand même une clé dédiée (« Sending access ») et supprime-la après la bêta.
- **Windows** affiche « Windows a protégé votre ordinateur » (lanceur non signé) : « Informations complémentaires » › « Exécuter quand même ». **macOS** : clic droit › Ouvrir la première fois.
- **Nouvelle version** : renvoie le zip ; ton ami recopie son dossier `donnees` dans le nouveau.

## 3. Le message à envoyer

> Salut ! Je développe **Mochi**, un site pour apprendre l'anglais, le coréen ou le chinois (fait pour les francophones). Tu veux bien le tester une semaine ? 🍡
>
> 👉 Le site : **https://….trycloudflare.com**
> 👉 Mon lien d'ami (on sera amis directement) : **https://….trycloudflare.com/#/ami/…**
>
> Crée un compte (l'e-mail de confirmation n'arrivera pas, c'est normal pendant le test), choisis une langue et fais la séance du jour 10 minutes par jour.
> À tester si tu as le temps :
> - la séance « Aujourd'hui » de bout en bout (lire, réviser, écrire) ;
> - le coréen : le Hangul ; le chinois : « Pinyin & tons » ;
> - l'onglet **Amis** : lance-moi un défi, et un **⚡ Duel** en direct quand on est en ligne tous les deux ;
> - sur téléphone : « Ajouter à l'écran d'accueil » (ça s'installe comme une appli).
>
> Et surtout : le bouton **« Bêta · ton avis 💬 »** en haut. Bug, idée, texte bizarre, tout m'intéresse, même « j'ai rien compris ». Merci !!

## 4. Scénarios à surveiller (et ce qui compte)

| Scénario | Ce qu'on cherche à savoir |
|---|---|
| Premier contact : accueil → langue → première séance | Comprend-on quoi faire sans explication ? Où bloque-t-on ? |
| Lecture d'un texte trop difficile ou trop facile | La couverture (% de mots connus) est-elle juste ? |
| Révisions sur plusieurs jours | Les intervalles semblent-ils bons ? Trop de cartes ? |
| Écrire une phrase (correcteur IA) | Les corrections sont-elles justes, compréhensibles, pas vexantes ? |
| Coréen : Hangul jour 1 à 10 / Chinois : tons | Trop long ? Trop dur ? Les repères pour francophones aident-ils ? |
| Amis, défis, duel | Est-ce que ça donne envie de revenir ? Le duel marche-t-il sur mobile ? |
| Mobile (iPhone et Android) | Affichage, clavier, audio, installation |

## 5. Pendant et après

- Les retours arrivent par e-mail et dans **Profil › Tableau de bord admin › Retours des testeurs**.
- Le même tableau de bord montre l'**entonnoir** (inscription → langue → premier texte → première révision → retour le lendemain → retour à J+7), la **rétention J1 / J7 par langue** et **où s'arrêtent les séances** (avant de lire, après la lecture, après les révisions), tout agrégé et sans nom ; ainsi que les comptes, l'usage de l'IA et son coût.
- `journalctl` n'existe pas en local : regarde le terminal de `npm start` (les erreurs y sont datées).
- Après la semaine : `npm run backup`, puis trier les retours (bugs → à corriger d'abord ; idées → ROADMAP).
