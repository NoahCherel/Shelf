# Plan : le reste de la barre et des apps

## Contexte

Tu as demandé de faire « toute la barre et les apps d'un coup ». Tes réponses fixent le périmètre : **tout ce que la doc liste pour la barre et les apps, y compris le P3, sauf le multi-écran et les raccourcis clavier**.

Les numéros F-xxx renvoient à `docs/lumabar/15-feature-checklist.md`.

## Ce qui est construit

| Étape | Contenu | Numéros |
|---|---|---|
| 0 | Branche, instabilité du banc, protection des données pendant les tests | |
| 1 | Dock en haut ou en bas, pleine largeur, espacement | F-004, F-005, F-008 |
| 2 | Masquage automatique, option « rester visible sur le bureau » | F-010, F-011 |
| 3 | Dock rétréci par ses bords, défilement à la molette | F-013, F-014 |
| 4 | Styles iOS Glass, Midnight, White, Clear, et couleur d'accent libre | F-028, F-029, F-031, F-032, F-035 (en partie) |
| 5 | Glisser pour épingler, déplacer ou retirer une app ; animations des widgets | F-022, F-048 |
| 6 | Listes de raccourcis, accès rapide de l'Explorateur, noms au survol, réglages noms et aperçus | F-043, F-045, F-047, F-067 |
| 7 | Fichiers, dossiers et piles sur le dock ; groupes d'apps ; app ramenée devant quand on la survole avec un fichier | F-049, F-050, F-051 |
| 8 | N'importe quelle app ou dossier comme widget ; image de Start | F-052, F-053 |

## Ce qui reste hors du lot

| Élément | Pourquoi |
|---|---|
| Multi-écran (F-017, F-018, F-019, F-026) | Ton choix |
| Win+T, Alt+T (F-054, F-090) | Ton choix : aucune surveillance du clavier |
| Fin de tâche (dans F-046) | Déjà écarté par toi |
| Accent selon la pochette d'album (dans F-035) | Il n'y a pas encore de widget Now Playing |
| Corbeille (W-073) | C'est un widget du catalogue, pour le lot des widgets |

**Limite à connaître :** Shelf cache aujourd'hui la barre Windows sur tous les écrans. Si tu branches un jour un second écran, il n'aura ni dock ni barre. Je le note dans la doc sans le corriger.

## Où ça peut coincer

Du plus risqué au moins risqué :
1. **Listes de raccourcis (étape 6) :** faisabilité non prouvée, voir l'essai prévu.
2. **Glisser-déposer depuis Windows (étapes 5 et 7) :** je ne peux pas l'essayer moi-même, car je ne pilote pas ta souris. Le glisser depuis Start peut aussi ne fournir aucun chemin.
3. **Glissement du masquage (étape 2) :** le verre doit rester correct pendant que la fenêtre bouge.
4. **Look de Clear (étape 4) :** aucune image de référence.

## Comment ça se construit

### 0. Base
- Nouvelle branche depuis `origin/main`, car la branche locale est restée sur `fix/app-close`.
- **Banc :** l'écart du sélecteur tombe uniquement sur le compte à rebours des deux tuiles Claude. `SAMPLE` calcule `Date.now() + 85 min` au chargement du module, avant que `prepareBench` fige l'horloge, donc le texte dépend de l'heure réelle. C'est une déduction du code et de l'image, à confirmer par plusieurs passages stables. Correction : un échantillon qui ne dépend plus du moment de chargement, avec un test écrit d'abord.
- **Protection de tes données :** `src/test/e2e.sh` ne met de côté que `layout` et `settings`. Les tests toucheraient donc tes vraies épingles (`dock-pins`) et ta future image de Start. Je les ajoute à ce qu'il sauvegarde et restaure, avant tout le reste.

