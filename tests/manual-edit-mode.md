# Test manuel : cloze en mode édition

## Objectif
Vérifier qu'un span `.cloze` inséré dans l'éditeur ne se fragmente plus lorsqu'on utilise les commandes de mise en forme en mode édition.

## Préparation
1. Ouvrir l'application en local ou en production et se connecter.
2. Créer ou ouvrir une fiche existante.
3. S'assurer que le mode révision est désactivé afin que l'éditeur soit en écriture.

## Étapes
1. Saisir une phrase contenant au moins trois mots (ex. `Alpha Bravo Charlie`).
2. Sélectionner le mot central et cliquer sur le bouton "Texte à trous" pour créer un span `.cloze`.
3. Tout en laissant le curseur à l'intérieur du span, cliquer sur le bouton "Liste à puces" puis appuyer sur `Entrée` pour ajouter un nouvel élément de liste.
4. Revenir en arrière (`Ctrl+Z` ou bouton Annuler) puis appliquer la "Liste numérotée" sur la même sélection et appuyer sur `Entrée`.
5. Répéter l'opération avec le bouton "Liste à cocher" si disponible.

## Résultats attendus
- Le span `.cloze` reste un élément unique dans le DOM après chaque action (vérifier via l'inspecteur ou en réactivant le mode révision et en cliquant sur le trou).
- Aucun fragment supplémentaire de texte ou de liste n'est créé à l'intérieur ou à l'extérieur du span.
- La navigation clavier (Entrée, Retour arrière) n'insère pas de nœuds parasites dans la sélection.

Cocher ce test lors de la recette manuelle pour confirmer que les spans ne se fragmentent plus en mode édition.
