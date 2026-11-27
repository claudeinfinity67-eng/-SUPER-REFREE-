# SUPER REFEREE

Jeu de hockey sur glace en **3D WebGL** jouable dans un navigateur. La caméra suit l'arbitre depuis la troisième personne avec une rotation progressive. Les personnages sont des modèles low-poly originaux inspirés des références visuelles fournies : arbitre en maillot rayé et joueurs équipés de casques, protections, patins et crosses. Aucun paquet ni compilation n'est nécessaire : ouvre `index.html` ou lance un serveur statique dans ce dossier (`python3 -m http.server 8000`).

## Jouer

- Déplace ton arbitre avec **WASD** ou les **flèches haut/bas**. Un appui sur les **flèches gauche/droite** le fait tourner; maintiens-les pour continuer à tourner.
- La caméra poursuit ton arbitre et tourne progressivement en troisième personne. Appuie sur **I** pour la rapprocher et **O** pour l'éloigner, ou utilise les boutons de caméra dans la patinoire.
- Observe la patinoire et prends une décision avec les boutons du panneau ou les touches **1 à 5**.
- **Espace** siffle la décision correspondant à l'incident en cours ; sans incident, le jeu continue. **Échap** met le match en pause.
- Utilise **Commandes** pour reconfigurer les touches, **Pause** pour interrompre le match et le sélecteur de maillot pour personnaliser ton arbitre.

La patinoire et les joueurs sont rendus en WebGL, entourés de tribunes couvertes à deux niveaux : rangées inclinées, coursive vitrée, escaliers, garde-corps, sièges et toiture avec poutres. Des gradins en arc et des structures relient les tribunes dans les quatre coins de l'aréna, sans empiéter sur la glace. Les éléments statiques des gradins sont regroupés par couleur pour limiter les appels de rendu. Le fichier `assets/referee-model/Patinage.fbx` contient déjà le modèle skinné et l'animation créée; le jeu utilise ce fichier comme unique modèle d'arbitre animé, avec sa texture. Les arbitres ont une taille cohérente avec les joueurs; leur position et leur rotation sont lissées et une ombre douce les ancre visuellement sur la glace. L'animation ralentit en mouvement, puis revient progressivement à la pose droite du modèle et s'arrête au repos. Un personnage intégré sert de secours si le FBX ne peut pas être chargé.

Les joueurs utilisent le modèle skinné et les textures PBR de `assets/player-model/player-animation.fbx`. Leur patinage est animé par le jeu : poussées alternées des jambes, flexion des genoux, contre-balancement des bras et inclinaison dans les virages. L'amplitude suit la vitesse et s'accentue au sprint ou en virage; à l'arrêt, les joueurs reviennent progressivement à la pose droite. Le décalage de phase et la légère variation de cadence donnent à chacun un mouvement indépendant. Les maillots sont déclinés en bleu et rouge. Les gardiens conservent leur rendu low-poly avec leurs jambières et leur équipement spécifique, sans utiliser le modèle skinné de joueur.

Chaque équipe joue avec deux défenseurs qui protègent leur zone, un centre, deux ailiers et un gardien. Seuls les attaquants chassent le palet libre; les autres se démarquent pour recevoir des passes, que l'adversaire peut intercepter. Les contacts ordinaires ne déclenchent plus de pénalité automatique : le match s'interrompt seulement pour les situations arbitrales prévues, comme un but à confirmer, un hors-jeu, un dégagement interdit ou un arrêt du gardien. L'arbitre assistant suit l'action. Le match comprend trois périodes accélérées et l'évaluation des décisions. La précision et les points d'expérience sont conservés dans le stockage local du navigateur.

### Deux infractions différentes

- **Hors-jeu** : un attaquant franchit la ligne bleue de la zone offensive avant le palet.
- **Dégagement interdit** : le palet est tiré depuis la moitié défensive jusqu'au-delà de la ligne de but adverse sans être touché.
