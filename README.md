# 🔍 SearchStore — Moteur de recherche Elasticsearch

Moteur de recherche de produits construit avec **Elasticsearch**, **Flask** (Python) et un frontend **HTML/CSS/JS** vanilla.

---

## 📁 Structure du projet

```
.
├── app.py                 # Backend Flask (API REST)
├── requirements.txt       # Dépendances Python
├── Dockerfile             # Image Docker pour Flask
├── docker-compose.yml     # Orchestration des services
├── mapping.json           # Mapping Elasticsearch de l'index "produits"
├── produits.json          # Données brutes (tableau JSON)
├── produits_bulk.json     # Données au format Bulk API
├── json_to_bulk.py        # Script de conversion JSON → Bulk
└── www/
    ├── index.html         # Page principale (interface de recherche)
    ├── style.css          # Styles CSS
    └── search.js          # Logique JavaScript (recherche, filtres, UI)
```

---

## 🏗️ Architecture

```
┌─────────────────┐        ┌─────────────────┐        ┌──────────────────────┐
│   Navigateur    │◄──────►│  Flask :5000    │◄──────►│ Elasticsearch :9200  │
│  (HTML/CSS/JS)  │  HTTP  │  (API REST)     │  SDK   │  (index: produits)   │
└─────────────────┘        └─────────────────┘        └──────────────────────┘
```

- **Elasticsearch** stocke et indexe les produits, gère la recherche full-text et les agrégations.
- **Flask** expose une API REST qui traduit les requêtes HTTP en requêtes Elasticsearch.
- **Le frontend** (JS vanilla) interroge l'API Flask et affiche les résultats dynamiquement.

---

## 🚀 Démarrage rapide

### Prérequis

- [Docker](https://www.docker.com/) + [Docker Compose](https://docs.docker.com/compose/)

### 1. Lancer les services

```bash
docker compose up --build -d
```

Cela démarre :
- `es-projet` — Elasticsearch sur le port **9200**
- `flask-app` — Flask sur le port **5000**

Vérifier que tout est up :
```bash
docker compose ps
docker logs flask-app
```

### 2. Créer l'index Elasticsearch

```bash
curl -X PUT "http://localhost:9200/produits" \
     -H "Content-Type: application/json" \
     -d @mapping.json
```

### 3. Charger les données

```bash
curl -X POST "http://localhost:9200/produits/_bulk" \
     -H "Content-Type: application/json" \
     --data-binary @produits_bulk.json
```

Vérifier que les données sont bien indexées :
```bash
curl "http://localhost:9200/produits/_count"
```

### 4. Ouvrir l'application

👉 **[http://localhost:5000](http://localhost:5000)**

---

## 🔄 Regénérer le fichier Bulk

Si tu modifies `produits.json`, régénère le fichier bulk avec :

```bash
python json_to_bulk.py
```

Puis recharge les données :
```bash
curl -X DELETE "http://localhost:9200/produits"
curl -X PUT "http://localhost:9200/produits" -H "Content-Type: application/json" -d @mapping.json
curl -X POST "http://localhost:9200/produits/_bulk" -H "Content-Type: application/json" --data-binary @produits_bulk.json
```

---

## 🌐 API REST

### `GET /api/search`

Recherche de produits avec filtres, tri et pagination.

| Paramètre    | Type     | Défaut       | Description |
|--------------|----------|--------------|-------------|
| `q`          | string   | `""`         | Texte recherché |
| `page`       | int      | `1`          | Numéro de page |
| `size`       | int      | `12`         | Résultats par page |
| `categories` | string[] | `[]`         | Filtrer par catégorie (multi-valeur) |
| `marque`     | string[] | `[]`         | Filtrer par marque (multi-valeur) |
| `prix_min`   | float    | —            | Prix minimum |
| `prix_max`   | float    | —            | Prix maximum |
| `en_stock`   | bool     | —            | `true` = en stock uniquement |
| `note_min`   | float    | —            | Note minimum (ex: `4`) |
| `tri`        | string   | `pertinence` | `pertinence`, `prix_asc`, `prix_desc`, `note`, `recent` |

**Exemple :**
```bash
curl "http://localhost:5000/api/search?q=basket&categories=Homme&prix_max=150&tri=prix_asc"
```

**Réponse :**
```json
{
  "total": 42,
  "page": 1,
  "size": 12,
  "pages": 4,
  "hits": [ { "id": "prod_0002", "nom": "Baskets Homme", ... } ],
  "aggregations": {
    "categories": [ { "key": "Homme", "count": 15 }, ... ],
    "marques":    [ { "key": "Nike", "count": 5 }, ... ],
    "prix_stats": { "min": 19.99, "max": 499.99, "avg": 112.5 },
    "tags":       [ { "key": "tendance", "count": 8 }, ... ]
  }
}
```

---

### `GET /api/suggestions?q=<texte>`

Autocomplétion — retourne les 7 premiers produits correspondants.

```bash
curl "http://localhost:5000/api/suggestions?q=bask"
```

```json
[
  { "nom": "Baskets Homme", "marque": "SportMaster", "image": "...", "prix": 112.99 }
]
```

---

### `GET /api/product/<id>`

Détail complet d'un produit.

```bash
curl "http://localhost:5000/api/product/prod_0002"
```

---

## 🔎 Fonctionnement de la recherche Elasticsearch

### Mapping (`mapping.json`)

Les champs texte principaux (`nom`, `description`, `marque`, `categories`, `tags`) sont de type **`search_as_you_type`**, ce qui génère automatiquement des sous-champs `._2gram` et `._3gram` pour l'autocomplétion.

Un analyseur personnalisé **`french_simple`** est appliqué :
- `lowercase` — mise en minuscules
- `asciifolding` — supprime les accents (`é` → `e`)
- `french_stemmer` — réduit les mots à leur racine (`baskets` → `basket`)

### Requête de recherche

```
bool_prefix (multi_match)
├── must  → multi_match sur nom, description, marque, categories, tags...
│           (affecte le score de pertinence)
└── filter → terms (catégorie, marque), range (prix, note), term (stock)
             (filtre sans affecter le score → plus performant)
```

### Agrégations

Les compteurs des filtres dans la sidebar sont calculés par Elasticsearch via des **agrégations**, retournées en même temps que les résultats en un seul appel.

---

## 💻 Frontend

| Fichier        | Rôle |
|----------------|------|
| `index.html`   | Structure de la page : header, sidebar filtres, grille résultats, modal détail |
| `style.css`    | Design responsive avec variables CSS, animations, gestion mobile |
| `search.js`    | Toute la logique : autocomplétion (debounce 250ms), recherche, rendu des cards, pagination, modal, raccourcis clavier |

**Raccourcis clavier :**
- `/` — focus la barre de recherche
- `Échap` — ferme la modal / les suggestions

---

## 🛠️ Développement

### Modifier le frontend

Les fichiers `www/` sont montés en volume dans Docker. **Pas besoin de rebuilder** : un simple rafraîchissement du navigateur suffit.

### Modifier le backend (`app.py`)

Un rebuild est nécessaire :
```bash
docker compose up --build -d flask
```

### Arrêter les services

```bash
docker compose down          # arrête les conteneurs
docker compose down -v       # arrête + supprime les données ES
```

---

## 📦 Dépendances

| Package | Version | Rôle |
|---|---|---|
| `flask` | 3.1.* | Framework web Python |
| `elasticsearch` | 9.* | Client Python officiel pour Elasticsearch |
| `flask-cors` | 5.* | Gestion des headers CORS |