### 1. Position
- Nouveaux réglages `edge` (`bottom` ou `top`), `dockWidth` (`pill` ou `full`) et `spacing` dans `src/core/settings.ts`, relus aussi par `saved_layout` côté Rust et transmis par `set_dock_width`.
- **Espacement :** `--gap` ne sert qu'au dock, donc le réglage est sans effet ailleurs. Sa valeur par défaut reste celle d'aujourd'hui (`T × 0,04`).
- `dock_rect`, `reserved_height` (`src-tauri/src/shell/dock.rs`) et `appbar::register` prennent le bord en paramètre, avec `ABE_TOP`.
- `card_rect` et `room_above` (`shell/card.rs`) prennent aussi le bord. Les aperçus et la grille d'icônes cachées appellent déjà `card_rect`, mais chaque appel doit passer ce bord.
- Les animations d'ouverture s'inversent en haut : `card-in` monte aujourd'hui de 8 px.
- **Passage en haut :** on glisse le dock par un espace vide. La fenêtre suit le pointeur (`screenY`), puis se cale en haut ou en bas au relâchement, selon la moitié de l'écran. Le réglage existe aussi dans Settings.
- **Dock verrouillé :** ce glisser est désactivé, car la doc dit que le dock verrouillé reste en place. Il ne l'est plus quand le sélecteur est ouvert, comme pour le tri des widgets aujourd'hui.
- **Verre pendant un déplacement :** aujourd'hui, `glass::set_region` relance la capture à chaque changement de position. Je le suspends pendant le déplacement, et je le relance une fois à l'arrivée. Ça vaut aussi pour l'étape 2.
- **Limite probable :** le menu Démarrer de Windows reste en bas, même avec le dock en haut. À vérifier à l'essai.

### 2. Masquage automatique
- Nouveaux réglages `autoHide` et `showOnDesktop`, désactivés par défaut.
- Nouveau `shell/autohide.rs` : un automate pur et testé. Le dock reste visible si le pointeur est dessus, si une carte, un aperçu ou la grille d'icônes est ouverte, si Start, le sélecteur ou Settings est ouvert, ou si un glisser est en cours, y compris un fichier venu de Windows.
- **Rester visible sur le bureau (F-011) :** l'automate lit aussi si le bureau est au premier plan, en réutilisant `is_desktop` de `shell/events.rs`, qui accepte aussi la barre Windows.
- **Touche Windows :** le dock revient quand Start s'ouvre, en lisant `start_is_open`. **Ça ne demande aucune surveillance du clavier**, donc ça respecte ton choix.
- **Le glissement déplace la fenêtre**, depuis Rust en 200 ms (G-10), en direction du bord, puis la cache. Une animation CSS ne convient pas : la fenêtre s'arrête à la hauteur de la barre, donc le dock serait coupé au-dessus du bord de l'écran.
- **`react` doit connaître cet état :** aujourd'hui `Resume` et la sortie du plein écran lancent `ShowDock`, qui ferait réapparaître un dock masqué. J'ajoute `autohidden` à `DockState`, avec un test pour chaque cas.
- **`place` aussi :** une app qui s'ouvre pendant le masquage redimensionne le dock et remettrait la fenêtre à l'écran. Tant qu'il est masqué, `place` enregistre seulement la taille.
- Le verre s'arrête pendant le masquage, via un nouveau champ de `ShellStatus`. Les tuiles restent montées et leurs relevés continuent, contrairement au plein écran, pour que le retour soit immédiat et à jour. **À mesurer :** si la largeur est périmée au retour d'une fenêtre cachée.
- Session verrouillée : aucun réveil.
- Le pointeur est relu par sondage, seulement si l'option est active. Si le coût mesuré dépasse le budget ci-dessous, je réduis la fréquence.
- **En plein écran, le bord ne fait jamais revenir le dock**, pour ne pas gêner un jeu.
- Le masquage automatique l'emporte sur « réserver le bord », et le réglage correspondant se grise. Il faut pour ça que `RowDef` accepte une condition de désactivation.
- **Bug connu de la référence à éviter :** la barre Windows qui remonte à côté du dock. Tant que l'option est active, la barre reste cachée même en mode « Auto-hide », sans changer ton réglage enregistré. `set_taskbar_mode` et le démarrage en tiennent compte.

### 3. Dock rétréci et défilement
- Poignées aux deux bouts, double-clic pour annuler, désactivées si le dock est verrouillé. Nouveau réglage `narrowWidth`, ignoré en pleine largeur.
- **Nouveau conteneur défilant dans `.dock` :** le verre et sa `canvas` sont dans `.dock`, et défileraient avec les tuiles si `.dock` défilait. Les poignées restent aussi en dehors.
- **Le rétrécissement actuel des apps :** `.slot--shrink` les écrase quand la barre dépasse l'écran. Je le coupe quand le dock est rétréci, sinon les apps s'écrasent au lieu de défiler. Le comportement de la pilule normale ne change pas.
- La molette et le pavé tactile font défiler avec un glissement. Les coins restent arrondis.
- **Conflit avec le volume :** la molette sur l'icône de son de la tuile d'état règle déjà le volume (`system-status/index.tsx`). Cette action garde la priorité, et le dock défile partout ailleurs.
- **Widgets hors de vue :** un `IntersectionObserver` et une option de `useProvider` qui se désabonne. `core/provider.ts` n'a pas besoin de changer, car une source sans abonné s'arrête déjà, et elle continue si une tuile visible la partage.
- Le verre recalcule la position des tuiles pendant le défilement, en ne gardant que les tuiles visibles, car il n'en accepte que 16.

