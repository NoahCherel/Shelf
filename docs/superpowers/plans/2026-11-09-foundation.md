# Plan : un socle solide pour Shelf

## Contexte

Le lot « barre et apps » est fusionné (PR #6 et #7). Tu veux maintenant un socle propre : bons choix d'architecture, pas de code mort, pas de duplication, KISS et clean code, après une relecture complète.

**Comment la relecture a été faite :**
- Détecteurs : knip, jscpd, clippy, tsc strict.
- Trois relecteurs `opencode/glm-5.3-flash-free` en lecture seule : Rust apps et recherche, Rust shell et système, interface. 47 remarques au total.
- J'ai vérifié dans le code chaque ligne retenue ici, puis relu ce plan contre le code. Les remarques écartées sont listées plus bas.
- À savoir : ces relecteurs ont envoyé le code source à un service gratuit tiers, y compris `secrets.rs` (le code, aucun jeton ni fichier d'identifiants).

**Constat :** duplication détectée de 0,26 %, très peu de code mort. La dette est dans la structure, avec quelques vrais bugs rares.

## Choix d'architecture examinés

Je ne propose **aucun changement de fond**. Ces choix tiennent :

| Choix | Verdict |
|---|---|
| Tauri, WebView2, React, Zustand | Adaptés, et les limites rencontrées sont contournées proprement |
| Sources de données partagées (`core/provider.ts`) | Bon modèle : une source sans abonné s'arrête |
| Rust qui revalide tout ce que la page demande (empreintes, `in_layout`, `own_from`) | Bon, à garder partout |
| Stockage JSON par fichier avec annonce aux fenêtres | Simple et suffisant |
| SQLite embarqué pour l'historique | Justifié, Windows n'offre pas d'équivalent exploitable par `rusqlite` |

Ce qui ne va pas, c'est le **découpage** : fichiers trop gros, cycles entre modules, états globaux éparpillés. C'est l'objet des étapes 5 à 7.

## Règles

- Branche `foundation`, partie de `main` à jour.
- **Les bugs d'abord, dans leurs propres commits. Ensuite, du refactor sans aucun changement de comportement.**
- Un commit par ligne de ce plan. Chaque commit passe `cargo test --lib`, `npm test`, `tsc` et le banc visuel, sans mettre à jour une seule image de référence.
- Bug : un test qui échoue d'abord. Refactor : les tests existants ne changent pas, sauf leurs imports.
- Pas de sous-agents pour écrire le code.
- Plan enregistré dans `docs/superpowers/plans/2026-11-09-foundation.md`.

## Étape 0. Le filet de sécurité

Les vérifications de bout en bout ont raté 4 passages sur 5 à un moment, de façon aléatoire, sans cause connue. Un refactor ne peut pas s'appuyer là-dessus.

- Relevé de référence avec `src/test/resources.ps1`, pour comparer à la fin.
- Un script commun `src/test/cdp.mjs` : `cdp-check`, `focus-check`, `live-look` et `press` recopient le même code de connexion.
- Une option de `--preview` qui ne recopie pas tes données (`preview.rs`, `turn_on`), pour que `cdp-check` ait la disposition par défaut sans fermer ton Shelf. Les actions bloquées en aperçu sont signalées comme attendues.
- 10 passages d'affilée, avec le temps de réponse de chaque page. **Ces passages ouvrent des fenêtres et prennent le focus pendant une trentaine de minutes : je te demande quand les lancer.**
- La version d'essai est une compilation debug. Si le problème n'y apparaît pas, 5 passages sur la version release, ce qui ferme ton Shelf.
- **Limite :** si la cause reste introuvable, je m'arrête, je te dis ce que j'ai vu, et le test retente une fois ces étapes, en l'indiquant clairement dans son rapport.

## Étape 1. Bugs confirmés

| # | Où | Problème | Correction |
|---|---|---|---|
| 1 | `lib.rs:103` | Une panique sur **n'importe quel** fil remet la barre Windows, et Shelf ne la recache plus alors qu'il continue de tourner | Ne restaurer que pour le fil principal ; le processus de garde couvre les vrais plantages |
| 2 | `shell/taskbar.rs:48` | Si le fichier d'état ne s'écrit pas, Shelf cache quand même la barre, sans moyen de la restaurer après un plantage | Ne pas la cacher si l'écriture échoue |
| 3 | `glass/capture.rs:232` | Une erreur après l'exclusion des captures laisse le dock invisible aux captures | Remettre `WDA_NONE` si la suite échoue |
| 4 | `apps/pins.rs` `changed()` | Deux actions simultanées sur les épingles : l'une écrase l'autre | Un verrou autour de « lire, modifier, enregistrer », via une seule fonction `save_change` qui remplace les `store_save(app, pins::OVERLAY…)` répétés |
| 5 | `system/wifi.rs:219` | Deux connexions peuvent démarrer ensemble | Vérifier et écrire sous le même verrou |
| 6 | `system/mod.rs:65` | Un `lock().unwrap()` : une panique casse le widget système pour toujours | Même forme que partout ailleurs |
| 7 | `settings/controls.tsx:24` | Si l'écriture échoue, l'interrupteur reste dans la mauvaise position | Relire la vraie valeur |
| 8 | `apps/windows.rs:223` | Un numéro de fenêtre réutilisé reprend l'identité de l'ancienne | Comparer aussi le processus |
| 9 | `shell/card.rs:326` | Un fil créé à chaque perte de focus, même sans trace active | `diag::enabled()`, sortie immédiate |

## Étape 2. Code mort

- Le mot `export` retiré là où il ne sert à rien, **le code restant** : `SIZE_MIN`, `SIZE_MAX`, `GAP_MAX`, `SPACING_MAX`, `createPainter`, `panelCardId`, `fakeSearchApps`, `choice`, `text`, et les types signalés par knip. Ces constantes sont utilisées dans leur propre fichier.
- `KEY_MISMATCH` (`wifi.rs`) passe en `#[cfg(test)]`, car les tests s'en servent.
- `sparkPath` et `lensOffset` supprimés avec leurs tests : ils ne testent qu'eux-mêmes, le vrai code passe par `smoothPath` et le shader.
- `Hover::keep` et `Hover::leave`, identiques (`previews.rs`) : une seule fonction.
- Avertissements clippy restants. À partir d'ici, clippy reste à zéro.

## Étape 3. Utilitaires uniques

Nouveau `src-tauri/src/util.rs` : `lock()` (remplace 81 répétitions), `file_name` et `file_stem` (8 copies), `unique_temp_name()` (aujourd'hui dans `history.rs`), `is_french(lang)`.

Puis :
- `on_com_thread` y déménage, et `toggles.rs` le réutilise au lieu de le réécrire. Les trois `CoInitializeEx` en multi-thread ne bougent pas : ce sont des lignes uniques, sans gain à les envelopper.
- `menu::jump_id` à la place du format recopié.
- `from_exe` réutilise `from_file_at`, `percent` partagé entre `audio.rs` et `status.rs`.

## Étape 4. Noms partagés

Préfixes de cartes dans `core/cardIds.ts` côté page et en constantes côté Rust. Noms de fichiers de stockage en constantes. Un test Vitest lit `card.rs` et vérifie que les préfixes concordent, comme `e2e-data.test.ts` lit déjà `e2e.sh`.

## Étape 5. Architecture de l'interface

- **Cycle `registry` / `pinWidget` / `layout`** : `core/pinId.ts` pur, et `byId` déplacé dans un module qui dépend des deux autres.
- **Cycle `panels` / `widgets`** : `widgets/_providers/` devient `src/providers/`.
- **`Tile.tsx` (623 lignes)** découpé dans `widgets/apps/` : `drag.ts` (logique pure), `useOsDrag`, `useAppPreviews`, `icons.tsx`, `Tile.tsx`.
- **`useComeAndGo` et `useArrivals` + `useLeaving`** : un seul hook `useFolding(keys, measure?)`. `measure` couvre la largeur dont les widgets ont besoin et pas les apps. Si les deux usages restent trop différents une fois écrit, je garde les deux et je te le dis.
- **`AppIcon` (2 copies identiques)** et `close` : un seul exemplaire.
- **`Bar.tsx` (479 lignes)** : `useEdgeDrag`, `useFreePlacement` et `useComeAndGo` dans leurs fichiers.

## Étape 6. Architecture Rust des apps

- `apps/mod.rs` découpé : `commands.rs`, `drop.rs` (le glisser et ses états, regroupés dans une structure), `jump.rs`. `mod.rs` ne garde que `current` et `every_entry`.
- `should_press_start` et `is_start_host` quittent `menu.rs` pour `windows.rs`.
- `place_bubble` réutilisé par `preview_show`.

## Étape 7. Le dock (risque le plus élevé, en dernier)

PR à part, que tu essaies seul avant de fusionner.

- `shell/dock.rs` (800 lignes) découpé : géométrie pure, placement, messages Windows.
- Les 12 variables globales regroupées dans une seule structure statique **qui garde ses atomiques**. Pas de grand verrou commun : `on_message` tourne dans la boucle de messages de Windows, et un verrou tenu là pourrait figer le dock.
- Une seule mesure du dock pour `card.rs`, `tray.rs` et `previews.rs`, et un `resting_rect` au lieu de 4 copies.
- Casser le cycle `shell` / `system` / `apps` : `seen_now` reçoit ce qu'il doit savoir au lieu d'aller le chercher.

## Découpage en PR

1. **Étapes 0 à 4** : bugs et nettoyage à faible risque.
2. **Étapes 5 et 6** : architecture, après la fusion de la première.
3. **Étape 7** : le dock, seule.

Chaque push et chaque merge attend ton accord. Je préviens avant de fermer ton Shelf.

## Remarques écartées après vérification

| Remarque | Pourquoi |
|---|---|
| Un séparateur coupe la liste de raccourcis | Faux : `read_link` rend `Some((None, used))` et la lecture continue |
| Une app dans deux groupes | Impossible : seul ce qui est au niveau du dock peut être glissé |
| App lancée à vide par un dépôt | Impossible : un dépôt de programmes seuls n'est jamais « ouvrir dans » |
| Le curseur des réglages écrit à chaque pixel | Vrai, mais c'est cette écriture qui prévient le dock : la retarder ferait perdre le réglage en direct. Le coût n'existe que pendant le geste |
| `KNOWN` de la recherche grossit sans limite | Quelques Mo après des milliers de recherches, alors qu'un plafond rendrait inouvrables des lignes encore affichées |
| Assembler `ssid_text` et `ssid_bytes` | Une ligne chacune, de types différents : l'aide serait plus longue que le gain |
| `APPDATA` absent | Windows le définit toujours |
| `MOVING` bloqué si la page meurt | Ne survient qu'après un plantage de la page, déjà rattrapé |
| Les fils du dock ne s'arrêtent pas | Ils s'arrêtent avec le processus, qui se termine juste après |
| Compteurs de requêtes page, `.lnk` modifié sur place, titre de section vide | Effet nul ou invisible en pratique |
| `Recreate` au lieu de refaire la capture | Optimisation qui touche au verre, hors de ce lot |
| `merge.rs`, `previews.rs`, `wifi.rs` à découper | Leur longueur vient des tests |
| `windows-core` semble inutilisé | Nécessaire à la macro `#[implement]` |

## Vérification

| Niveau | Quoi |
|---|---|
| À chaque commit | `cargo test --lib`, `npm test`, `tsc`, banc visuel sans image modifiée ; `clippy` à zéro après l'étape 2 |
| En fin d'étape | 3 passages de `cdp-check` dans la version d'essai, si l'étape 0 le permet ; sinon `e2e.sh` |
| Avant chaque PR | `src/test/e2e.sh` sur ta version, barre contrôlée avec `probe.ps1`, relecture de la branche par un `glm-5.3-flash-free` en lecture seule, remarques vérifiées par moi |
| À la fin | knip et jscpd relancés, résultats dans le rapport ; `resources.ps1` comparé au relevé de l'étape 0 |

**Ce que tu devras essayer :** après l'étape 7, le dock en haut et en bas, le masquage automatique, le déplacement de la pilule, le glisser-déposer. Je ne peux pas faire ces gestes à ta souris.
