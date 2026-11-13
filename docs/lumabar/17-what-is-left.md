# Comparaison complète : Lumabar vs Shelf (Ce qu'il reste à faire)

Ce document compare, fonctionnalité par fonctionnalité (**F-001 à F-090**) et widget par widget (**W-001 à W-103 + extras G-14**), ce qui existe dans **Lumabar (v1.2.13)** (d'après l'étude dans `docs/lumabar/README.md`, `docs/lumabar/15-feature-checklist.md` et `docs/lumabar/widgets/*.md`) avec ce qui est effectivement implémenté dans le code de **Shelf** (`src/` et `src-tauri/src/`).

## Bilan global en chiffres

- **Fonctionnalités socle (Barre, Styles, Apps, Cartes, Réglages, Automatisations, Plateforme) :** **66 / 90 faites** (dont 5 partielles) — il reste **24 fonctionnalités** (ou compléments partiels), principalement le multi-écran, les raccourcis clavier globaux, les toasts et les automatisations.
- **Panneaux système (Spécificité Shelf) :** Shelf possède déjà ses propres cartes natives **Sound**, **Wi-Fi**, **Bluetooth**, **Quick Settings**, **Search** et **Notifications** dans `src/panels/`, regroupées derrière la tuile `system-status` et la loupe d'`apps`.
- **Catalogue de widgets :** **11 / 103 widgets du catalogue** (+ 1 widget propre à Shelf `system-status`, et les widgets dynamiques d'apps/dossiers `pin:*`) sont présents dans `src/widgets/`. Il reste **92 widgets du catalogue** (+ **5 widgets hors-catalogue G-14**) à créer.

---

## 1. Fonctionnalités du socle (F-001 à F-090)

### 1.1. Le Dock (`F-001` à `F-023`) — 19 / 23 faits

Dans `src-tauri/src/shell/dock.rs`, `src-tauri/src/shell/autohide.rs` et `src/windows/dock/Bar.tsx`, **19 fonctionnalités sur 23 sont terminées** :
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
- ✅ `F-020` : Résister aux outils tiers qui tentent de déplacer le dock
- ✅ `F-021` : Pas de clignotement dans les enregistrements d'écran (`visibleInCaptures` / `WDA_EXCLUDEFROMCAPTURE`)
- ✅ `F-022` : Animations de glissement ; les widgets et icônes s'écartent et se replient (`useComeAndGo`)

**Ce qu'il reste à faire sur le Dock :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-017** | P2 | **Choisir l'écran du dock (`Displays > Single`)** : choisir un moniteur spécifique, le mémoriser et y revenir quand on le rebranche | ❌ **Absent** (Shelf cible uniquement `primary_monitor()`) |
| **F-018** | P3 | **Dock sur tous les écrans (`Displays > All`)** : un dock par écran, chacun réservant son propre espace | ❌ **Absent** |
| **F-019** | P3 | **Dock qui suit le pointeur (`Displays > Follow`)** : maintenir le pointeur en bas d'un autre écran y déplace le dock | ❌ **Absent** |
| **F-023** | P2 | **Réservation dès la première seconde au boot** : réserver l'espace d'écran immédiatement à l'ouverture de session avant que les fenêtres ne prennent toute la place | ⚠️ **Partiel** (lancement classique via clé `HKCU\...\Run`, pas d'optimisation early-boot dédiée) |

---

### 1.2. Barre des tâches Windows (`F-024` à `F-026`) — 2 / 3 faits

Dans `src-tauri/src/shell/taskbar.rs` :
- ✅ `F-024` : Choix `Hidden` ou `Auto-hide`
- ✅ `F-025` : Restauration exacte en quittant, avec récupération après crash (`--watch-taskbar` et `--restore-taskbar`)

**Ce qu'il reste à faire :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-026** | P1 | **Gestion par écran** : cacher la barre Windows sur les écrans qui ont un dock, mais laisser la barre secondaire (`Shell_SecondaryTrayWnd`) en auto-hide sur les écrans sans dock | ❌ **Absent** (Shelf masque actuellement `Shell_TrayWnd` et tous les `Shell_SecondaryTrayWnd` sur tous les écrans) |

---

### 1.3. Styles et Apparence (`F-027` à `F-037`) — 10,5 / 11 faits

