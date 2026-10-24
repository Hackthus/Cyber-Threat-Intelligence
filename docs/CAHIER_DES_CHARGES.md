# Cyber Threat Intelligence

## 1. Présentation

Cyber Threat Intelligence (CTI) est une plateforme
communautaire de signalement et de recherche de ressources
potentiellement malveillantes.

## 2. Objectifs

- Permettre le signalement de ressources suspectes.
- Permettre la recherche de leur réputation.
- Centraliser les signalements communautaires.
- Enrichir les recherches avec des sources externes.
- Expliquer les résultats et leur provenance.
- Protéger les utilisateurs contre les abus.

## 3. Périmètre du MVP

### Recherche

- Recherche par URL.
- Recherche par nom de domaine.
- Recherche par adresse e-mail.
- Consultation des résultats connus.
- Affichage des dates et des sources.

### Signalement

- Soumission d'une ressource suspecte.
- Sélection d'une catégorie de menace.
- Ajout d'une description.
- Génération d'un identifiant de signalement.
- Modération des signalements.

### Administration

- Consultation des signalements.
- Acceptation ou rejet d'un signalement.
- Correction des statuts.
- Historique des actions administratives.

### Sources externes

- Architecture permettant d'ajouter des connecteurs.
- Gestion des erreurs et des limites d'API.
- Conservation de la provenance des résultats.

## 4. Principes de sécurité

- Validation stricte des entrées.
- Protection contre les abus.
- Contrôle des permissions.
- Protection des secrets.
- Minimisation des données personnelles.
- Journalisation des actions sensibles.
- Aucun verdict malveillant sans justification suffisante.
- Aucune ouverture automatique des URL soumises.

## 5. Architecture

- Frontend : Next.js et TypeScript.
- Backend : Python et FastAPI.
- Base de données : PostgreSQL.
- Accès aux données : SQLAlchemy.
- Migrations : Alembic.
- Conteneurisation : Docker Compose.
- Tests : Pytest.

## 6. Modèle économique

- Accès communautaire gratuit.
- API professionnelle envisageable.
- Fonctionnalités destinées aux entreprises à terme.

## 7. Évolution

Le produit sera développé progressivement.
Chaque fonctionnalité devra être testée avant son intégration.
