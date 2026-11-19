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
npm start
```

Vérifie depuis ton téléphone (en 4G, pas en Wi-Fi) que l'adresse s'ouvre, crée ton compte, choisis ton pseudo (onglet **Amis**), copie ton **lien d'invitation**.

> L'adresse `trycloudflare.com` change à chaque lancement du tunnel : renvoie-la si tu relances. Ton PC doit rester allumé pendant le test.

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
- Le même tableau de bord montre les comptes, l'activité sur 7 jours, l'usage de l'IA et son coût.
- `journalctl` n'existe pas en local : regarde le terminal de `npm start` (les erreurs y sont datées).
- Après la semaine : `npm run backup`, puis trier les retours (bugs → à corriger d'abord ; idées → ROADMAP).
