import json
import sys


def json_array_to_bulk(input_file: str, output_file: str, index_name: str = "films") -> None:
    with open(input_file, encoding="utf-8") as f:
        films = json.load(f)

    if not isinstance(films, list):
        raise ValueError(f"'{input_file}' doit contenir un tableau JSON (liste).")

    with open(output_file, "w", encoding="utf-8") as out:
        for i, film in enumerate(films, start=1):
            action = {"index": {"_index": index_name, "_id": str(i)}}
            out.write(json.dumps(action, ensure_ascii=False) + "\n")
            out.write(json.dumps(film, ensure_ascii=False) + "\n")
        out.write("\n")

    print(f"{len(films)} document(s) écrits dans '{output_file}'.")


if __name__ == "__main__":
    input_file  = "produits.json"
    output_file = "produits_bulk.json"
    index_name  = "produits"

    json_array_to_bulk(input_file, output_file, index_name)