Dans `src/design/styles/` et `src/design/glass/GlassLayer.tsx` :
- ✅ `F-027` : Liquid Glass avec réfraction WebGL en direct
- ✅ `F-028` : iOS Glass
- ✅ `F-029` : Midnight
- ✅ `F-030` : Black
- ✅ `F-031` : White
- ✅ `F-032` : Clear, avec widgets noirs, blancs ou givrés (`clearMaterial`)
- ✅ `F-033` : Jeux de tuiles sombres et clairs (`theme: auto | dark | light`)
- ✅ `F-034` : 9 couleurs d'accentuation système
- ✅ `F-035` *(en partie)* : Sélecteur de couleur d'accentuation personnalisée libre
- ✅ `F-036` : Le verre se met au repos quand rien ne change à l'écran
- ✅ `F-037` : Le verre reste hors de sa propre capture d'écran

**Ce qu'il reste à faire :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-035** *(partiel)* | P3 | **Couleur d'accent selon la pochette d'album (*Album art accent*)** : adapter automatiquement la couleur d'accent à la pochette du titre en cours de lecture | ❌ **Absent** (dépend des widgets *Now Playing*) |

---

### 1.4. Applications et rôle de barre des tâches (`F-038` à `F-054`) — 15,5 / 17 faits

Dans `src/widgets/apps/` et `src-tauri/src/apps/` :
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

**Ce qu'il reste à faire (ou qui a été écarté) :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-046** *(partiel)* | P2 | **Action « End task » (Fin de tâche)** dans le menu clic droit d'une application ouverte | ➖ **Écarté volontairement** (jugé risqué ; le Gestionnaire des tâches est accessible via clic droit sur Start) |
| **F-054** | P2 | **Raccourci `Win+T`** : afficher/parcourir les apps ouvertes sur le dock au clavier (flèches entre les apps, Tab entre les fenêtres, Entrée pour activer) | ❌ **Absent** (pas de hook clavier global) |

---

### 1.5. Gestion des widgets (`F-055` à `F-061`) — 6,5 / 7 faits

Dans `src/windows/picker/` :
- ✅ `F-055` : Menu clic droit sur le dock (`Widgets…`, `Settings`, `Lock dock`, `Quit`)
- ✅ `F-056` : Sélecteur avec barre latérale, catégories, recherche et compteur
- ✅ `F-057` : Vraies tuiles dans le sélecteur ; clic pour ajouter ou retirer
- ✅ `F-058` : Badges `−` sur le dock pendant que le sélecteur est ouvert
- ✅ `F-059` : Glisser pour réordonner les widgets
- ✅ `F-060` *(en partie)* : Coches (`Check marks`) sur les widgets déjà présents dans la barre
- ✅ `F-061` : Affichage de données d'exemple tant qu'un compte n'est pas connecté

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

**Ce qu'il reste à faire :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-068** *(partiel)* | P3 | **Vérification de mise à jour, notice de mise à jour et formulaire de Feedback** (message, captures, rapport avec logs/config) dans `About` | ⚠️ **Partiel** (`About` affiche la version statique ; pas d'auto-updater ni de formulaire de feedback, conformément à G-17 pour un outil privé) |
| *(Lié à F-017..019)* | P2/P3 | **Réglage `Displays`** (`Single`, `All`, `Follow`) dans la section Dock | ❌ **Absent** |
| *(Lié à F-076..081)* | P3 | **Onglet / Section `Automations`** (interrupteurs pour chaque automatisation et choix des sons d'alerte) | ❌ **Absent** |

---

### 1.7. Cartes et Interactions (`F-069` à `F-075`) — 5 / 7 faits

Dans `src/windows/card/CardWindow.tsx` et `src/design/parts/Card.tsx` :
- ✅ `F-069` : Ouverture au-dessus (ou en-dessous) du widget avec glissement, sans jamais déborder de l'écran
- ✅ `F-070` : Anatomie standard des cartes (en-tête, corps, pied de page, action)
- ✅ `F-071` : Flux de connexion (`ConnectCard`), rafraîchissement, déconnexion et `Logout`
- ✅ `F-072` : Menus clic droit spécifiques aux tuiles
- ✅ `F-075` : Messages d'erreur en langage clair

**Ce qu'il reste à faire :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-073** | P2 | **Toasts** : petites fenêtres/bannières temporaires au-dessus du dock (pour les résumés Screen Time, les alertes de limite IA, les rappels de renouvellement, la pause musique avant réunion) | ❌ **Absent** |
| **F-074** | P2 | **Tooltips de widgets** : étiquette flottante sombre au-dessus d'une tuile de widget au survol indiquant son nom | ⚠️ **Partiel** (la bulle native `preview_name` existe pour les icônes d'apps, mais pas comme tooltip générique sur toutes les tuiles de widgets) |