### 4. Styles
- Un petit fichier par style dans `src/design/styles/`, sur le modèle de `black.css`. Une seule fonction décide si un style utilise le verre, au lieu du test `style === "liquid"` dans `Bar.tsx`.
- **Changer de style à chaud :** `GlassLayer` ne se recalcule que sur `data-theme`, et passer de Liquid à iOS ne le relance pas. Il doit aussi suivre `data-style` et la matière de Clear.
- **Si le verre échoue :** chaque style de verre a sa couleur pleine de repli, comme Liquid aujourd'hui.
- **iOS Glass :** le même shader, avec des valeurs `LOOK` par style pour une teinte plus profonde.
- **Midnight :** sombre profond avec un filet fin, sans capture d'écran.
- **White :** blanc plein, avec des jetons clairs forcés sur la barre, comme Black force les sombres.
- **Clear :** pas de barre, et un nouveau réglage `clearMaterial` (noir, blanc ou givré). Le givré passe par une nouvelle valeur du shader, transparente hors des tuiles. Les apps n'ont pas de `.tile` aujourd'hui, donc leur zone est ajoutée à la liste des rectangles.
- **Limite de Clear :** les espaces transparents entre les tuiles font partie de la fenêtre, donc un clic à ces endroits n'atteint pas l'app derrière.
- Clear n'a jamais été montré publiquement (G-11), donc **son look est une proposition**. Les autres se calent sur `_evidence/sheets/dock-themes.png`, qui reste privé.
- **Accent libre :** un sélecteur de couleur dans Settings. `sanitize` accepte déjà n'importe quelle couleur hexadécimale.

### 5. Glisser les apps
- `dock-pins` (`apps/pins.rs`) gagne `order`, en restant compatible avec le fichier actuel. Un `arrange` pur côté Rust applique l'ordre.
- **`stableOrder` doit changer :** il garde l'ordre précédent de la page, donc il ignorerait l'ordre enregistré. Après un déplacement, la source se relance aussitôt pour ne pas attendre les 1,5 s du relevé.
- L'ordre garde aussi les apps ouvertes non épinglées. Elles retrouvent leur place quand elles reviennent, dans la limite d'une liste de 200 clés.
- Une icône se déplace le long du dock sans déclencher le tri du widget entier. **Le widget Apps se déplace alors par Start ou la loupe**, seules zones non déplaçables en tant qu'apps. Les aperçus se ferment pendant un glisser, et relâcher n'active pas l'app.
- **Retirer :** la fenêtre du dock ne fait que la hauteur de la barre, donc une icône tirée ne peut pas s'afficher au-dessus. Elle s'estompe et un relâchement au-dessus d'un seuil la désépingle. Une app ouverte reste présente avec son point.
- **Épingler depuis le bureau ou l'Explorateur :** via `WindowEvent::DragDrop` de Tauri. Rust classe le chemin (`.exe` ou `.lnk`, dossier, fichier) et enregistre lui-même.
- Le glisser depuis Start dépend de ce que Windows fournit : à essayer, et noté comme limite si ça ne donne pas de chemin.
- **Dock verrouillé :** les icônes ne bougent plus et ne se retirent plus en glissant, comme les widgets. Épingler en déposant depuis Windows reste possible, car ça ne déplace rien.
- **Version aperçu :** elle a son propre dossier de données, donc ces écritures y sont permises, contrairement à `apps_menu_choose`. C'est ce qui me permet de tester l'ordre et les épingles sans toucher aux tiens. Ouvrir une app y reste interdit.
- Le sélecteur n'active aucun de ces glisser.
- Un widget ajouté s'ouvre et un widget retiré se replie, comme une app.

### 6. Menu et noms
- **Essai en lecture seule d'abord, sur tes vraies apps :**
  - `IApplicationDocumentLists` (public) pour les récents et fréquents.
  - Les fichiers `CustomDestinations` pour les tâches comme « Nouvelle fenêtre ». Leur nom vient d'un identifiant que beaucoup d'apps classiques ne déclarent pas. Je compare donc le programme ciblé par chaque raccourci à celui de l'app, plutôt que de recalculer ce nom.
  - Je n'utilise pas l'interface interne de Windows, que je crois changeante d'une version à l'autre.
