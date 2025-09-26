# Apprentissage actif

Application web de prise de notes et de révision active avec texte à trous et répétition espacée. Le frontend est une page statique (compatibles GitHub Pages) et la persistance des données est gérée par Firebase Firestore.

## Fonctionnalités

- Connexion par pseudo (via Firebase Authentication) avec création automatique du compte.
- Gestion multi-cours : création, ouverture et suppression de cours.
- Arborescence chapitres/pages/sous-pages avec ajout, renommage et suppression.
- Éditeur riche simple (gras, italique, listes, titres, insertion d’images) et transformation de portions de texte en trous à réviser.
- Mode révision : affichage des trous masqués, révélation sur clic et échelle d’auto-évaluation à 5 niveaux.
- Système de répétition espacée : incrément/décrément de compteur par trou et bouton "Nouvelle itération" pour ajuster automatiquement les échéances.

## Déploiement

1. Hébergez les fichiers statiques (`index.html`, `styles.css`, `app.js`) sur GitHub Pages ou tout hébergeur statique.
2. Dans la console Firebase, créez une application Web puis copiez les identifiants fournis (API key, Auth domain, Project ID…). Remplacez les valeurs du fichier `firebase-config.js` par celles de votre projet.
3. Activez l’authentification **Email/Mot de passe** dans Firebase Authentication. L’application génère une adresse du type `<pseudo>@pseudo.apprentissage` et un mot de passe dérivé pour chaque utilisateur.
4. Si besoin, ajustez les constantes `AUTH_EMAIL_DOMAIN` / `AUTH_PASSWORD_SUFFIX` dans `app.js` ainsi que la règle `isOwner` de `firestore.rules` si vous changez le domaine.

> Les pseudos saisis sont normalisés (minuscules, accents supprimés et caractères non autorisés remplacés par `-`) afin de constituer un identifiant valide pour Firebase Authentication.

## Dépannage

- **Erreur `FirebaseError: Firebase: Error (auth/configuration-not-found)` lors de la connexion** : soit l’application pointe encore vers la configuration d’exemple (vérifiez que toutes les valeurs du fichier `firebase-config.js` ont été remplacées par celles de votre projet), soit la méthode de connexion *Email/Mot de passe* n’est pas activée dans la console Firebase (*Authentication* > *Méthode de connexion*).
- **Erreur `FirebaseError: Missing or insufficient permissions` en chargeant ou en créant une fiche** : vos règles de sécurité Firestore ne correspondent pas à celles du projet. Importez le fichier `firestore.rules` dans la console Firebase ou déployez-le via l’outil CLI (`firebase deploy --only firestore:rules`) puis adaptez la fonction `isOwner` si vous avez modifié la constante `AUTH_EMAIL_DOMAIN` dans `app.js`.
- **Erreur `FirebaseError: Missing or insufficient permissions` lors du chargement des comptes publics** : la collection `users` est protégée par les mêmes règles Firestore. Déployez le fichier `firestore.rules` fourni (ou appliquez les équivalents via la console) pour autoriser la lecture des profils dont `visibility` vaut `public`, puis vérifiez que `AUTH_EMAIL_DOMAIN` côté frontend correspond au domaine autorisé par la règle `isOwner`.

## Développement local

Servez les fichiers statiques via un serveur HTTP (par exemple `npx serve`) afin de bénéficier des modules ES.

```
npm install -g serve
serve
```

Puis ouvrez http://localhost:3000/ (ou le port indiqué) dans votre navigateur.