---

### 1.8. Automatisations (`F-076` à `F-083`) — 0 / 8 faits

Aucune automatisation n'est encore implémentée dans Shelf :

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-076** | P3 | **Pause musique avant les réunions** : met en pause le média en cours ~1 min avant un événement du calendrier | ❌ **Absent** |
| **F-077** | P3 | **Alerte avant limite IA** : prévient par toast/son quand une limite d'usage IA approche de la saturation (ex. 80 %, 95 %) | ❌ **Absent** |
| **F-078** | P3 | **Rappels de renouvellement** : rappelle avant le renouvellement d'un abonnement et demande si on en a toujours besoin | ❌ **Absent** |
| **F-079** | P3 | **Demandes de review → To-Dos** : transforme automatiquement les demandes de review GitHub en tâches dans le widget Todos | ❌ **Absent** |
| **F-080** | P3 | **Heures calmes (*Quiet hours*)** : suspend toutes les alertes et toasts pendant la plage horaire configurée | ❌ **Absent** |
| **F-081** | P3 | **Sons d'alerte (*Alert tones*)** : choix d'un son pour les minuteurs, sessions Pomodoro, événements calendrier et rappels To-Do | ❌ **Absent** |
| **F-082** | P3 | **Calendrier unifié** : la carte Calendrier regroupe sur une même grille les événements iCal, renouvellements d'abonnements, virements (*payouts* Stripe/etc.), échéances To-Do et heures de reset des limites IA | ❌ **Absent** |
| **F-083** | P3 | **Résumés quotidiens et hebdomadaires Screen Time** : notification au-dessus du dock chaque jour (et bilan de la semaine le lundi) avec bouton *Details* | ❌ **Absent** |

---

### 1.9. Plateforme (`F-084` à `F-090`) — 3 / 7 faits (et 2 partiels)

- ✅ `F-084` : Runtime de providers avec cache sur disque et pause en plein écran / hors vue
- ✅ `F-085` : Stockage sécurisé des clés API via DPAPI (`secrets.rs`) et injection côté Rust (`net.rs`)
- ✅ `F-086` : Windows 11 et Windows 10 (64-bit)

**Ce qu'il reste à faire :**

| ID | Priorité | Fonctionnalité Lumabar | État dans Shelf |
| --- | --- | --- | --- |
| **F-087** | P2 | **Démarrage automatique qui reflète l'état du Gestionnaire des tâches** : refléter si l'utilisateur a désactivé Shelf dans l'onglet Démarrage du Gestionnaire des tâches Windows | ⚠️ **Partiel** (`autostart_get()` dans `src-tauri/src/system/mod.rs` lit uniquement la clé `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, mais **ne lit pas** la clé `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run` où le Gestionnaire des tâches Windows stocke l'état désactivé `03`) |
| **F-088** | P3 | **Réseaux d'entreprise avec inspection TLS (Zscaler, etc.)** : tolérance explicite aux proxys d'inspection et réveil réseau différé après veille | ⚠️ **Partiel** (`reqwest` utilise `native-tls` de Windows et `provider.ts` garde le cache en mode `stale`, mais sans gestion spécifique au-delà du magasin Windows) |
| **F-089** | P3 | **Build 32-bit** | ❌ **Absent** (cible 64-bit uniquement) |
| **F-090** | P3 | **Raccourci global `Alt+T`** pour ouvrir la carte *Todos* depuis n'importe quelle application | ❌ **Absent** (pas de hook clavier global, et le widget *Todos* n'est pas encore construit) |
| *(Lié aux panneaux)* | — | **Raccourcis globaux `Win+A`, `Win+S`, `Win+N`** pour ouvrir les cartes Quick Settings, Search et Notifications de Shelf au lieu de celles de Windows | ❌ **Absent** (laissé à Windows faute de hook clavier global) |

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