- **Si l'essai montre que les tâches sont rarement lisibles**, je ne construis que les récents, et je te le dis à l'arrêt.
- `AppMenu` et `apps/menu.rs` gagnent ces sections au-dessus des lignes actuelles. **Si une app n'est pas lisible, son menu reste celui d'aujourd'hui.**
- **Sécurité :** la page envoie l'empreinte de la ligne (chemin et arguments), Rust relit la liste, retrouve la ligne et lance lui-même. La page ne fournit jamais de commande. Un simple numéro de ligne ne suffirait pas : si la liste change entre l'affichage et le clic, il lancerait autre chose. La version aperçu refuse ce lancement, donc **seul un essai de ta part confirmera qu'une ligne ouvre bien la bonne chose**.
- **Noms au survol :** une bulle dans la fenêtre `preview`, puisque le dock ne peut rien dessiner au-dessus de lui. Elle demande un mode à part, car `preview_show` se ferme pour une app sans fenêtre. Elle remplace le `title` natif des apps, pour éviter un double affichage. Start et la loupe gardent le leur.
- **Réglages :** `hoverNames` et `previews`. Aperçus coupés, la bulle sert aussi aux apps ouvertes.

### 7. Fichiers, dossiers, groupes
- `dock-pins` gagne `items` (fichier ou dossier) et `groups` (nom et apps). `AppEntry` gagne un `kind`.
- **Menu du clic droit, à ajouter :** fichier ou dossier (ouvrir, retirer), groupe (ouvrir, défaire), membre d'un groupe (ouvrir, sortir du groupe).
- **Pile de dossier :** une carte listant le contenu, limitée à 50 éléments, avec la même règle d'empreinte que les raccourcis.
- **Groupe :** on maintient une app sur une autre, puis une carte s'ouvre au clic, avec un nom modifiable. Sa tuile montre ses icônes en miniature et un point si l'une des apps est ouverte. Un groupe réduit à une app se défait. **On sort d'un groupe par le menu**, car la carte est une autre fenêtre et une icône ne peut pas la quitter en glissant.
- **Fichier supprimé ailleurs :** il quitte le dock, comme le fait déjà `keep_pin`.
- **Fichier survolant une app ouverte :** elle passe devant après un court délai, avec `bring_forward`. **Relâché sur une icône d'app, il n'est pas épinglé et rien ne se passe**, car on visait l'app et non le dock.

### 8. Widgets d'app, image de Start
- Identifiants dynamiques `pin:<clé>`, acceptés par `known()` dans `core/layout.ts` et `byId`. Le sélecteur liste les apps installées via `search_apps`.
- **Sélecteur :** ces apps peuvent être des centaines, et chaque icône demande une recherche dans le shell. Elles ne se chargent donc qu'une fois visibles, et le compteur de widgets ne les inclut pas.
- **Ouverture :** `apps_activate` refuse une app ni épinglée ni ouverte, donc ces tuiles lancent via `search_open`. Ses identifiants (`app:<nom interne>`) viennent du nom de l'app et devraient tenir d'un lancement à l'autre, mais la liste se charge au démarrage. Si elle n'est pas encore prête, la tuile attend au lieu d'échouer sans rien dire.
- **App désinstallée ou dossier supprimé :** la tuile quitte le dock, car l'historique de la référence signale des tuiles qui n'ouvrent rien comme un bug.
- Elles partagent la source `apps` pour afficher leur point d'app ouverte, sans relevé de plus.
- **Dossier comme widget :** aucune liste de dossiers n'existe, donc un bouton « Add a folder… » dans le sélecteur ouvre la fenêtre Windows de choix de dossier (`IFileOpenDialog`).
- **Image de Start :** choisie dans Settings avec un nouveau type de ligne, réduite à 128 px dans la page, gardée dans le stockage de Shelf. Le logo actuel reste le choix par défaut.

## Choix que j'ai faits à ta place

Dis-moi si l'un d'eux ne te va pas.
- **Dock en haut :** aussi réglable dans Settings, alors que la référence ne le permet qu'en glissant, pour avoir une solution de repli.
- **Clear :** les apps reçoivent aussi un fond de la matière choisie, sinon les icônes se perdent sur le fond d'écran.
- **Bord du masquage :** toute la largeur de l'écran réveille le dock, pas seulement sous la pilule, comme la barre Windows.
- **Valeurs par défaut :** rien ne change à l'ouverture : pilule en bas, Liquid Glass, masquage désactivé.
- **Textes de l'interface :** en anglais comme le reste.

## Vérification

