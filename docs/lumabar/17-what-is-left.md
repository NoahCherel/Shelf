# Comparaison complète : Lumabar vs Shelf (Ce qu'il reste à faire)

Ce document compare, fonctionnalité par fonctionnalité (**F-001 à F-090**) et widget par widget (**W-001 à W-103 + extras G-14**), ce qui existe dans **Lumabar (v1.2.13)** (d'après l'étude dans `docs/lumabar/README.md`, `docs/lumabar/15-feature-checklist.md` et `docs/lumabar/widgets/*.md`) avec ce qui est effectivement implémenté dans le code de **Shelf** (`src/` et `src-tauri/src/`).

## Bilan global en chiffres

- **Fonctionnalités socle (Barre, Styles, Apps, Cartes, Réglages, Automatisations, Plateforme) :** **78 / 90 faites**. Sur les 12 autres : **5 partielles** (`F-023` mesure faite et correction en attente d'un redémarrage, `F-046` sans *End task*, `F-060` sans points « Nouveau », `F-068` sans mise à jour ni feedback, `F-081` pour les alertes seulement), **1 écartée** (`F-089`, build 32 bits) et **6 en attente de leur widget** (`F-076` et `F-082` Calendar, `F-078` suivi d'abonnements, `F-079` et `F-090` Todos, `F-083` Screen Time). Hors catalogue, les raccourcis `Win+A/S/N` ont été essayés puis écartés (voir 1.9).
- **Lots terminés :** 1.1 à 1.4 avec `docs/superpowers/plans/2026-11-13-finir-1-1-a-1-4.md` (PR #11) ; 1.7 à 1.9 avec `docs/superpowers/plans/2026-11-16-finir-1-7-a-1-9.md` (PR #12 toasts, #13 automatisations, #14 plateforme, puis #15 qui retire `Win+A/S/N`). Ce qu'il reste à essayer à la main est dans `docs/manual-checks.md`.
- **Panneaux système (Spécificité Shelf) :** Shelf possède déjà ses propres cartes natives **Sound**, **Wi-Fi**, **Bluetooth**, **Quick Settings**, **Search** et **Notifications** dans `src/panels/`, regroupées derrière la tuile `system-status` et la loupe d'`apps`.
- **Catalogue de widgets :** **19 / 103 widgets du catalogue** (+ 1 widget propre à Shelf `system-status`, les widgets dynamiques d'apps/dossiers `pin:*` et les dossiers de widgets `folder:*`) sont présents dans `src/widgets/`. Il reste **84 widgets du catalogue** (+ **5 widgets hors-catalogue G-14**) à créer.

---

## 1. Fonctionnalités du socle (F-001 à F-090)

### 1.1. Le Dock (`F-001` à `F-023`) — 22 / 23 faits

Dans `src-tauri/src/shell/dock/` (`mod.rs`, `geometry.rs`, `follow.rs`, `many.rs`, `extras.rs`), `src-tauri/src/shell/displays.rs`, `src-tauri/src/shell/autohide.rs` et `src/windows/dock/Bar.tsx`, **22 fonctionnalités sur 23 sont terminées** :
- ✅ `F-001` : Forme de pilule, centrée ou déplaçable, ajustée au contenu
- ✅ `F-002` : Bord inférieur, réservation d'espace d'écran (`appbar`)
- ✅ `F-003` : Mise à l'échelle à partir d'une seule valeur de hauteur de tuile (`--T`)
- ✅ `F-004` : Mode pleine largeur (avec placement libre au pixel près)
- ✅ `F-005` : Glisser sur le bord supérieur (ou via Settings), mémorisé, cartes s'ouvrant vers le bas
- ✅ `F-006` : Curseur de taille avec repères S, M, L
- ✅ `F-007` : Distance par rapport au bord de l'écran (`edgeGap`)
- ✅ `F-008` : Espacement entre les widgets (`spacing`)
- ✅ `F-009` : Flotter au-dessus des fenêtres (`floatOverWindows`)
- ✅ `F-010` : Masquage automatique au pointeur et à l'ouverture de Démarrer (touche Win)
- ✅ `F-011` : Masquage automatique : option « Rester visible sur le bureau » (`showOnDesktop`)
- ✅ `F-012` : Verrouiller le dock (`lockDock`)
- ✅ `F-013` : Rétrécir en tirant les extrémités ; double-clic pour annuler (`narrowWidth`)
- ✅ `F-014` : Défilement horizontal fluide à la molette et au pavé tactile
- ✅ `F-015` : Masquer en plein écran, arrêter le dessin et mettre les providers en pause
- ✅ `F-016` : Reprendre correctement après veille et déverrouillage de session
- ✅ `F-017` : Choisir l'écran du dock (`Displays > One screen` et liste `Screen` dans Settings), mémorisé par l'identifiant stable de l'écran (`monitorDevicePath`), avec retour quand on le rebranche ; en attendant, le dock se pose sur l'écran principal. Le dock, son verre, ses cartes et ses aperçus suivent l'écran du dock, et le déplacer à la main sur un autre écran l'y pose (`dock_drag_settle`)
- ✅ `F-018` : Un dock sur chaque écran (`Displays > All screens`), chacun réservant son propre bord, ouverts et fermés quand on branche ou débranche un écran. **Limites voulues :** seul le dock principal se déplace à la main et se masque automatiquement, et les docks en plus prennent le fond plein du style au lieu du verre vivant (comme avec *Show in screenshots*)
- ✅ `F-019` : Le dock suit le pointeur (`Displays > Follow pointer`) : tenir le pointeur une demi-seconde au bord d'un autre écran l'y amène ; rien ne bouge pendant un jeu, une session verrouillée ou un glisser
- ✅ `F-020` : Résister aux outils tiers qui tentent de déplacer le dock
- ✅ `F-021` : Pas de clignotement dans les enregistrements d'écran (`visibleInCaptures` / `WDA_EXCLUDEFROMCAPTURE`)
- ✅ `F-022` : Animations de glissement ; les widgets et icônes s'écartent et se replient (`useComeAndGo`)

**À vérifier à la main :** le multi-écran a été écrit et testé par des tests automatiques sur un PC à un seul écran. Les essais à deux écrans sont listés dans `docs/manual-checks.md` (section « Screens »).

**Ce qu'il reste à faire sur le Dock :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-023** | P2 | **Réservation dès la première seconde au boot** : réserver l'espace d'écran immédiatement à l'ouverture de session avant que les fenêtres ne prennent toute la place | ⚠️ **Partiel** : la mesure est en place (`shell/boot.rs` écrit dans `diag.log`, avec `SHELF_DIAG=1`, les délais ouverture de session → lancement de Shelf → `setup` → réservation). La correction dépend de ce que donne cette mesure après un redémarrage (`docs/manual-checks.md`, « Starting with Windows »). Ne se voit qu'avec *Float over windows* désactivé |

---

### 1.2. Barre des tâches Windows (`F-024` à `F-026`) — 3 / 3 faits

Dans `src-tauri/src/shell/taskbar.rs` :
- ✅ `F-024` : Choix `Hidden` ou `Auto-hide`
- ✅ `F-025` : Restauration exacte en quittant, avec récupération après crash (`--watch-taskbar` et `--restore-taskbar`)
- ✅ `F-026` : Gestion par écran : la barre Windows n'est cachée que sur les écrans qui portent un dock ; sur les autres elle reste, en masquage automatique (`Taskbar::set_docked`)

---

### 1.3. Styles et Apparence (`F-027` à `F-037`) — 11 / 11 faits

Dans `src/design/styles/`, `src/design/glass/GlassLayer.tsx`, `src/core/look.ts` et `src-tauri/src/system/media.rs` :
- ✅ `F-027` : Liquid Glass avec réfraction WebGL en direct
- ✅ `F-028` : iOS Glass
- ✅ `F-029` : Midnight
- ✅ `F-030` : Black
- ✅ `F-031` : White
- ✅ `F-032` : Clear, avec widgets noirs, blancs ou givrés (`clearMaterial`)
- ✅ `F-033` : Jeux de tuiles sombres et clairs (`theme: auto | dark | light`)
- ✅ `F-034` : 9 couleurs d'accentuation système
- ✅ `F-035` : Couleur d'accent personnalisée libre, et **Album art** : la pastille en forme de disque suit la pochette du titre en cours, lue dans la session média de Windows (`system/media.rs`), sans attendre les widgets *Now Playing*. Sans couleur à prendre (pochette noir et blanc, rien qui joue), l'accent revient au bleu par défaut. Le décodage d'une vraie pochette reste à essayer à la main (`docs/manual-checks.md`, « Album art accent »)
- ✅ `F-036` : Le verre se met au repos quand rien ne change à l'écran
- ✅ `F-037` : Le verre reste hors de sa propre capture d'écran

---

### 1.4. Applications et rôle de barre des tâches (`F-038` à `F-054`) — 16,5 / 17 faits

Dans `src/widgets/apps/`, `src-tauri/src/apps/` et `src-tauri/src/shell/keys.rs` :
- ✅ `F-038` : Bouton Start ouvrant/fermant Démarrer (plus bouton Loupe pour Search)
- ✅ `F-039` : Épingles de la barre des tâches Windows et fenêtres ouvertes
- ✅ `F-040` : Point d'ouverture + plaque active + clic pour focus ou minimiser
- ✅ `F-041` : Une seule icône par application, applications du Store incluses
- ✅ `F-042` : Icônes nettes haute définition
- ✅ `F-043` : Noms au survol dans une bulle (`hoverNames`)
- ✅ `F-044` : Aperçus de fenêtres en direct (DWM) au survol avec titre, bouton fermer et *peek* (`previews`)
- ✅ `F-045` : Jump lists (récents/fréquents et tâches `CustomDestinations`)
- ✅ `F-046` *(en quasi-totalité)* : Épingler, Désépingler, Fermer la fenêtre
- ✅ `F-047` : Menu rapide Win+X sur Start et dossiers d'accès rapide sur l'Explorateur de fichiers
- ✅ `F-048` : Glisser depuis Windows pour épingler, glisser le long du dock pour réordonner, tirer hors du dock pour désépingler
- ✅ `F-049` : Fichiers, dossiers et piles de dossiers (*stacks*) sur le dock
- ✅ `F-050` : Groupes d'applications (maintenir une app sur une autre, carte avec nom modifiable)
- ✅ `F-051` : Survoler une app ouverte avec un fichier la ramène au premier plan
- ✅ `F-052` : N'importe quelle app installée ou dossier comme widget indépendant (`pin:<clé>`)
- ✅ `F-053` : Image personnalisée sur le bouton Start (`startImage`)
- ✅ `F-054` : Raccourci `Win+T` : un crochet clavier bas niveau (`shell/keys.rs`) amène le dock ; flèches (ou `Win+T` à nouveau) entre les apps ouvertes, `Tab` entre les fenêtres avec leurs aperçus, `Entrée` pour activer, `Échap`, un clic, toute autre touche ou 8 secondes sans rien pour sortir (`widgets/apps/keyNav.ts`). Rien n'est enregistré, et la combinaison passe à Windows pendant un jeu en plein écran. **Limite :** une app rangée dans un groupe n'est pas atteinte. À essayer à la main sur la vraie version (`docs/manual-checks.md`, « Win+T »)

**Ce qui a été écarté :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-046** *(partiel)* | P2 | **Action « End task » (Fin de tâche)** dans le menu clic droit d'une application ouverte | ➖ **Écarté volontairement** (jugé risqué ; le Gestionnaire des tâches est accessible via clic droit sur Start) |

---

### 1.5. Gestion des widgets (`F-055` à `F-061`) — 6,5 / 7 faits

Dans `src/windows/picker/` :
- ✅ `F-055` : Menu clic droit sur le dock (`Widgets…`, `Settings`, `Lock dock`, `Quit`)
- ✅ `F-056` : Sélecteur avec barre latérale, catégories, recherche et compteur
- ✅ `F-057` : Vraies tuiles dans le sélecteur ; clic pour ajouter ou retirer
- ✅ `F-058` : Badges `−` sur le dock pendant que le sélecteur est ouvert
- ✅ `F-059` : Glisser pour réordonner les widgets
- ✅ `F-060` *(en partie)* : Coches (`Check marks`) sur les widgets déjà présents dans la barre (y compris rangés dans un dossier)
- ✅ `F-061` : Affichage de données d'exemple tant qu'un compte n'est pas connecté
- ✅ `F-061b` : **Dossiers de widgets** (façon macOS/iOS) : glisser-maintenir un widget sur un autre (ou via clic droit *New folder* / *Move to*) pour les regrouper dans une tuile carrée à grille 2×2 ; clic pour ouvrir la carte dossier avec tuiles live, titre éditable, navigation vers les cartes de détail avec bouton retour, sortie vers le dock et dégroupage (`src/core/folderWidget.tsx`, `src/widgets/_shared/FolderCard.tsx`)

**Ce qu'il reste à faire :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-060** *(partiel)* | P2 | **Points rouges « Nouveau » (*Red new dots*)** sur les nouveaux widgets dans le sélecteur et les nouvelles options dans Settings | ❌ **Absent** |

---

### 1.6. Réglages / Settings (`F-062` à `F-068`) — 6 / 7 faits

Dans `src/windows/settings/schema.ts` :
- ✅ `F-062` : Fenêtre style Réglages Système Mac
- ✅ `F-063` : Section Appearance
- ✅ `F-064` : Section Dock avec infobulles (`tip`)
- ✅ `F-065` : Mode barre des tâches Windows et lancement au démarrage
- ✅ `F-066` : Format 12/24 heures et affichage des secondes
- ✅ `F-067` : Interrupteurs pour les noms au survol et les aperçus de fenêtres
- ✅ *(Lié à F-017..019)* : Réglage `Displays` (`One screen`, `All screens`, `Follow pointer`) et liste `Screen` dans la section Dock
- ✅ *(Lié à F-076..081)* : Page `Automations`, entre General et About : *AI limits*, *Alert sound* (choisir un son le joue) et *Quiet hours* (*From* / *To*). Les automatisations qui attendent leur widget y ajouteront leur interrupteur

**Ce qu'il reste à faire :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-068** *(partiel)* | P3 | **Vérification de mise à jour, notice de mise à jour et formulaire de Feedback** (message, captures, rapport avec logs/config) dans `About` | ⚠️ **Partiel** (`About` affiche la version statique ; pas d'auto-updater ni de formulaire de feedback, conformément à G-17 pour un outil privé) |

---

### 1.7. Cartes et Interactions (`F-069` à `F-075`) — 7 / 7 faits

Dans `src/windows/card/CardWindow.tsx`, `src/design/parts/Card.tsx`, `src-tauri/src/shell/toast.rs`, `src/windows/toast/` et `src/windows/dock/` :
- ✅ `F-069` : Ouverture au-dessus (ou en-dessous) du widget avec glissement, sans jamais déborder de l'écran
- ✅ `F-070` : Anatomie standard des cartes (en-tête, corps, pied de page, action)
- ✅ `F-071` : Flux de connexion (`ConnectCard`), rafraîchissement, déconnexion et `Logout`
- ✅ `F-072` : Menus clic droit spécifiques aux tuiles
- ✅ `F-073` : Toasts. N'importe quelle page appelle `showToast` (`src/core/toast.ts`) ; la file Rust (`shell/toast.rs`) les garde pendant un plein écran ou une session verrouillée (et les heures calmes, F-080), jette ceux devenus faux (`expiresAt`) ou attendus plus de 24 h, et les montre un par un dans une fenêtre `toast` créée à la demande, à droite au-dessus du dock, sans prendre le focus. 8 secondes, temps suspendu sous le pointeur. Le bouton d'action passe par `open-request`, que seul le dock principal reçoit (`useOpenRequests`). **Coût mesuré :** environ +58 Mo pendant qu'un toast est à l'écran, rendus quand la fenêtre est détruite (accepté)
- ✅ `F-074` : Le nom d'un widget dans la bulle des apps (`preview_tip`), après 600 ms de survol, sous le réglage *Names on hover*. `apps` et `system-status` nomment déjà chacune de leurs parties ; une app épinglée seule prend le nom affiché par sa tuile
- ✅ `F-075` : Messages d'erreur en langage clair

**À vérifier à la main :** `docs/manual-checks.md`, « Toasts » et « Widget names ».

---

### 1.8. Automatisations (`F-076` à `F-083`) — 2,5 / 8 faits

Dans `src/automations/`, `src-tauri/src/shell/toast.rs` et `src-tauri/src/system/tone.rs`, réglées dans la page *Automations* de Settings :
- ✅ `F-077` : Alerte avant limite IA, pour Claude : un toast à 80 % puis à 95 % de la session de 5 h ou de la semaine (G-13), une seule fois par fenêtre de limite, même après un redémarrage (mémoire dans le store `automations`). Son bouton *Details* ouvre la carte du widget Claude présent sur le dock. Les autres IA suivront leurs widgets (W-003 à W-010). Tourne dans le dock principal seulement (`useAutomations`)
- ✅ `F-080` : Heures calmes, 22:00–08:00 par défaut, désactivées au départ. Elles retiennent chaque toast, qui sort à leur fin ; un toast devenu faux entre-temps (limite remise à zéro) est jeté
- ✅ `F-081` *(pour les alertes)* : Son d'alerte choisi parmi ceux de `%WINDIR%\Media` (*None*, *Notify*, *Calendar*, *Chimes*, *Ding*, *Tada*, *Alarm*), joué avec chaque toast qui le demande. Minuteurs, Pomodoro, calendrier et To-Do y brancheront le leur (`play_tone`) avec W-013, W-014, W-016 et W-018

**Ce qui attend son widget.** Il trouvera prêts `showToast` (prévenir), `play_tone` (sonner), `open-request` (ouvrir sa carte depuis un toast ou un raccourci) et la page *Automations* (son interrupteur) :

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-076** | P3 | **Pause musique avant les réunions** : met en pause le média en cours ~1 min avant un événement du calendrier | ⏳ en attente de **W-018 Calendar** |
| **F-078** | P3 | **Rappels de renouvellement** : rappelle avant le renouvellement d'un abonnement et demande si on en a toujours besoin | ⏳ en attente d'un **suivi d'abonnements** (aucun widget du catalogue ne le porte encore) |
| **F-079** | P3 | **Demandes de review → To-Dos** : transforme automatiquement les demandes de review GitHub en tâches dans le widget Todos | ⏳ en attente de **W-016 Todos** (et d'un jeton GitHub `ghp_`) |
| **F-082** | P3 | **Calendrier unifié** : la carte Calendrier regroupe sur une même grille les événements iCal, renouvellements d'abonnements, virements (*payouts* Stripe/etc.), échéances To-Do et heures de reset des limites IA | ⏳ en attente de **W-018 Calendar** |
| **F-083** | P3 | **Résumés quotidiens et hebdomadaires Screen Time** : notification au-dessus du dock chaque jour (et bilan de la semaine le lundi) avec bouton *Details* | ⏳ en attente de **W-012 Screen Time** |

**À vérifier à la main :** `docs/manual-checks.md`, « Quiet hours and alert sound » et « AI limits ».

---

### 1.9. Plateforme (`F-084` à `F-090`) — 5 / 7 faits (F-089 écarté, F-090 en attente, raccourcis de panneaux écartés)

- ✅ `F-084` : Runtime de providers avec cache sur disque et pause en plein écran / hors vue
- ✅ `F-085` : Stockage sécurisé des clés API via DPAPI (`secrets.rs`) et injection côté Rust (`net.rs`)
- ✅ `F-086` : Windows 11 et Windows 10 (64-bit)
- ✅ `F-087` : *Launch at startup* suit le Gestionnaire des tâches. `autostart_get` (`src-tauri/src/system/mod.rs`) lit aussi `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`, où l'onglet Démarrage note une app désactivée par un premier octet impair ; allumer ou éteindre depuis Shelf efface cette marque, et Settings relit l'état en reprenant le focus
- ✅ `F-088` : Réseaux d'entreprise et réveil. `reqwest` suit le proxy réglé dans Windows (feature `system-proxy`) et le magasin de certificats de Windows (`native-tls`, où Zscaler pose sa racine) ; un certificat refusé donne un message clair au lieu d'une erreur brute. Après une erreur hors ligne, un widget réessaie à 5 s, 15 s, 30 s puis toutes les 60 s, et tout de suite quand Windows annonce le retour du réseau (`online`), en gardant ses dernières valeurs. **Limite :** les proxys par script PAC ne sont pas suivis

**Ce qui reste :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-089** | P3 | **Build 32-bit** | ➖ **Écarté volontairement** (outil privé sur un PC 64 bits) |
| *(Lié aux panneaux)* | — | **Raccourcis globaux `Win+A`, `Win+S`, `Win+N`** pour ouvrir les cartes Quick Settings, Search et Notifications de Shelf au lieu de celles de Windows | ➖ **Écarté** (2026-11-17). Essayé puis retiré : sur Windows 11 25H2, Windows ouvre son propre panneau même quand le crochet clavier de Shelf avale la lettre (vérifié avec un crochet de test placé en tête : seules les touches simulées sont bloquées), et la valeur `DisabledHotkeys` de l'Explorateur n'y change rien. Ces raccourcis restent à Windows |
| **F-090** | P3 | **Raccourci global `Alt+T`** pour ouvrir la carte *Todos* depuis n'importe quelle application | ⏳ en attente de **W-016 Todos** (le crochet clavier de `shell/keys.rs` l'accueillera : une touche de plus dans `key_of` et la cible `widget:todos` d'`open-request`) |

**À vérifier à la main :** `docs/manual-checks.md`, « Startup and Task Manager », et « Network back after sleep ».

---

## 2. Comparaison des 103 Widgets du catalogue (+ extras G-14)

### Nuance importante : Widgets déjà couverts autrement dans Shelf

**5 widgets du catalogue de Lumabar ont déjà leur logique ou leur carte dans Shelf**, mais sous forme de boutons intégrés à `system-status` ou `apps` plutôt que sous forme de tuiles de dock séparées :

1. **W-036 Tray** (P1) : Dans Shelf, le chevron de `system-status` ouvre et repositionne la vraie grille d'icônes cachées de Windows au-dessus du dock (`tray.rs`). Il n'y a pas de tuile carrée `Tray` séparée dans le sélecteur.
2. **W-043 Quick Toggles** (P1) : Dans Shelf, la carte `QuickCard.tsx` existe (Wi-Fi, Bluetooth, Mode avion, Ne pas déranger, Éclairage nocturne, Économiseur d'énergie, Luminosité, Volume), mais il n'y a pas la **large tuile de dock** `Quick Toggles` affichant directement les pilules Wi-Fi/Bluetooth et boutons Hotspot/Avion sur la barre (ni les toggles supplémentaires *Ethernet*, *Microphone*, *Camera*, *Keep Awake*, *Desktop Icons*, *Display Mode*, ni le niveau de batterie par appareil Bluetooth dans `BluetoothCard`).
3. **W-044 Brightness** (P2) : Le contrôle de luminosité WMI/Display existe dans `brightness.rs` et dans `QuickCard`, mais pas comme **tuile curseur dédiée sur le dock**.
4. **W-050 Audio Output** (P1) : Le mixeur par application et le choix de sortie (`IPolicyConfig`) existent dans `SoundCard.tsx` et le volume à la molette est sur l'icône Son de `system-status`, mais il n'existe pas la **tuile curseur large `Audio Output`** sur le dock.
5. **W-074 Search** (P2) : La carte de recherche d'apps, de fichiers récents/indexés et web existe dans `SearchCard.tsx` (ouverte par la loupe de la tuile `apps`), mais pas comme **tuile champ de saisie `Search` indépendante** (`Search or open`) sur le dock.

---

### 2.1. Catégorie : AI (10 widgets — 10 faits, 0 manquant)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-001** | P1 | **Claude Usage** | ✅ **Fait** (`src/widgets/claude-usage/`) | *(Note : la carte `ClaudeCard` de Shelf s'appuie sur le flux status-line local `G-05` et affiche Session + Weekly + projection de rythme + modèles 7j)* |
| **W-002** | P1 | **Claude Plan Usage** | ✅ **Fait** (`src/widgets/claude-plan-usage/`) | Session, Weekly + 3e ligne avec le modèle le plus utilisé et ses tokens lus depuis les logs JSONL locaux de Claude Code (`~/.claude/projects`, sans toucher aux identifiants) |
| **W-003** | P2 | **ChatGPT Usage** | ✅ **Fait** (`src/widgets/chatgpt-usage/`) | Limites Codex CLI (Session 5h + Weekly) lues depuis les logs locaux `~/.codex/sessions/**/*.jsonl` (`rate_limits`), carte avec badge de plan et courbe d'évolution (sans toucher aux identifiants) |
| **W-004** | P2 | **Gemini Usage** | ✅ **Fait** (`src/widgets/gemini-usage/`) | Quotas Antigravity (`Session` 5h + `Weekly` 7j, groupes Gemini & Claude/GPT) lus via la commande officielle `agy -p "/usage" --output-format json`, cache local et courbe d'évolution (sans toucher aux identifiants OAuth) |
| **W-005** | P2 | **Grok Usage** | ✅ **Fait** (`src/widgets/grok-usage/`) | Crédits Grok CLI via sous-processus `grok agent stdio` (ACP `_x.ai/billing`, sans lire `~/.grok/auth.json`), carte de détail, tendance et alertes 80 % / 95 % |
| **W-006** | P2 | **DeepSeek Balance** | ✅ **Fait** (`src/widgets/deepseek-balance/`) | Solde API DeepSeek (`GET /user/balance` avec clé `sk-` chiffrée DPAPI) + suivi local des dépenses (Today, 7 days, runway, tendance) |
| **W-007** | P2 | **GLM Usage** | ✅ **Fait** (`src/widgets/glm-usage/`) | Quotas Z.ai / BigModel Coding Plan (Session, Weekly, MCP, auto-détection plateforme, clé DPAPI) + alertes 80 % / 95 % |
| **W-008** | P2 | **OpenCode Usage** | ✅ **Fait** (`src/widgets/opencode-usage/`) | Usage local OpenCode 100 % hors-ligne (`opencode.db` v1 `message` + v2 `session_message`, tokens/coût 5h/7j/all-time, modèles gratuits inclus) |
| **W-009** | P2 | **OpenCode Plan Usage** | ✅ **Fait** (`src/widgets/opencode-plan-usage/`) | Variante jauge 3 lignes (Session, Weekly, top model) partageant la carte OpenCode |
| **W-010** | P2 | **Cursor Usage** | ✅ **Fait** (`src/widgets/cursor-usage/`) | Quotas Cursor (`Auto` & `API`, cycle de facturation, dépenses on-demand) + alertes 80 % / 95 % |

---

### 2.2. Catégorie : Productivity (9 widgets — 0 fait, 9 manquants)

*(Note : les horloges actuelles de Shelf ouvrent une petite grille mensuelle + météo dans `DateCard.tsx`, mais le vrai widget **Calendar** avec événements iCal et ajout d'événements n'est pas encore construit).*

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-011** | P2 | **Day Timeline** | ❌ **Manquant** | Frise horaire de la journée avec curseur de l'heure actuelle et blocs d'événements |
| **W-012** | P1 | **Screen Time** | ❌ **Manquant** | Débloque `F-083` (résumés quotidiens et hebdomadaires, par `showToast`). Suivi du temps passé par app active (et sites web), tuile résumé + grande carte à 2 colonnes (graphique horaire Jour/Semaine, focus le plus long, changements d'apps, liste des apps les plus utilisées, épinglage d'app) |
| **W-013** | P2 | **Pomodoro** | ❌ **Manquant** | Son de fin de session par `play_tone` (`F-081`). Minuteur de sessions focus/pause sur le dock + carte de contrôle et réglages de durée |
| **W-014** | P2 | **Timer** | ❌ **Manquant** | Son de fin par `play_tone` (`F-081`). Compte à rebours rapide avec contrôles |
| **W-015** | P2 | **Stopwatch** | ❌ **Manquant** | Chronomètre avec tours (*laps*) |
| **W-016** | P2 | **Todos** | ❌ **Manquant** | Débloque `F-079` (reviews GitHub → tâches) et `F-090` (`Alt+T`, par le crochet de `shell/keys.rs` et `open-request`). Tuile compteur de tâches + carte liste de tâches éditable avec dates d'échéance |
| **W-017** | P2 | **Notes** | ❌ **Manquant** | Tuile bloc-notes rapide + carte d'édition locale |
| **W-018** | P1 | **Calendar** | ❌ **Manquant** | Débloque `F-076` (pause musique avant réunion) et `F-082` (calendrier unifié). Tuile prochain événement + grande carte Calendrier (flux iCal Google/Outlook/iCloud, grille mensuelle avec logos des sources, liste des événements du jour, création d'événement local) |
| **W-019** | P2 | **Currency** | ❌ **Manquant** | Convertisseur / taux de change entre deux devises sur le dock + carte de conversion |

---

### 2.3. Catégorie : Finance (15 widgets — 2 faits, 13 manquants)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-020** | P2 | **Total Revenue** | ❌ **Manquant** | Agrégateur de revenus multi-sources avec objectif mensuel (*monthly goal*) |
| **W-021** | P3 | **Polar** | ❌ **Manquant** | Revenus Polar sur 7 jours + variation (`polar_oat_`) |
| **W-022** | P3 | **Polar Chart** | ❌ **Manquant** | Revenus Polar sur 7 jours avec courbe sur 14 jours (`Sparkline`) |
| **W-023** | P1 | **Stripe** | ✅ **Fait** (`src/widgets/stripe/`) | — |
| **W-024** | P1 | **Stripe Chart** | ✅ **Fait** (`src/widgets/stripe-chart/`) | — |
| **W-025** | P3 | **Dodo Payments** | ❌ **Manquant** | Revenus Dodo Payments sur 7 jours + variation |
| **W-026** | P3 | **Dodo Chart** | ❌ **Manquant** | Revenus 7 jours + courbe 14 jours Dodo Payments |
| **W-027** | P3 | **Shopify** | ❌ **Manquant** | Ventes nettes Shopify sur 7 jours (`shpat_` ou Client ID/Secret) |
| **W-028** | P3 | **Shopify Chart** | ❌ **Manquant** | Ventes 7 jours + courbe 14 jours Shopify |
| **W-029** | P3 | **Lemon Squeezy** | ❌ **Manquant** | Revenus nets Lemon Squeezy sur 7 jours |
| **W-030** | P3 | **Lemon Squeezy Chart** | ❌ **Manquant** | Revenus 7 jours + courbe 14 jours Lemon Squeezy |
| **W-031** | P3 | **Paddle** | ❌ **Manquant** | Revenus nets Paddle sur 7 jours (`pdl_live_apikey_`) |
| **W-032** | P3 | **Paddle Chart** | ❌ **Manquant** | Revenus 7 jours + courbe 14 jours Paddle |
| **W-033** | P3 | **Gumroad** | ❌ **Manquant** | Ventes nettes Gumroad sur 7 jours |
| **W-034** | P3 | **Gumroad Chart** | ❌ **Manquant** | Ventes 7 jours + courbe 14 jours Gumroad |

---

### 2.4. Catégorie : System (14 widgets — 2 faits + 1 propre à Shelf, 12 manquants en tant que tuiles)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-035** | P1 | **System Stats** | ✅ **Fait** (`src/widgets/system-stats/`) | *(Optionnel : lui ajouter une `Card` détaillée au clic)* |
| **W-036** | P1 | **Tray** | ⚠️ **Intégré à `system-status`** | Créer une tuile carrée `Tray` autonome |
| **W-037** | P2 | **Language** | ❌ **Manquant** | Tuile carrée affichant la disposition clavier active (ex. `FRA` / `ENG`), clic pour basculer, carte listant les claviers |
| **W-038** | P2 | **Temperature** | ❌ **Manquant** | Jauge d'arc de température CPU + barres CPU/RAM, et carte listant les capteurs sur 10 min (°C/°F) |
| **W-039** | P2 | **CPU** | ❌ **Manquant** | Tuile carrée (1:1) dédiée à la charge CPU seule (anneau cyan + icône puce) |
| **W-040** | P2 | **RAM** | ❌ **Manquant** | Tuile carrée (1:1) dédiée à la RAM seule (anneau bleu + icône mémoire) |
| **W-041** | P2 | **Network** | ❌ **Manquant** | Tuile large affichant les débits descendant/montant en direct avec double courbe |
| **W-042** | P1 | **Battery** | ✅ **Fait** (`src/widgets/battery/`) | — |
| **W-043** | P1 | **Quick Toggles** | ⚠️ **Carte faite (`QuickCard`), tuile absente** | Créer la tuile large `Quick Toggles` (pilules Wi-Fi/BT + boutons ronds Hotspot/Avion sur le dock), compléter les toggles (*Ethernet*, *Microphone*, *Camera*, *Keep Awake*, *Desktop Icons*, *Display Mode*) et ajouter le % de batterie des appareils dans `BluetoothCard` |
| **W-044** | P2 | **Brightness** | ⚠️ **Dans `QuickCard`, tuile absente** | Créer la tuile large curseur de luminosité sur le dock + contrôles du mode d'affichage |
| **W-045** | P2 | **Theme Toggle** | ❌ **Manquant** | Tuile pilule Soleil/Lune basculant Windows entre le mode clair et le mode sombre |
| **W-046** | P2 | **Month Progress** | ❌ **Manquant** | Tuile à 3 rangées de points montrant l'avancement du mois en % |
| **W-047** | P2 | **Day Progress** | ❌ **Manquant** | Tuile de points montrant l'avancement de la journée en % |
| **W-048** | P2 | **Year Progress** | ❌ **Manquant** | Grille de points montrant l'avancement de l'année en % |

---

### 2.5. Catégorie : Media & Audio (5 widgets — 0 tuile faite, 1 carte faite)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-049** | P1 | **Now Playing** | ❌ **Manquant** | Tuile large (pochette, titre, artiste, précédent/play/suivant, barre de progression) via `GlobalSystemMediaTransportControls` + carte média |
| **W-050** | P1 | **Audio Output** | ⚠️ **Carte `SoundCard` faite, tuile absente** | Créer la tuile large (icône, nom du périphérique, %, curseur bleu sur le dock) |
| **W-051** | P2 | **Now Playing (compact)** | ❌ **Manquant** | Variante plus compacte (pochette, titre, artiste, bouton play/pause unique) |
| **W-052** | P2 | **Now Playing Mini** | ❌ **Manquant** | Tuile carrée (1:1) avec anneau de progression autour du bouton play/pause |
| **W-053** | P2 | **Now Playing Bar** | ❌ **Manquant** | Variante avec barre de progression centrale et boutons play + suivant |

---

### 2.6. Catégorie : Analytics (3 widgets — 0 fait)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-054** | P3 | **DataFast Chart** | ❌ **Manquant** | Visiteurs sur 7 jours + variation + courbe sur 14 jours (clé `df_`) |
| **W-055** | P3 | **Plausible** | ❌ **Manquant** | Visiteurs sur 7 jours + temps réel dans la carte |
| **W-056** | P3 | **Dub** | ❌ **Manquant** | Clics sur 7 jours, leads et ventes (clé `dub_`) |

---

### 2.7. Catégorie : Developer (3 widgets — 0 fait)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-057** | P3 | **Resend** | ❌ **Manquant** | Emails envoyés sur 7 jours, délivrés, ouverts et bounces (clé `re_`) |
| **W-058** | P3 | **Linear** | ❌ **Manquant** | Tickets assignés, en cours et courbe des tickets terminés (clé `lin_api_`) |
| **W-059** | P3 | **Supabase** | ❌ **Manquant** | Requêtes API sur 24h + courbe sur la tuile ; statut de la base, région, utilisateurs, taille de la DB et détail REST/Auth/Storage/Realtime dans la carte (clé `sbp_`) |

---

### 2.8. Catégorie : Online & Mail (7 widgets — 1 fait, 6 manquants)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-060** | P3 | **Metric** | ❌ **Manquant** | Nombre en direct (ex. cours `BTC / USD` avec variation en % et prix) ou métrique personnalisée |
| **W-061** | P3 | **Wallpaper Gallery** | ❌ **Manquant** | Galerie de fonds d'écran (onglets Unsplash, Windows et MacBook) avec changement en un clic et planification auto (quotidienne/hebdomadaire) |
| **W-062** | P2 | **Gmail** | ❌ **Manquant** | Compteur d'emails non lus + carte boîte de réception (Unread, Inbox, Starred, recherche) via OAuth Google |
| **W-063** | P1 | **GitHub Activity** | ✅ **Fait** (`src/widgets/github-activity/`) | *(Optionnel : supporter un jeton `ghp_` pour inclure l'activité privée et les notifications)* |
| **W-064** | P2 | **GitHub** | ❌ **Manquant** | Tuile compacte de statistiques GitHub (notifications non lues, PRs, stars avec token `ghp_`) |
| **W-065** | P2 | **GitHub Overview** | ❌ **Manquant** | Variante combinant statistiques PRs/issues/stars et activité |
| **W-066** | P3 | **LeetCode Stats** | ❌ **Manquant** | Problèmes résolus (Easy/Medium/Hard) et série depuis un profil public LeetCode |

---

### 2.9. Catégorie : Social (4 widgets — 0 fait)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-067** | P3 | **X Profile** | ❌ **Manquant** | Abonnés et métriques X via OAuth PKCE |
| **W-068** | P3 | **TikTok** | ❌ **Manquant** | Abonnés/vues d'un profil public TikTok |
| **W-069** | P3 | **YouTube** | ❌ **Manquant** | Abonnés et vues d'une chaîne via YouTube Data API v3 (`AIza`) |
| **W-070** | P3 | **Instagram** | ❌ **Manquant** | Abonnés et publications via jeton API Instagram/Facebook |

---

### 2.10. Catégorie : Apps & Files (9 widgets — 1 fait, 1 intégré, 7 manquants)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-071** | P1 | **Apps** | ✅ **Fait** (`src/widgets/apps/`) | — |
| **W-072** | P2 | **Recently Opened** | ❌ **Manquant** | Tuile des 3 derniers fichiers ouverts dans Windows (clic pour ouvrir) |
| **W-073** | P2 | **Recycle Bin** | ❌ **Manquant** | Corbeille Windows (icône carrée qui devient rouge avec badge quand elle est pleine, carte listant le contenu avec bouton *Empty*, glisser-déposer de fichiers dessus pour les supprimer) |
| **W-074** | P2 | **Search** | ⚠️ **Intégré à `apps`** | Dans Lumabar, tuile champ de saisie (`Search or open` — recherche web ou chemin de dossier) ; dans Shelf, la loupe d'`apps` ouvre `SearchCard` |
| **W-075** | P2 | **Commands** | ❌ **Manquant** | Tuile champ de saisie (`Type a word to launch an app or an action`) pour lancer une application ou une action au clavier |
| **W-076** | P2 | **Storage** | ❌ **Manquant** | Jauge d'espace disque (`C:` libre/utilisé) sur le dock + carte avec sélecteur de lecteur |
| **W-077** | P2 | **Recent Screenshots** | ❌ **Manquant** | Aperçu des 3 dernières captures d'écran sur la tuile + carte avec **extraction de texte (OCR)** |
| **W-078** | P2 | **Downloads** | ❌ **Manquant** | Tuile affichant le **dernier fichier téléchargé** (nom, date, taille) pour l'ouvrir en un clic |
| **W-079** | P2 | **Screenshot Capture** | ❌ **Manquant** | Tuile à **3 boutons ronds** (fenêtre bleue, zone verte, plein écran violet) |

---

### 2.11. Catégorie : Weather (7 widgets — 0 tuile météo pure faite, 7 manquants)

*(Note : le provider Open-Meteo `src/providers/weather.ts` existe déjà dans Shelf pour `Clock & Weather` et `DateCard` avec température actuelle et prévisions sur 5 jours, mais il devra être enrichi avec `hourly`, `wind_speed_10m`, `precipitation`, `sunrise` et `sunset` pour les widgets `W-081`, `W-085` et `W-086`).*

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-080** | P2 | **Weather** | ❌ **Manquant** | Tuile météo standard (icône, température, condition, ville, H/L) + carte météo dédiée |
| **W-081** | P2 | **Weather Details** | ❌ **Manquant** | Tuile avec température, condition et **3 lignes : vent, pluie et H/L** |
| **W-082** | P2 | **Weather Forecast** | ❌ **Manquant** | Tuile météo actuelle à gauche + 3 prochains jours à droite |
| **W-083** | P2 | **Today & Forecast** | ❌ **Manquant** | Tuile température actuelle + condition + 3 colonnes de jours |
| **W-084** | P2 | **Weather Status** | ❌ **Manquant** | Tuile pilule compacte icône + température + condition sur une ligne |
| **W-085** | P2 | **Hourly** | ❌ **Manquant** | Prévisions heure par heure (6 prochaines heures) sur le dock |
| **W-086** | P2 | **Sunrise & Sunset** | ❌ **Manquant** | Courbe d'horizon solaire avec heures de lever et coucher du soleil |

---

### 2.12. Catégorie : Stocks (3 widgets — 0 fait)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-087** | P3 | **Stock** | ❌ **Manquant** | Cours d'une action en direct + variation (via clé Finnhub, menu clic droit *Change stock…*) |
| **W-088** | P3 | **Stock Chart** | ❌ **Manquant** | Cours d'une action avec courbe sur 30 jours |
| **W-089** | P3 | **Stock Watchlist** | ❌ **Manquant** | Liste de suivi affichant **3 actions** sur la tuile (jusqu'à 5 configurées, menu clic droit *Edit watchlist…*) |

---

### 2.13. Catégorie : Clocks (14 widgets — 3 faits, 11 manquants)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-090** | P1 | **Clock** | ✅ **Fait** (`src/widgets/clock/`) | — |
| **W-091** | P2 | **Flip Clock** | ❌ **Manquant** | Horloge à volets basculants (*flip clock*) |
| **W-092** | P2 | **World Clocks** | ❌ **Manquant** | **3 petits cadrans analogiques** côte à côte avec codes de villes (cadran sombre la nuit) |
| **W-093** | P2 | **Analog Classic** | ❌ **Manquant** | Horloge analogique carrée à cadran clair |
| **W-094** | P2 | **Analog Classic Dark** | ❌ **Manquant** | Horloge analogique carrée à cadran sombre |
| **W-095** | P2 | **7 Days** | ❌ **Manquant** | Bandeau des 7 jours de la semaine avec le jour actif mis en avant **et la température actuelle en haut à droite** |
| **W-096** | P2 | **World Clock** | ❌ **Manquant** | **Liste de 3 villes** avec icône jour/nuit, décalage horaire et heure |
| **W-097** | P2 | **World Time** | ❌ **Manquant** | **Une ville en grands chiffres** avec son décalage horaire (`Today, -3h`) |
| **W-098** | P1 | **Today** | ✅ **Fait** (`src/widgets/today/`) | *(Choix design Shelf : jour de la semaine en couleur neutre au lieu du rouge Lumabar, cf. `12-gaps.md`)* |
| **W-099** | P2 | **Date** | ❌ **Manquant** | Tuile date sur une ligne (`SAT · 18`) |
| **W-100** | P2 | **Day Number** | ❌ **Manquant** | Tuile carrée style calendrier affichant le numéro du jour en grand |
| **W-101** | P2 | **Analog Minimal** | ❌ **Manquant** | Horloge analogique minimaliste sans chiffres |
| **W-102** | P2 | **Segment Clock** | ❌ **Manquant** | Horloge digitale à 7 segments |
| **W-103** | P1 | **Clock & Weather** | ✅ **Fait** (`src/widgets/clock-and-weather/`) | *(Choix design Shelf : suppression de l'aplat rouge derrière la date pour un rendu plus sobre, cf. `12-gaps.md`)* |

---

### 2.14. Widgets hors-catalogue repérés dans le changelog (`G-14`, 5 widgets)

Ces tuiles sont mentionnées dans les notes de version ou la documentation de Lumabar sans figurer dans les 103 du catalogue web (`docs/lumabar/12-gaps.md`) :

1. **Google Search Console** (*Analytics*) : clics et impressions sur 28 jours, CTR, position, requêtes, pages, pays, appareils et inspection d'URL.
2. **Microphone** (*System*) : tuile bouton muet/actif pour le microphone avec indicateur.
3. **Show Desktop** (*Apps & Files* / *System*) : tuile bouton pour afficher le bureau (`Win+D`).
4. **Trash (distinct)** : variante de la corbeille.
5. **Minimal Theme** (*System*) : variante minimale du bouton de bascule de thème.
