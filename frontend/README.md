# Frontend

Socle réservé à React, TypeScript, Vite, Tailwind CSS et Recharts. Le projet npm et les composants restent à initialiser.

Le [cahier des charges V3](../docs/MARKET_HARDWARE_CAHIER_DES_CHARGES_V3.md), §14, ajoute la boutique (catalogue, panier et checkout simulé), la synthèse trimestrielle et le module AI Assistant. Le catalogue public est consulté en GraphQL ; l'édition et l'approbation des produits passent par UnoPim. Ces fonctions restent à implémenter.

Les cinq domaines sont `overview`, `orders`, `catalog`, `logistics` et `observability` dans `src/features/`. Les valeurs métier devront provenir des services réels via la gateway, avec gestion du chargement, des données absentes, des erreurs et des autorisations.

Le module assistant V3 doit présenter la configuration PC sous budget : BOM complète, total et budget restant, preuves de compatibilité, informations inconnues, prix/stock horodatés et alternatives. Afficher explicitement l'absence de solution et les modifications de prix ou de stock au checkout.
