from flask import Flask, request, jsonify
from flask_cors import CORS
from elasticsearch import Elasticsearch

app = Flask(__name__)
CORS(app)

es = Elasticsearch("http://elasticsearch:9200")
INDEX = "produits"


@app.route("/api/search")
def search():
    q = request.args.get("q", "").strip()
    page = int(request.args.get("page", 1))
    size = int(request.args.get("size", 12))
    categories = request.args.getlist("categories")
    marque = request.args.getlist("marque")
    prix_min = request.args.get("prix_min", type=float)
    prix_max = request.args.get("prix_max", type=float)
    en_stock = request.args.get("en_stock")
    note_min = request.args.get("note_min", type=float)
    tri = request.args.get("tri", "pertinence")

    from_ = (page - 1) * size

    # Build query
    must = []
    filter_clauses = []

    if q:
        must.append({
            "multi_match": {
                "query": q,
                "type": "bool_prefix",
                "fields": [
                    "nom", "nom._2gram", "nom._3gram",
                    "description", "description._2gram", "description._3gram",
                    "marque", "marque._2gram", "marque._3gram",
                    "categories", "categories._2gram", "categories._3gram",
                    "tags", "tags._2gram", "tags._3gram",
                    "caracteristiques.couleur",
                    "caracteristiques.materiaux"
                ]
            }
        })
    else:
        must.append({"match_all": {}})

    if categories:
        filter_clauses.append({"terms": {"categories.keyword": categories}})
    if marque:
        filter_clauses.append({"terms": {"marque.keyword": marque}})
    if prix_min is not None or prix_max is not None:
        range_q = {}
        if prix_min is not None:
            range_q["gte"] = prix_min
        if prix_max is not None:
            range_q["lte"] = prix_max
        filter_clauses.append({"range": {"prix.valeur": range_q}})
    if en_stock == "true":
        filter_clauses.append({"term": {"disponibilite.en_stock": True}})
    if note_min is not None:
        filter_clauses.append({"range": {"evaluations.note_moyenne": {"gte": note_min}}})

    body = {
        "from": from_,
        "size": size,
        "query": {
            "bool": {
                "must": must,
                "filter": filter_clauses
            }
        },
        "aggs": {
            "categories": {
                "terms": {"field": "categories.keyword", "size": 30}
            },
            "marques": {
                "terms": {"field": "marque.keyword", "size": 30}
            },
            "prix_stats": {
                "stats": {"field": "prix.valeur"}
            },
            "notes": {
                "histogram": {"field": "evaluations.note_moyenne", "interval": 1, "min_doc_count": 0}
            },
            "en_stock": {
                "terms": {"field": "disponibilite.en_stock"}
            },
            "tags": {
                "terms": {"field": "tags.keyword", "size": 20}
            }
        },
        "highlight": {
            "fields": {
                "nom": {},
                "description": {},
                "marque": {}
            },
            "pre_tags": ["<mark>"],
            "post_tags": ["</mark>"]
        }
    }

    # Sorting
    if tri == "prix_asc":
        body["sort"] = [{"prix.valeur": "asc"}]
    elif tri == "prix_desc":
        body["sort"] = [{"prix.valeur": "desc"}]
    elif tri == "note":
        body["sort"] = [{"evaluations.note_moyenne": "desc"}]
    elif tri == "recent":
        body["sort"] = [{"date_ajout": "desc"}]
    elif tri == "nom_asc":
        body["sort"] = [{"nom._index_prefix": "asc"}]

    resp = es.search(index=INDEX, body=body)

    hits = []
    for hit in resp["hits"]["hits"]:
        src = hit["_source"]
        src["_score"] = hit.get("_score")
        src["_highlight"] = hit.get("highlight", {})
        hits.append(src)

    return jsonify({
        "total": resp["hits"]["total"]["value"],
        "page": page,
        "size": size,
        "pages": -(-resp["hits"]["total"]["value"] // size),  # ceil division
        "hits": hits,
        "aggregations": {
            "categories": [
                {"key": b["key"], "count": b["doc_count"]}
                for b in resp["aggregations"]["categories"]["buckets"]
            ],
            "marques": [
                {"key": b["key"], "count": b["doc_count"]}
                for b in resp["aggregations"]["marques"]["buckets"]
            ],
            "prix_stats": resp["aggregations"]["prix_stats"],
            "notes": [
                {"key": b["key"], "count": b["doc_count"]}
                for b in resp["aggregations"]["notes"]["buckets"]
            ],
            "en_stock": [
                {"key": b["key_as_string"], "count": b["doc_count"]}
                for b in resp["aggregations"]["en_stock"]["buckets"]
            ],
            "tags": [
                {"key": b["key"], "count": b["doc_count"]}
                for b in resp["aggregations"]["tags"]["buckets"]
            ]
        }
    })


@app.route("/api/suggestions")
def suggestions():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])

    body = {
        "size": 7,
        "query": {
            "multi_match": {
                "query": q,
                "type": "bool_prefix",
                "fields": [
                    "nom", "nom._2gram", "nom._3gram",
                    "marque", "marque._2gram", "marque._3gram",
                    "categories", "categories._2gram", "categories._3gram"
                ]
            }
        },
        "_source": ["nom", "marque", "images", "prix"]
    }

    resp = es.search(index=INDEX, body=body)

    results = []
    for hit in resp["hits"]["hits"]:
        src = hit["_source"]
        results.append({
            "nom": src["nom"],
            "marque": src.get("marque", ""),
            "image": src.get("images", ""),
            "prix": src.get("prix", {}).get("valeur")
        })

    return jsonify(results)


@app.route("/api/product/<product_id>")
def product_detail(product_id):
    body = {
        "query": {
            "term": {"id": product_id}
        }
    }
    resp = es.search(index=INDEX, body=body)

    if resp["hits"]["total"]["value"] == 0:
        return jsonify({"error": "Produit non trouvé"}), 404

    return jsonify(resp["hits"]["hits"][0]["_source"])


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
