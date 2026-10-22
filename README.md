# Papouth Game Launcher

Launcher Windows (Electron) : boutique, bibliothèque et compte pour les jeux TikTok LIVE. Il consomme l'API décrite dans `../CONTRACT.md`.

## Lancer en dev
```
npm install
npm start          # connecté au backend (STORE_API_URL ou défaut dans config.js)
npm run demo       # mode démo, sans backend (ALIEN_DEMO=1)
```
Aperçu UI sans Electron : ouvrir `renderer/preview.html` dans un navigateur (`?view=library|account|auth`, `&pass=1`, `&update=1`, `&lang=fr|en|es|th|ms`).

URL de l'API : réglage avancé dans l'onglet Compte > « Paramètres avancés », sinon variable `STORE_API_URL`, sinon `config.js`.

## Générer l'installeur .exe
```
npm run dist
```
Sortie dans `dist/` (NSIS). Remplacer `assets/icon.png` (256x256 minimum, idéalement un `.ico`) avant la sortie publique.

## Publier une mise à jour du launcher
1. Incrémenter `version` dans `package.json`.
2. `npx electron-builder --win --publish always` avec `GH_TOKEN` (droits `repo`) : crée la release sur `Papouth/papouth-launcher-releases` avec `latest.yml` et l'installeur.
3. Les launchers installés détectent la mise à jour au démarrage et proposent « Redémarrer pour mettre à jour ».

## Mode administrateur
Un compte dont l'e-mail est dans `ADMIN_EMAILS` (backend) voit la section **Admin** (Jeux, Joueurs, Statistiques, Journal) : créer/éditer/publier des jeux, envoyer images, vidéos et `.zip`, offrir ou retirer des accès. Aperçu sans backend : `renderer/preview.html?admin=1&view=admin` (`&adm=users|stats|log`, `&edit=<slug>`) ou `PAPOUTH_DEMO_ADMIN=1` avec le mode démo. Détails : `../store-api/README.md` (« Mode administrateur », « Ajouter un nouveau jeu »).

## Ajouter un jeu (ancienne méthode, remplacée par le mode administrateur)
1. Backend : ajouter le jeu au catalogue (slug, nom, tagline, image, accent, version, sizeMb) et configurer son `downloadUrl` ou son dépôt de release GitHub.
2. Release GitHub : publier un asset `.zip` contenant l'exécutable du jeu (à la racine du zip ou dans un unique dossier) et ses fichiers ; renseigner `exe` (nom de l'exe) et idéalement `sha256`.
3. Pour pousser une mise à jour, augmenter `version` dans le catalogue : le launcher affiche « Mettre à jour » quand la version installée est inférieure.
4. Le jeu est lancé avec `--alien-token=<jeton>` (nom conservé pour compatibilité) et `--papouth-token=<jeton>` (même valeur) et doit appeler `POST /license/verify`.
