#!/bin/bash

# Installation de Docker
sudo apt install docker-compose curl -y

# Construction et lancement des conteneurs
docker-compose up --build -d

# Creation de l'index dans Elasticsearch
curl -X PUT "localhost:9200/products" -H 'Content-Type: application/json' --data-binary @mapping.json

# Importation des données dans Elasticsearch
curl -X POST "localhost:9200/products/_bulk" -H 'Content-Type: application/x-ndjson' --data-binary @produits_bulk.json

# IP Externe de la machine (pour accès depuis navigateur)
EXTERNAL_IP=$(hostname -I | awk '{print $1}')
echo "L'application est accessible à l'adresse : http://$EXTERNAL_IP"

# Fin
