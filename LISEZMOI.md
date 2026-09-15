# Tournoi interne TCPM — Demandes de créneaux

Pages ajoutées au site `tcpm.vercel.app`, **sans toucher à la page d'inscription** :

| Page | Adresse | Accès |
|---|---|---|
| Joueurs | `/tournoi-interne/gestion.html` | Libre |
| Juge-arbitre | `/tournoi-interne/admin/` | Identifiant + mot de passe |

## Fichiers à copier à la racine du dépôt `tcpm`

```
tournoi-interne/gestion.html        page joueur
tournoi-interne/admin/index.html    page juge-arbitre
tournoi-interne/assets/             style + scripts + config.js (poules, créneaux)
api/                                fonctions serveur (Neon)
middleware.js                       protection de la page admin
vercel.json                         redirection API admin + noindex
package.json                        dépendances serveur
db/schema.sql                       table à créer dans Neon
```

⚠️ **Si le dépôt contient déjà** `package.json`, `vercel.json` ou `middleware.js`, fusionner le contenu au lieu d'écraser. Ne pas toucher `tournoi-interne/index.html` (page d'inscription).

## Mise en ligne

1. **Base Neon** : Vercel > projet `tcpm` > Storage > Create Database > Neon, région **Europe (Frankfurt)**. La variable `DATABASE_URL` est ajoutée automatiquement.
2. **Table** : Neon > SQL Editor > coller `db/schema.sql` > Run.
3. **Accès admin** : Vercel > Settings > Environment Variables :
   - `ADMIN_USER` = ton identifiant
   - `ADMIN_PASSWORD` = un mot de passe long (lettres et chiffres, sans accents)
4. **Pousser** sur GitHub : Vercel redéploie tout seul.
5. **Remplir depuis l'admin** : onglets Poules, Créneaux, Numéros.

## Vérifications après déploiement

1. `/tournoi-interne/` : la page d'inscription fonctionne toujours.
2. `/tournoi-interne/gestion.html` : faire une demande test.
3. `/tournoi-interne/admin/` : la fenêtre d'identification s'affiche, puis la demande apparaît.
4. `/api/admin/requests` sans identifiant : doit répondre **401**.
5. `/api/_lib/data.js` : doit répondre **404**.
6. Valider la demande test, cliquer « Prévenir », puis **Annuler** le match pour nettoyer.

## Pendant le tournoi (tout se fait dans l'admin)

- **Poules** : coller les noms depuis MOJA, un par ligne, numéro facultatif après « ; ».
  Mixte : `Joueur / Joueuse ; tél 1 ; tél 2`.
- **Créneaux** : date, heure, nombre de terrains. Boutons − / + pour la capacité,
  👁 pour masquer un créneau aux joueurs, 🗑 pour supprimer (seulement s'il n'a aucune demande).
- **Numéros** : l'onglet « Manquants » liste les joueurs sans numéro.
- 🔒 = nom verrouillé (des demandes existent) : ni renommage ni suppression.
- **Sauvegarde** : bouton « Exporter CSV » (sert aussi pour MOJA).

## Fin du tournoi (RGPD)

1. Exporter le CSV.
2. Neon > SQL Editor : `UPDATE match_requests SET phone1 = NULL, phone2 = NULL;`
3. La requête ci-dessus supprime aussi l'annuaire : `DELETE FROM player_contacts;`

## Tester en local (facultatif)

`npm i -g vercel` puis `vercel link` et `vercel env pull` et `vercel dev`.
