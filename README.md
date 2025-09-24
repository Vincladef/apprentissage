# Apprentissage actif

Application web de prise de notes et de révision active avec texte à trous et répétition espacée. Le frontend est une page statique (compatibles GitHub Pages) et la persistance des données est gérée par Firebase Firestore.

## Fonctionnalités

- Connexion par pseudo (sans mot de passe) avec conservation automatique de la session.
- Gestion multi-cours : création, ouverture et suppression de cours.
- Arborescence chapitres/pages/sous-pages avec ajout, renommage et suppression.
- Éditeur riche simple (gras, italique, listes, titres, insertion d’images) et transformation de portions de texte en trous à réviser.
- Mode révision : affichage des trous masqués, révélation sur clic et échelle d’auto-évaluation à 5 niveaux.
- Système de répétition espacée : incrément/décrément de compteur par trou et bouton "Nouvelle itération" pour ajuster automatiquement les échéances.

## Déploiement

1. Hébergez les fichiers statiques (`index.html`, `styles.css`, `app.js`) sur GitHub Pages ou tout hébergeur statique.
2. Configurez votre projet Firebase Firestore avec des règles adaptées à un usage sans authentification (ou ajoutez votre propre stratégie d’authentification).
3. Mettez à jour la configuration Firebase dans `app.js` si nécessaire.

## Développement local

Servez les fichiers statiques via un serveur HTTP (par exemple `npx serve`) afin de bénéficier des modules ES.

```
npm install -g serve
serve
```

Puis ouvrez http://localhost:3000/ (ou le port indiqué) dans votre navigateur.
