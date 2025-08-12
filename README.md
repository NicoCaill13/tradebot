# Microcap Portfolio Bot (Node/TypeScript)

**Tu exécutes, je décide.** Bot d’aide à la décision pour un portefeuille 100% **micro-caps US** (cap < **$300M**), horizon 11/08/2025 → 31/12/2025. 
- Construction **automatique** d’une watchlist.
- Propositions **d’entrées/STOP/TP**.
- **Sizing** automatique (pondération, risque, liquidité).
- Suivi du portefeuille (trailing stops, take-profits, trims pré-événements).
- Génération d’**ordres BUY** lisibles.

> Le bot **n’envoie aucun ordre au broker**. Tu places/annules les ordres. Option `--assume-fills` pour **simuler** les exécutions côté bot.

---

## Sommaire
- [Microcap Portfolio Bot (Node/TypeScript)](#microcap-portfolio-bot-nodetypescript)
  - [Sommaire](#sommaire)
  - [Prérequis](#prérequis)
  - [Installation rapide](#installation-rapide)
    - [Première initialisation](#première-initialisation)
  - [Configuration via `.env`](#configuration-via-env)
    - [Priorité des réglages](#priorité-des-réglages)
  - [Structure du projet](#structure-du-projet)
  - [Workflow quotidien (runbook)](#workflow-quotidien-runbook)
  - [Commandes CLI](#commandes-cli)
    - [`discover`](#discover)
    - [`scan`](#scan)
    - [`commit`](#commit)
    - [`run`](#run)
    - [`status`](#status)
    - [`targets`](#targets)
  - [Modèle de sizing](#modèle-de-sizing)
  - [Logique d’entrée / STOP / TP / exécution](#logique-dentrée--stop--tp--exécution)
  - [Fichiers écrits](#fichiers-écrits)
  - [Qualité code (ESLint / Prettier)](#qualité-code-eslint--prettier)
  - [Dépannage](#dépannage)
  - [Avertissements](#avertissements)
  - [Idées d’amélioration](#idées-damélioration)

---

## Prérequis
- **Node.js 20+**
- Compte Yahoo Finance **non requis** (utilise le SDK gratuit `yahoo-finance2`).

## Installation rapide
```bash
npm i
npm run build
```

### Première initialisation
```bash
# initialise l’état avec ton capital de référence
npm start -- run --capital 100000

# construit la watchlist (auto)
npm start -- discover

# propose entrées/STOP/TP/tailles + Action (MKT/LIMIT)
npm start -- scan

# génère les ordres BUY lisibles (fichier texte)
npm start -- commit
```

---

## Configuration via `.env`
Toutes les constantes « stratégie » et filtres peuvent être réglées par **variables d’environnement**. Si **absentes**, des **valeurs par défaut** sont utilisées.

Crée un fichier **`.env`** à la racine (ou copie `.env.example`) :

```dotenv
# Capital par défaut si --capital absent (USD)
CAPITAL_DEFAULT=100000

# Filtres watchlist / candidates
FILTER_MARKET_CAP_MAX=300000000
FILTER_MIN_PRICE=1
FILTER_MIN_ADV_3M=100000
FILTER_EXCH_REGEX=(NYSE|Nasdaq|NCM|NMS|NYQ|NGM|AMEX)

# Sizing
SIZING_TARGET_WEIGHT=0.06        # 6% du capital par idée
SIZING_RISK_PCT=0.0075           # 0.75% du capital risqué au stop
SIZING_ADV_PCT_CAP=0.15          # 15% de l’ADV 3m max (en actions)

# Entrée / STOP / Exécution
ENTRY_PULLBACK_MAX_PCT=0.02      # borne le pullback à -2% vs prix
ENTRY_MARKET_THRESHOLD_PCT=0.005 # <=0.5% => BUY @ MKT
STOP_ATR_MULT=2                  # STOP = entry - 2×ATR14

# Dossiers
OUT_DIR=out
DATA_DIR=data
```

> **Format** des pourcentages : `0.06` **ou** `6%` (les deux sont acceptés).

### Priorité des réglages
- **CLI** > `src/config.ts` > `.env` (défauts). 
- Exemple pour le capital : `--capital` > `CONFIG.capital` > `CAPITAL_DEFAULT`.

---

## Structure du projet
```
src/
  index.ts                # CLI minimal (yargs) — import dynamique des commandes
  commands/
    discover.ts           # construit la watchlist (auto)
    scan.ts               # propose Entrée/STOP/TP + taille & Action (MKT/LIMIT)
    commit.ts             # génère les ordres BUY du jour (fichier .txt)
    run.ts                # moteur quotidien (stops, tps, trims, ordres)
    status.ts             # vue claire STOP/TP par ticker (+ export JSON)
    targets.ts            # prix TP calculés depuis PRU (1/3 par palier)
  lib/
    io.ts                 # lecture watchlist etc.
    history.ts            # historique quotidien via `chart(period1,period2)`
    entry.ts              # computeEntry/Stop/TPs + decideAction (MKT/LIMIT)
    sizing.ts             # sizeByPortfolio + decideSizeWithDefaults
  config.ts               # positions gérées par le moteur (déjà en portefeuille)
  settings.ts             # charge `.env` et expose les réglages parsés
  env.ts                  # TODAY, OUT_DIR, DATA_DIR, STATE_FILE
  constants.ts            # réexporte MICROCAP_LIMIT, ADV_PCT_CAP depuis settings
  indicators.ts           # EMA / ATR
  market.ts, state.ts, types.ts, utils.ts, ...

data/state.json          # état du portefeuille (créé au premier run)
${OUT_DIR?"<OUT_DIR>" : "out/"}                   # exports (ordres, status, watchlist…)
watchlist.txt            # tickers candidats (écrasé par discover)
```

---

## Workflow quotidien (runbook)
**Avant l’ouverture US (15:30 Paris)**
1) **Découverte auto** :
   ```bash
   npm start -- discover
   ```
2) **Plan d’attaque** :
   ```bash
   npm start -- scan
   ```
   → Entrée / STOP / TP / **#actions** / **Action** (MKT ou LIMIT)
3) **Ordres BUY** :
   ```bash
   npm start -- commit
   ```
   → imprime + écrit `<OUT_DIR>/buy-orders-YYYY-MM-DD.txt`
4) **Tu exécutes chez le broker**. Si fills, synchroniser le bot :
   ```bash
   npm start -- run --assume-fills
   ```
5) **Suivi** :
   ```bash
   npm start -- status   # STOP/TP clairs
   npm start -- targets  # TPs exacts selon PRU
   ```

> **Conseil** : garde `--assume-fills` sur `run` si tu veux que le bot « suive » virtuellement les exécutions (à répliquer chez le broker).

---

## Commandes CLI

### `discover`
Construit **automatiquement** `watchlist.txt`.
```bash
npm start -- discover
```
- **Sources** : `trendingSymbols('US')`, `screener(day_gainers|most_actives|…)` (best-effort selon version).
- **Filtres** (paramétrables via `.env`) :
  - cap < `FILTER_MARKET_CAP_MAX` (par défaut $300M)
  - prix ≥ `FILTER_MIN_PRICE` (par défaut $1)
  - ADV 3m ≥ `FILTER_MIN_ADV_3M` (par défaut 100k)
  - place US maj. : `FILTER_EXCH_REGEX`
- **Scoring** (tendance + pullback EMA20) : calcule **EMA20/EMA50** (via `lib/history.ts` + `yahooFinance.chart()`), favorise prix > EMA20 > EMA50 et **proximité EMA20**.
- **Sorties** : imprime les 10–12 meilleurs, écrit `watchlist.txt` + copie `<OUT_DIR>/watchlist-YYYY-MM-DD.txt`.

### `scan`
Propose **Entrée / STOP / TPs / taille** + **Action** (MKT/LIMIT) pour chaque ticker de `watchlist.txt`.
```bash
npm start -- scan
```
- Historique quotidien sur ~6 mois : `lib/history.ts` (`chart(period1,period2)`)
- **Entrée** : pullback vers **EMA20**, borné à `ENTRY_PULLBACK_MAX_PCT` (−2% par défaut) :
  ```
  entry = min( price, max( EMA20, price * (1 - ENTRY_PULLBACK_MAX_PCT) ) )
  ```
- **STOP** : `entry − STOP_ATR_MULT × ATR14` (min $0.01).
- **TPs** : `TP1 = entry + 1.5R`, `TP2 = entry + 3R` avec `R = entry − stop`.
- **Sizing (décidé par la stratégie)** : `lib/sizing.ts` → min de
  - `SIZING_TARGET_WEIGHT` (6% par défaut),
  - `SIZING_RISK_PCT` (0.75% du capital risqué au stop),
  - cash dispo (capital − MTM),
  - `SIZING_ADV_PCT_CAP` × ADV 3m (en **actions**).
- **Action** :
  - si `|price − entry| / entry ≤ ENTRY_MARKET_THRESHOLD_PCT` (0.5%) → **`BUY @ MKT`**
  - sinon → **`BUY LIMIT @ entry`**

### `commit`
Génère les **ordres BUY** « prêts à exécuter » (et les écrit dans `<OUT_DIR>`).
```bash
npm start -- commit
```
- Applique la même logique que `scan` (helpers partagés).
- Exemple de sortie :
  ```
  BUY ABCD 1200 @ MKT   // stop $1.8500, TP1 $2.2000, TP2 $2.6000, risk≈$360.00
  BUY WXYZ 800 LIMIT @ $3.4500   // stop $3.1000, TP1 $3.7250, TP2 $4.3500, risk≈$280.00
  ```
- Fichier : `<OUT_DIR>/buy-orders-YYYY-MM-DD.txt`.

### `run`
Moteur quotidien : trailing stops, TPs, trims pré-événements, génération d’ordres SELL/TRIM.
```bash
# initialiser le capital de référence
npm start -- run --capital 100000

# routine quotidienne (simuler exécutions)
npm start -- run --assume-fills
```
- **Options**
  - `--capital <USD>` : override du capital (sinon `CONFIG.capital` puis `CAPITAL_DEFAULT`).
  - `--assume-fills` : applique virtuellement les propositions d’ordres dans l’état (`data/state.json`).
- **Sortie** : `<OUT_DIR>/orders-YYYY-MM-DD.json`.

### `status`
Photographie claire de **Last**, **PRU**, **Trail %**, **STOP**, **TPs**, **fenêtre d’événement**.
```bash
npm start -- status
```
- Export JSON : `<OUT_DIR>/status-YYYY-MM-DD.json`.

### `targets`
Affiche les **prix de vente** (TP) à poser **depuis ton PRU** (1/3 de la position par palier).
```bash
npm start -- targets
```

---

## Modèle de sizing
Pour chaque idée, **#actions** = min :
1. **Pondération cible** `SIZING_TARGET_WEIGHT` × capital / entry
2. **Risque max** `SIZING_RISK_PCT` × capital / (entry − stop)
3. **Cash dispo** (cash / entry)
4. **Liquidité** `SIZING_ADV_PCT_CAP` × ADV3m (en actions)

La colonne **Alloc** de `scan` affiche `xx.x% (limite: weight|risk|cash|adv)`.

---

## Logique d’entrée / STOP / TP / exécution
- **Entrée** : pullback **EMA20** borné à `ENTRY_PULLBACK_MAX_PCT`.
- **STOP** : `entry − STOP_ATR_MULT × ATR14`.
- **TPs** : `TP1 = 1.5R`, `TP2 = 3R` (`R = entry − stop`).
- **Exécution** : `BUY @ MKT` si `|Δ| ≤ ENTRY_MARKET_THRESHOLD_PCT`, sinon `BUY LIMIT @ entry`.

---

## Fichiers écrits
- `<OUT_DIR>/watchlist-YYYY-MM-DD.txt` : watchlist auto.
- `<OUT_DIR>/buy-orders-YYYY-MM-DD.txt` : ordres BUY du jour (texte).
- `<OUT_DIR>/orders-YYYY-MM-DD.json` : propositions SELL/TRIM (moteur `run`).
- `<OUT_DIR>/status-YYYY-MM-DD.json` : vue STOP/TP par ticker.
- `data/state.json` : état persistant (capital, positions, PRU, HWM, stops, etc.).

---

## Qualité code (ESLint / Prettier)
Scripts utiles :
```bash
npm run lint       # ESLint
npm run lint:fix   # ESLint + fix
npm run format     # Prettier --write
npm run format:check
```
- ESLint : TypeScript (ESM), ignore `dist/`, `out/`, `data/`.
- Prettier : `endOfLine = lf`, largeur 100, guillemets simples.

---

## Dépannage
- **Alerte Yahoo « historical() » déprécié** : tous les fetchs historiques passent par `lib/history.ts` (wrapper `chart({ period1, period2, interval: '1d' })`).
- **Regex `split(/
?
/)` cassé** : vérifier que la regex reste **sur une seule ligne** (les retours Windows sont normalisés dans `lib/io.ts`).
- **ERR_MODULE_NOT_FOUND** sur `dist/*.js` : vérifier les imports **`.js`** (pas `.ts`) dans `index.ts` pour les imports dynamiques.
- **ENV ignoré** : assurer `import 'dotenv/config'` dans `settings.ts` (et `env.ts`).
- **Node/yargs** : utiliser **Node 20+**.

---

## Avertissements
- Micro-caps = **volatilité élevée** / liquidité variable.
- Ce projet est **éducatif**. **Pas de conseil financier**. Tu restes responsable des exécutions réelles.

---

## Idées d’amélioration
- Commande `alloc` : générer un **bloc CONFIG** prêt à coller pour intégrer automatiquement une idée (avec stops/TPs/paliers) au moteur `run`.
- Profil d’entrée **breakout** (en plus du pullback EMA20).
- Export **CSV** pour `scan`, tri par **score** / **distance à l’entrée**.
- Dashboard web minimal (Next.js) pour suivre status/ordres en temps réel.