### 2.1. Catégorie : AI (10 widgets — 2 faits, 8 manquants)

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-001** | P1 | **Claude Usage** | ✅ **Fait** (`src/widgets/claude-usage/`) | *(Note : la carte `ClaudeCard` de Shelf s'appuie sur le flux status-line local `G-05` et affiche Session + Weekly + projection de rythme, sans la ligne `Opus`, la section `SUBSCRIPTION` ni le graphique de tendance v1.2.10 de Lumabar)* |
| **W-002** | P1 | **Claude Plan Usage** | ⚠️ **Fait (partiel)** (`src/widgets/claude-plan-usage/`) | La tuile affiche 2 lignes (`Session` et `Weekly`). Dans Lumabar, une **3e ligne** affiche le modèle le plus utilisé et ses tokens lus depuis les logs locaux de Claude Code |
| **W-003** | P2 | **ChatGPT Usage** | ❌ **Manquant** | Tuile d'usage ChatGPT / Codex CLI (jauges de limites) + carte de détail |
| **W-004** | P2 | **Gemini Usage** | ❌ **Manquant** | Tuile d'usage Gemini / Antigravity / Gemini CLI + carte de détail |
| **W-005** | P2 | **Grok Usage** | ❌ **Manquant** | Tuile d'usage Grok CLI + carte de détail |
| **W-006** | P2 | **DeepSeek Balance** | ❌ **Manquant** | Tuile solde API DeepSeek (`GET /user/balance` avec clé `sk-`) + suivi des dépenses |
| **W-007** | P2 | **GLM Usage** | ❌ **Manquant** | Tuile d'usage Z.ai / BigModel Coding Plan avec clé API |
| **W-008** | P2 | **OpenCode Usage** | ❌ **Manquant** | Tuile d'usage local OpenCode (tokens/coût depuis l'historique local hors-ligne) |
| **W-009** | P2 | **OpenCode Plan Usage** | ❌ **Manquant** | Variante jauge de plan pour OpenCode |
| **W-010** | P2 | **Cursor Usage** | ❌ **Manquant** | Tuile d'usage des requêtes/limites Cursor + carte de détail |

---

### 2.2. Catégorie : Productivity (9 widgets — 0 fait, 9 manquants)

*(Note : les horloges actuelles de Shelf ouvrent une petite grille mensuelle + météo dans `DateCard.tsx`, mais le vrai widget **Calendar** avec événements iCal et ajout d'événements n'est pas encore construit).*

| ID | P | Widget | État dans Shelf | Ce qu'il faut faire |
| --- | --- | --- | --- | --- |
| **W-011** | P2 | **Day Timeline** | ❌ **Manquant** | Frise horaire de la journée avec curseur de l'heure actuelle et blocs d'événements |
| **W-012** | P1 | **Screen Time** | ❌ **Manquant** | Suivi du temps passé par app active (et sites web), tuile résumé + grande carte à 2 colonnes (graphique horaire Jour/Semaine, focus le plus long, changements d'apps, liste des apps les plus utilisées, épinglage d'app) |
| **W-013** | P2 | **Pomodoro** | ❌ **Manquant** | Minuteur de sessions focus/pause sur le dock + carte de contrôle et réglages de durée |
| **W-014** | P2 | **Timer** | ❌ **Manquant** | Compte à rebours rapide avec contrôles |
| **W-015** | P2 | **Stopwatch** | ❌ **Manquant** | Chronomètre avec tours (*laps*) |
| **W-016** | P2 | **Todos** | ❌ **Manquant** | Tuile compteur de tâches + carte liste de tâches éditable avec dates d'échéance |
| **W-017** | P2 | **Notes** | ❌ **Manquant** | Tuile bloc-notes rapide + carte d'édition locale |
| **W-018** | P1 | **Calendar** | ❌ **Manquant** | Tuile prochain événement + grande carte Calendrier (flux iCal Google/Outlook/iCloud, grille mensuelle avec logos des sources, liste des événements du jour, création d'événement local) |
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
