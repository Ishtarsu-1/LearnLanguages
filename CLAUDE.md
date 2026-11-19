## Notification Discord de fin de tâche

Quand tu as terminé une tâche que je t'ai demandée (et que tes changements sont commités) :
1. Récupère le hash court du dernier commit avec `git rev-parse --short HEAD`.
2. Envoie un récap avec `./scripts/notify-discord.sh "<message>"`, au format :

   🤖 **Tâche terminée** — `<hash>`
   **Demande :** <la demande en une phrase>
   **Fait :**
   - <changement 1>
   - <changement 2>
   **Reste à faire / points d'attention :** <ou "rien">

Règles :
- Reste court (moins de 1500 caractères).
- N'envoie le récap qu'une fois par tâche, à la fin, pas à chaque commit intermédiaire (le hook git s'occupe déjà des commits).
- Si rien n'a été commité, mets "pas de commit" à la place du hash.
- Ne mets jamais de secret (tokens, URL du webhook, contenu de `.env`) dans le message.