| Niveau | Quoi |
|---|---|
| Automatique | `npm test` et `cargo test --lib` à chaque étape, test écrit avant le code |
| Banc visuel | Scènes nouvelles : chaque style en clair et sombre, chaque matière de Clear, en haut, pleine largeur, rétréci, menu long, pile, groupe, bulle de nom. Je regarde chaque image avant de l'accepter |
| Combinaisons | Tests des combinaisons à risque : en haut + masquage, en haut + cartes, pleine largeur + défilement, masquage + plein écran, masquage + réservation |
| Bout en bout | `src/test/e2e.sh` étendu. Il ferme ton Shelf, donc **seulement aux arrêts, après t'avoir prévenu**, avec la barre et les réglages contrôlés après chaque passage |
| Mesures | Glissement du masquage et replis mesurés image par image, comme pour la fermeture d'app |
| Budget au repos | Avec `src/test/resources.ps1`, comparer à la dernière mesure, unique (0,31 % de CPU, 240 Mo). **Options désactivées : pas de hausse notable. Masquage actif : au plus 0,1 point de CPU en plus** |

**Tests clés à écrire en premier :**

| Étape | Ce qu'ils doivent prouver |
|---|---|
| 0 | Le compte à rebours de l'échantillon ne dépend pas du moment de chargement ; `e2e.sh` remet `dock-pins` en place |
| 1 | Rectangle du dock et réservation en haut, à 100, 125 et 150 % ; carte sous le dock en haut, sans sortir de l'écran ; dock verrouillé immobile |
| 2 | Chaque condition de l'automate ; `Resume` et sortie du plein écran ne montrent pas un dock masqué ; aucun réveil en plein écran ; `place` ne remet pas le dock à l'écran |
| 3 | La molette sur l'icône de son règle le volume et ne fait pas défiler ; une tuile hors de vue arrête son relevé, sauf si une tuile visible partage sa source |
| 4 | Passer de Liquid à iOS change les valeurs du verre sans relancer la capture ; `sanitize` accepte les nouveaux styles et rejette le reste |
| 5 | Ordre enregistré appliqué et conservé par `stableOrder` ; ancien fichier `dock-pins` encore lu ; classement des chemins ; dock verrouillé |
| 6 | Une empreinte périmée ne lance rien ; un fichier de raccourcis illisible laisse le menu actuel |
| 7 | Fichier supprimé retiré ; groupe à une app défait ; fichier lâché sur une icône non épinglé ; dossier limité à 50 éléments |
| 8 | Identifiant `pin:` accepté et conservé ; app disparue retirée du dock |

**Ce que je ne peux pas vérifier seul**, et qui ira dans `docs/manual-checks.md` :
- Les vrais glisser-déposer Windows et le réveil du dock par le bord. Pour ces deux points, je teste les décisions et la page, pas le geste réel.
- L'ouverture réelle d'une ligne de liste de raccourcis ou d'un élément de pile.
- Le lancement de Shelf au démarrage de Windows (F-023) et l'absence de clignotement dans OBS (F-021). Je ne prévois aucun travail là-dessus, sauf si tu vois un problème.

**Docs :** à chaque PR, `manual-checks.md` et le statut dans `15-feature-checklist.md`. `12-gaps.md` reçoit tes décisions dès la première.

## Déroulement

- **Sans sous-agents**, comme tu l'as demandé, donc la relecture finale du code est la mienne, moins fiable qu'un regard neuf. Je te le rappellerai dans le rapport.
- **Plan dans le dépôt :** une fois approuvé, je l'enregistre dans `docs/superpowers/plans/2026-11-05-bar-and-apps.md`. Je détaille les tests de chaque étape quand je l'attaque, car l'essai de l'étape 6 peut changer la suite.
- **Commits :** un par étape, autorisés par ton accord sur ce plan.
- **Quatre arrêts pour que tu essaies**, après les étapes 2, 4, 6 et 8. Je préviens avant chaque relance, car Shelf verrouille `shelf.exe` pendant qu'il tourne, et je contrôle ta barre après.
- **Une PR par arrêt (recommandé) :** si une étape tardive déçoit, tout ce qui précède est déjà dans `main`. Chaque arrêt a sa branche, partie de `main` à jour, et chaque merge attend ton feu vert. Dis-moi si tu préfères une seule PR à la fin.
- Entre deux arrêts, je travaille dans la version aperçu, qui ne touche ni à ta barre ni à tes réglages. Elle peut quand même ouvrir des fenêtres et prendre le focus : je te préviendrai avant le premier essai de ce genre.
- Les règles en place restent valables : aucun geste de souris scripté, aucune image de la référence dans le produit, et rien de publié.
