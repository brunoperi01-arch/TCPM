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
4. **Remplir** `tournoi-interne/assets/config.js` (poules + créneaux) et `api/_lib/contacts.js` (numéros).
5. **Pousser** sur GitHub : Vercel redéploie tout seul.

## Vérifications après déploiement

1. `/tournoi-interne/` : la page d'inscription fonctionne toujours.
2. `/tournoi-interne/gestion.html` : faire une demande test.
3. `/tournoi-interne/admin/` : la fenêtre d'identification s'affiche, puis la demande apparaît.
4. `/api/admin/requests` sans identifiant : doit répondre **401**.
5. `/api/_lib/contacts.js` : doit répondre **404** (l'annuaire ne doit jamais être lisible).
6. Valider la demande test, cliquer « Prévenir », puis **Annuler** le match pour nettoyer.

## Pendant le tournoi

- **Ajouter un créneau** : modifier `CRENEAUX` dans `config.js`, puis pousser.
- **Ne jamais renommer** un joueur ou **supprimer** un créneau qui a déjà des demandes.
- **Sauvegarde** : bouton « Exporter CSV » dans l'admin (sert aussi pour MOJA).

## Fin du tournoi (RGPD)

1. Exporter le CSV.
2. Neon > SQL Editor : `UPDATE match_requests SET phone1 = NULL, phone2 = NULL;`
3. Vider `api/_lib/contacts.js` et pousser.

## Tester en local (facultatif)

`npm i -g vercel` puis `vercel link` et `vercel env pull` et `vercel dev`.
