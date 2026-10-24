Projet final —un Acteur du Retail e-commerce
Mastère Spécialisé Data & Generative AI Engineering
Ce projet de fin de semestre demande de concevoir et de développer, en équipe, une plateforme data end-to-end pour un acteur du retail e-commerce, en mobilisant les compétences des quatre modules du Bloc 1 — Fondations Techniques : Data Storage Systems (SQL & NoSQL), Enterprise Data Lakes & Lakehouse Foundations, Scalable Data Platforms & API Engineering, et Real-Time Data Engineering & Distributed Processing.
Exemple concret : l'application Market
Prenons un exemple. Vous développez une application pour un site de vente en ligne (un retailer) appelé Market. Cette application doit permettre à l'équipe de Market de :
•	voir les ventes de la journée en direct ;
•	suivre les commandes des clients ;
•	gérer le catalogue de produits ;
•	surveiller les stocks et les entrepôts ;
•	vérifier que la plateforme fonctionne bien.
L'application est composée de 5 onglets (une maquette interactive est fournie pour les voir). Pour chaque onglet, le tableau dit ce que l'écran montre et ce qu'il faut développer derrière.
Onglet	Ce que l'écran montre	Ce qu'il faut développer
1. Vue d'ensemble	Les chiffres du jour : nombre de commandes, chiffre d'affaires, panier moyen, taux de rupture de stock.
Un graphique des commandes heure par heure.
La liste des produits bientôt en rupture.
Les alertes en direct : rupture de stock proche, échec de paiement, pic de commandes, panier abandonné.	Kafka reçoit les événements (clics, commandes) au fur et à mesure.
Spark Streaming calcule les chiffres par fenêtre de temps et détecte les alertes.
Une API donne ces résultats à l'écran.
Le stock restant est lu dans PostgreSQL.
Volets 4, 3 et 1.
2. Commandes	La liste des commandes récentes : référence, client, montant, date.
Le statut de chaque commande : payée, en préparation, paiement en échec, livrée.	Les tables clients, commandes et lignes de commande dans PostgreSQL.
Une API REST pour créer et lire une commande. La commande s'enregistre en entier ou pas du tout.
Si le paiement échoue, le stock réservé est rendu (pattern Saga).
Volets 1 et 3.
3. Catalogue	Les fiches produits : nom, catégorie, prix, stock.
Les caractéristiques propres à chaque produit (autonomie d'un casque, pointure d'une chaussure).	Une collection MongoDB, car les produits n'ont pas tous les mêmes caractéristiques.
Une API GraphQL : l'écran demande exactement les champs dont il a besoin.
Le lien avec PostgreSQL se fait avec product_id.
Volets 1 et 3.
4. Logistique	Les entrepôts et leur taux de remplissage en pourcentage.
Un statut : normal ou saturation proche.	Les données de stock et de livraison arrivent en continu par Kafka.
Elles sont rangées dans le Data Lake : zone raw, puis zone curated une fois nettoyées.
Un calcul donne le taux de remplissage, avec une alerte au-dessus de 90 %.
Volets 2 et 4.
5. Observabilité plateforme	La santé de chaque service : API gateway, commandes, catalogue, paiement, pipeline Kafka.
Pour chacun : le temps de réponse, le taux d'erreur ou le débit, et un statut (OK ou dégradé).	Chaque service envoie ses métriques à Prometheus.
Un tableau de bord Grafana les affiche.
Des traces OpenTelemetry et des logs permettent de retrouver l'origine d'un problème.
Une alerte se déclenche quand un service devient dégradé.
Volet 3.

Un onglet s'appuie souvent sur plusieurs volets : c'est normal. Le jury vérifiera que ce que l'écran affiche vient vraiment de vos bases de données, de vos API et de votre flux Kafka, et pas de chiffres écrits à la main.
Contexte et cas d'usage métier
Market est un acteur fictif du retail e-commerce multi-domaines (catalogue produits, commandes, paiement, logistique, relation client) qui traite plusieurs millions d'événements par jour (clics, recherches, commandes, retours). Sa plateforme actuelle repose sur des bases relationnelles cloisonnées par domaine, un reporting en batch à J+1 et aucune vision temps réel de l'activité.
La direction data confie à chaque équipe projet la conception et le développement d'une nouvelle plateforme data scalable, capable de :
•	unifier le stockage transactionnel et analytique de l'ensemble des domaines métier ;
•	exposer les données et les fonctionnalités aux équipes internes (BI, marketing, logistique) via des API documentées ;
•	détecter et réagir en quasi temps réel aux événements critiques (rupture de stock, pic de fraude, panier abandonné) ;
•	absorber la montée en charge des pics d'activité (soldes, Black Friday) sans dégradation de service.
Chaque équipe joue le rôle d'une squad data engineering mandatée par Market : elle doit produire une architecture argumentée et un prototype fonctionnel démontrant la faisabilité de la solution, puis la défendre devant un jury.

Objectifs pédagogiques et compétences visées
Le projet mobilise et articule les compétences opérationnelles des quatre modules du semestre.
Module	Compétences mobilisées sur le projet
Data Storage Systems (SQL & NoSQL)	Modéliser et choisir entre moteurs relationnels et NoSQL selon des critères de cohérence, scalabilité et coût ; concevoir un schéma et une stratégie d'indexation ; justifier un choix d'architecture via un Architecture Decision Record (ADR)
Enterprise Data Lakes & Lakehouse Foundations	Concevoir des pipelines d'ingestion multi-sources (batch et streaming) ; organiser les zones d'un data lake ; choisir des formats analytiques et de table (Parquet, Delta Lake/Iceberg) ; assurer gouvernance, qualité et traçabilité des données
Scalable Data Platforms & API Engineering	Concevoir une architecture microservices orientée données ; concevoir et documenter des API REST/GraphQL contract-first ; mettre en œuvre résilience (circuit breaker, retry, bulkhead) et observabilité
Real-Time Data Engineering & Distributed Processing	Concevoir des pipelines de streaming à faible latence et tolérants aux pannes ; garantir un traitement exactly-once ; diagnostiquer un incident de production sur un flux temps réel
Au-delà des compétences techniques de chaque module, le projet évalue la capacité des étudiants à arbitrer entre plusieurs architectures candidates et à défendre ces choix à l'oral, comme attendu à ce niveau de formation
Périmètre fonctionnel et technique attendu
Le projet est structuré en quatre volets, chacun adossé à un module du semestre. Chaque équipe doit couvrir les quatre volets, même de façon simplifiée sur certains d'entre eux si les contraintes de temps l'imposent (à justifier dans le dossier).
Volet	Contenu attendu	Livrable technique minimal
1. Stockage des données (SQL & NoSQL)	Modéliser le socle transactionnel multi-domaines ; choisir au moins un moteur relationnel et un moteur NoSQL adaptés aux cas d'usage (ex. PostgreSQL pour les commandes, MongoDB ou Cassandra pour le catalogue) ; définir indexation, partitionnement et stratégie de sauvegarde	Schéma de données, scripts de création, ADR justifiant les choix de moteurs
2. Data Lake & Lakehouse	Concevoir l'architecture en zones (raw / staging / curated / consumption) sur un stockage objet ; ingérer les données opérationnelles en batch et en streaming ; stocker au format colonne / table Lakehouse ; cataloguer et tracer les données	Pipeline d'ingestion fonctionnel, schéma d'architecture des zones, catalogue de données
3. Plateforme scalable & API	Découper la plateforme en microservices orientés données ; exposer au moins deux API (REST et GraphQL) contract-first et versionnées ; mettre en place une API gateway ; intégrer un pattern de résilience et un socle d'observabilité	Services conteneurisés déployables, documentation OpenAPI/GraphQL, tableau de bord d'observabilité
4. Traitement temps réel	Mettre en place un pipeline de streaming (ex. Kafka) ingérant au moins un flux d'événements métier (clics, commandes) ; traiter ce flux avec fenêtrage et gestion d'état ; détecter un cas d'usage temps réel ; garantir la tolérance aux pannes	Pipeline de streaming fonctionnel, démonstration d'un cas d'usage temps réel, dispositif de monitoring des flux
Architecture cible de la plateforme

La plateforme s'organise en cinq couches empilées : les sources (événements et transactions par domaine), l'ingestion et le streaming (volet temps réel), le stockage (volet SQL/NoSQL pour l'OLTP et volet Lakehouse pour l'analytique), la plateforme de services et d'API (volet microservices/API), et enfin les consommateurs internes. Chaque équipe reste libre d'ajuster les flux entre couches tant que l'architecture globale est cohérente et justifiée dans le dossier technique.







Ce qu'il faut faire en plus, volet par volet
Ce tableau dit clairement ce qu'on attend de vous. Si vous simplifiez quelque chose, expliquez pourquoi dans le dossier technique. Les mots techniques sont expliqués dans le lexique, à la fin du document.
Volet	Ce qu'il faut faire	Ce que vous montrez
1. Stockage des données (SQL & NoSQL)	Écrivez un ADR (une fiche qui explique un choix) pour chaque base de données : pourquoi celle-là et pas une autre ?
Ajoutez des index (des raccourcis qui rendent les recherches plus rapides). Montrez une requête avant et après avec la commande EXPLAIN.
Découpez les très grosses tables en morceaux, par exemple les commandes par date.
Prévoyez des sauvegardes et testez une restauration : on sauvegarde, puis on vérifie qu'on peut tout récupérer.
Protégez les données avec des clés étrangères et des contrôles sur les quantités et les montants. Une commande doit s'enregistrer en entier ou pas du tout (transaction).
Donnez à chaque service son propre schéma PostgreSQL et son propre rôle : un service ne lit jamais les tables d'un autre.	Schéma et scripts de création
Fiches ADR
Requêtes EXPLAIN
Sauvegarde et restauration testées
2. Data Lake & Lakehouse	Rangez vos fichiers dans MinIO ou S3 (un espace de stockage de fichiers), pas seulement dans un dossier de votre ordinateur.
Créez 4 zones : raw (données brutes), staging (données en cours de nettoyage), curated (données propres) et consumption (données prêtes pour les équipes). Expliquez quand une donnée passe d'une zone à l'autre.
Utilisez Delta Lake ou Iceberg : ce format garde l'historique et évite les données écrites à moitié. Montrez qu'on peut revenir à une version plus ancienne.
Utilisez Spark pour transformer les données.
Vérifiez la qualité automatiquement : pas de valeur vide, pas de doublon, des valeurs normales. Mettez les lignes en erreur de côté.
Tenez un catalogue : pour chaque jeu de données, d'où il vient, qui en est responsable, quand il a été mis à jour.
Protégez les données personnelles : remplacez l'email du client par un code dès la zone staging.	Pipeline qui tourne (batch et streaming)
Schéma des 4 zones
Catalogue de données
Rapport de qualité
3. Plateforme & API	Découpez la plateforme en au moins 3 microservices, chacun avec ses propres données (l'exemple en a quatre : commandes, stock, paiement, catalogue).
Faites au moins 2 API : une REST et une GraphQL. Écrivez d'abord le contrat (OpenAPI pour REST, un schéma pour GraphQL), puis le code.
Mettez un numéro de version dans vos API (par exemple /v1).
Ajoutez une API gateway (Kong, Traefik ou NGINX). C'est la porte d'entrée unique : elle vérifie qui appelle (clé d'API ou JWT) et limite le nombre d'appels.
Rendez vos services solides : timeout (on n'attend pas sans fin), retry (on réessaie), circuit breaker (on arrête d'appeler un service en panne) et bulkhead (une panne ne bloque pas tout). Montrez le circuit breaker qui s'ouvre.
Évitez les incohérences : si une commande échoue après une réservation de stock, rendez le stock (pattern Saga). Si la même demande arrive deux fois, elle ne doit réserver qu'une fois (idempotence).
Surveillez la plateforme : métriques Prometheus, tableau de bord Grafana, traces OpenTelemetry et logs faciles à lire.	Services lancés avec docker-compose
Contrats OpenAPI et GraphQL
Dashboard Grafana
Test de panne
4. Temps réel	Utilisez Spark Structured Streaming pour lire Kafka. Regroupez les événements par fenêtres de temps et gardez en mémoire ce dont vous avez besoin (l'état). Le watermark fixe le retard maximum accepté pour un événement.
Si le programme plante, il doit repartir là où il s'est arrêté (checkpoint), sans perdre ni répéter d'événement. Montrez-le en l'arrêtant en direct.
Visez l'exactly-once : chaque événement est compté une seule fois. Montrez comment vous le garantissez, ou expliquez le niveau choisi et pourquoi.
Réalisez au moins un cas d'usage : rupture de stock proche, pic de fraude ou panier abandonné. L'alerte doit apparaître dans le tableau de bord.
Surveillez le flux : nombre de messages par seconde, retard de lecture (lag), erreurs.	Pipeline qui tourne
Démo avec une panne volontaire
Mesures du retard (lag)
Pour tout le projet	Ne mettez jamais de mot de passe dans le dépôt (utilisez un fichier .env qui n'est pas partagé). Vos API doivent demander une identification.
Écrivez des tests (de petites fonctions, des API, le parcours complet) qui se lancent tout seuls à chaque commit : c'est l'intégration continue.
Tout doit démarrer avec une seule commande, expliquée dans le README.	Pipeline d'intégration continue
README clair


Comment écrire un ADR
Un ADR est une fiche d'une page au maximum qui explique un choix technique. Faites-en au moins un par volet, avec les rubriques ci-dessous.
Rubrique	Ce qu'il faut écrire
Titre et statut	Un numéro, le nom de la décision et son état (proposée, acceptée ou remplacée).
Contexte	Quel est le besoin ? Quelles sont les contraintes : quantité de données, vitesse, exactitude, coût ?
Options	Au moins deux solutions possibles, avec leurs points forts et leurs points faibles.
Décision	La solution choisie et pourquoi. Appuyez-vous sur CAP/BASE : vaut-il mieux des données toujours exactes, ou un service toujours disponible ?
Conséquences	Ce que le choix apporte, ce qu'il coûte, les risques et le plan B.
Exemple 1	ADR-001, PostgreSQL pour les commandes et le stock. Pourquoi : les données doivent toujours être exactes, pour ne pas vendre un produit qui n'est plus en stock. Solutions écartées : MongoDB (les opérations sur plusieurs documents sont plus lourdes) et Cassandra (les données peuvent être exactes avec un peu de retard seulement). Conséquence : pour grandir, on prend d'abord un serveur plus puissant, puis on ajoute des copies pour la lecture.
Exemple 2	ADR-002, MongoDB pour le catalogue. Pourquoi : les produits n'ont pas tous les mêmes caractéristiques (autonomie pour un casque, pointure pour des chaussures), il faut donc un schéma souple. Conséquence : pas de clé étrangère. Le lien avec PostgreSQL passe par product_id, et c'est votre code qui doit le vérifier.

Le découpage en 4 microservices
Dans l'exemple, la plateforme est découpée en 4 services. Chaque service possède ses données, et les autres n'y accèdent que par son API.
Service	Ce qu'il fait	Ses données	Il appelle
Commandes	Crée et lit les commandes. Il orchestre les autres services.	PostgreSQL, schéma orders	Catalogue, Stock, Paiement
Stock	Gère les quantités et les entrepôts. Réserve du stock et le rend.	PostgreSQL, schéma inventory	aucun
Paiement	Encaisse une commande. Dans l'exemple, il refuse au-dessus de 200 €.	PostgreSQL, schéma payments	aucun
Catalogue	Donne les produits, leurs prix et leurs caractéristiques.	MongoDB, collection catalog	aucun


Ce que cela change pour vous
•	Il y a un seul serveur PostgreSQL, mais un schéma et un rôle par service : un service ne peut pas lire les tables d'un autre.
•	Il n'y a plus de clé étrangère entre services : product_id et order_id sont des liens que votre code doit vérifier.
•	Il n'y a plus de jointure entre services : pour afficher le nom d'un produit dans une commande, il faut appeler l'API du catalogue.
•	Une commande touche 3 services : si le paiement échoue, il faut rendre le stock (pattern Saga).
Les schémas de données à utiliser (volet 1)
Voici les schémas de référence de l'exemple Market. Votre équipe peut les adapter, mais vous devez expliquer vos choix dans un ADR.
Base PostgreSQL : trois schémas, un par service. Une flèche pleine va de la clé étrangère (FK) vers la clé primaire (PK) qu'elle désigne. Une flèche pointillée bleue est un lien entre services, sans contrainte SQL.

Base MongoDB : le catalogue. Chaque produit peut avoir des caractéristiques différentes (champ attributes). Le lien avec PostgreSQL passe par product_id et n'est vérifié par aucune des deux bases : c'est votre code qui doit le faire. Les prix sont en centimes dans les deux bases.



Authentification, autorisation et rôles des API
Jusqu'ici, vos API répondent à tout le monde. Dans une vraie plateforme, ce n'est pas possible : on doit savoir qui appelle et ce qu'il a le droit de faire. Elle vous donne un modèle simple à appliquer sur l'exemple Market.
Deux questions différentes
	Authentification	Autorisation
La question	Qui es-tu ?	Que as-tu le droit de faire ?
Exemple	Léa se connecte avec son identifiant et son mot de passe.	Léa est analyste : elle peut lire les commandes, mais pas modifier le catalogue.
Résultat si ça échoue	Erreur 401 (non identifié).	Erreur 403 (identifié, mais interdit).
Où ça se vérifie	À l'API gateway : le jeton est-il valide et non expiré ?	Dans chaque service : le rôle du jeton permet-il cette action ?

Comment ça marche, étape par étape
#	Qui	Ce qui se passe
1	L'utilisateur	Il envoie son identifiant et son mot de passe au service d'authentification (par exemple POST /v1/auth/login).
2	Service d'authentification	Il vérifie le mot de passe (stocké haché, jamais en clair) et renvoie un jeton JWT valable 15 minutes, plus un jeton de renouvellement.
3	L'utilisateur	Il envoie le JWT dans chaque appel : en-tête Authorization: Bearer <jeton>.
4	API gateway	Elle vérifie la signature et la date d'expiration du jeton, puis limite le nombre d'appels. Jeton absent ou invalide : 401.
5	Le service appelé	Il lit le rôle dans le jeton et le compare aux droits de l'action demandée. Rôle insuffisant : 403. Sinon, il répond.

Les règles à respecter
•	Le JWT contient l'identifiant de l'utilisateur (sub), ses rôles (roles) et sa date d'expiration (exp). Il est signé : personne ne peut le modifier sans que la gateway le détecte.
•	Les mots de passe sont hachés (bcrypt ou argon2). La clé de signature du JWT et les mots de passe de test sont dans le fichier .env, jamais dans le dépôt.
•	Les services qui s'appellent entre eux (par exemple Commandes vers Stock) utilisent un compte technique avec sa propre clé d'API, et un rôle limité.
•	L'API REST et l'API GraphQL utilisent le même jeton. En GraphQL, le contrôle se fait sur chaque requête ou mutation, pas seulement à l'entrée.
•	Déclarez la sécurité dans vos contrats : securitySchemes dans OpenAPI, et un message d'erreur clair dans le schéma GraphQL.
•	Ne mettez pas dans le jeton des données sensibles (email du client, adresse) : un JWT est signé, mais il peut être lu.
Gestion des rôles : le modèle RBAC
RBAC veut dire « contrôle d'accès par rôle ». On ne donne pas des droits à chaque personne : on crée quelques rôles, on donne des droits aux rôles, puis on attribue un ou plusieurs rôles à chaque personne. Voici cinq rôles pour l'exemple Market.
Rôle	Qui	Ce qu'il peut faire	Ce qu'il ne peut pas faire
admin	Responsable de la plateforme	Tout lire et tout écrire. Créer des utilisateurs et attribuer des rôles. Voir l'observabilité.	Rien n'est interdit, mais chaque action est tracée dans les logs.
catalog_manager	Équipe catalogue	Créer et modifier les produits et les prix. Lire les stocks.	Lire les paiements. Modifier les commandes ou les entrepôts.
analyst	Équipe BI et marketing	Lire les commandes, le catalogue, les stocks et les chiffres du jour.	Écrire ou modifier quoi que ce soit.
logistics	Équipe logistique	Lire les commandes. Lire et mettre à jour les stocks et les entrepôts.	Modifier le catalogue ou les prix.
service_account	Compte technique d'un service	Seulement les appels dont le service a besoin (ex. Commandes réserve du stock).	Se connecter à l'écran. Appeler une API sans lien avec son travail.

Qui a le droit d'appeler quoi (matrice des droits)
Lecture : L = lire, E = écrire (créer ou modifier), — = interdit (réponse 403).
Action (API)	admin	catalog_ manager	analyst	logistics	service_ account
GET /v1/orders	L	—	L	L	L
POST /v1/orders	E	—	—	—	E
GraphQL : lire le catalogue	L	L	L	L	L
GraphQL : mutation produit	E	E	—	—	—
GET /v1/warehouses	L	—	L	L	—
PUT /v1/inventory/{id}	E	—	—	E	E
GET /v1/dashboard/summary	L	L	L	L	—
POST /v1/admin/users, POST /v1/admin/roles	E	—	—	—	—

Comment l'organiser dans le code
•	Une table users, une table roles et une table user_roles dans un schéma auth de PostgreSQL.
•	Un contrôle réutilisable dans chaque service: par exemple @require_role("analyst", "admin"). Évitez de recopier des if sur le rôle dans chaque fonction.
•	Principe du moindre droit : un rôle n'a que ce dont il a besoin. En cas de doute, on refuse.
•	Ne confondez pas les deux types de rôles : les rôles PostgreSQL (un par service, vus dans le volet 1) protègent les tables ; les rôles applicatifs de cette partie protègent les API.
•	Chaque refus (401 ou 403) est écrit dans les logs avec la date, l'utilisateur et l'action demandée : c'est utile pour la soutenance.
Ce que vous montrez au jury
•	Un appel sans jeton : 401. Un appel avec un jeton expiré : 401.
•	Un appel avec un mauvais rôle (par exemple analyst qui fait un POST /v1/orders) : 403.
•	Le même appel avec le bon rôle : 200 ou 201.
•	Au moins trois rôles de la liste ci-dessus, la matrice des droits de votre équipe, et les contrats OpenAPI qui déclarent la sécurité.
Streaming et rôles : où le temps réel est-il vraiment utile ?
Tout le monde ne demande pas la même vitesse. Le streaming coûte plus cher qu'un traitement par lot (plus de machines, plus de réglages, plus de surveillance) : il doit être utilisé là où l'attente se paie. Ce tableau relie chaque rôle à son besoin de temps réel, dit si le streaming est adapté, et indique comment l'optimiser et comment le mesurer.
Adéquation : Très forte = quelques secondes comptent, le streaming est indispensable ; Forte = une alerte rapide change la décision ; Moyenne = quelques dizaines de secondes suffisent, un micro-batch convient ; Faible = un traitement classique suffit. Les valeurs cibles sont des ordres de grandeur : adaptez-les à votre machine et justifiez-les dans votre ADR.
Rôle	Besoin temps réel	Adéquation	Leviers d'optimisation	Indicateurs à suivre (cible indicative)
service_account
(paiement, antifraude)	Détecter un échec de paiement ou un pic de fraude avant la fin de la commande.	Très forte	Traiter les événements un par un ou en très petits lots.
Exactly-once et checkpoint rapide.
Limiter la durée de vie de l'état (TTL).	Latence de bout en bout p99 < 2 s.
Écart de comptage = 0 (aucun doublon, aucune perte).
Temps de reprise après panne < 30 s.
admin
(exploitation)	Savoir en quelques secondes qu'un service ou le flux Kafka est dégradé.	Forte	Collecter les métriques toutes les 5 s.
Alerter sur le lag Kafka.
Ajouter des partitions si le lag grimpe.	Lag du consommateur (messages) < 1 000.
Délai entre panne et alerte < 10 s.
Taux d'erreur < 1 %.
logistics
(entrepôts, stocks)	Voir une rupture de stock proche ou un entrepôt à plus de 90 % avant qu'il soit plein.	Forte	Fenêtres glissantes d'une minute.
Partitionner Kafka par warehouse_id.
Watermark court, état compact.	Latence événement vers écran p95 < 5 s.
Alertes de rupture levées avant la rupture réelle (%).
Débit (messages par seconde).
analyst
(BI, marketing)	Suivre les ventes du jour et détecter un panier abandonné ou un pic de commandes.	Moyenne	Pré-calculer les agrégats par fenêtre.
Micro-batch de 30 s à 1 min.
Fenêtre de session de 30 min pour les paniers.
Cache sur l'API, compaction des petits fichiers Delta.	Fraîcheur des données < 60 s.
Temps de réponse de l'API p95 < 500 ms.
Taille moyenne des fichiers Delta (éviter les milliers de petits fichiers).
Événements tardifs écartés (%).
catalog_manager
(catalogue, prix)	Modifier un produit ou un prix et le voir pris en compte.	Faible	Une API classique suffit.
Option : publier un événement product_updated pour mettre à jour les caches.	Délai de prise en compte d'un prix < 1 min.
Erreurs 4xx et 5xx des mutations.

Comment l'utiliser
•	Choisissez pour votre démo le rôle où l'adéquation est la plus forte (logistique ou paiement) : c'est là que le streaming se justifie le mieux devant le jury.
•	Pour chaque rôle, gardez au moins deux indicateurs sur votre tableau de bord Grafana, et montrez comment une action d'optimisation les fait bouger (par exemple : plus de partitions, donc moins de lag).
•	Pour les rôles « Moyenne » ou « Faible », dites clairement pourquoi vous n'avez pas utilisé de streaming : c'est un arbitrage à défendre, pas un oubli.






Livrables attendus et soutenance
Type de livrable	Contenu	Format
Dossier technique	Contexte, architecture cible argumentée, ADR par volet, choix technologiques, difficultés rencontrées et arbitrages	Document écrit (15–25 pages)
Dépôt de code	Code source des quatre volets, infrastructure as code / docker-compose, scripts de déploiement, README d'installation	Déposer le projet sur un espace dédié
Documentation technique	Schémas de données, documentation API (OpenAPI/GraphQL), schéma d'architecture, guide d'utilisation	Fichiers versionnés avec le code
Soutenance orale	Démonstration live de la plateforme (cas d'usage temps réel inclus) et présentation des choix d'architecture, suivies de questions	20–30 minutes devant un jury (enseignants et/ou professionnels)
La soutenance évalue à la fois la maîtrise technique démontrée (démonstration fonctionnelle) et la capacité à argumenter les choix d'architecture face à une contradiction construite par le jury, dans la continuité des modalités pédagogiques des quatre modules du semestre.





Environnement technique, contraintes et extensions
Volet	Technologies suggérées
Stockage SQL/NoSQL	PostgreSQL ou MySQL, MongoDB, Cassandra, Neo4j, Docker
Data Lake & Lakehouse	Stockage objet (S3, MinIO ou équivalent), Delta Lake ou Apache Iceberg, Apache Spark
Plateforme & API	Docker, FastAPI/Node/Spring, GraphQL (Apollo ou équivalent), OpenAPI/Swagger, Prometheus, Grafana, OpenTelemetry
Traitement temps réel	Apache Kafka, Spark Structured Streaming (ou Apache Flink)

Lexique : les mots techniques en clair
Mot	Ce que ça veut dire
ACID	Une opération réussit en entier ou pas du tout, et les données restent justes.
CAP / BASE	Deux façons de choisir. Soit les données sont toujours exactes, soit le service est toujours disponible. En cas de panne, on ne peut pas avoir les deux.
ADR	Fiche d'une page qui explique un choix technique.
Index	Raccourci qui rend une recherche dans une table plus rapide.
Data Lake / Lakehouse	Un Data Lake est un grand espace où l'on stocke toutes les données. Le Lakehouse y ajoute de l'ordre et des garanties de fiabilité.
Parquet / Delta / Iceberg	Parquet est un format de fichier pensé pour l'analyse. Delta et Iceberg y ajoutent l'historique et la fiabilité.
Contract-first	On écrit d'abord le contrat de l'API (ce qu'elle reçoit et ce qu'elle renvoie), puis le code.
API gateway	Porte d'entrée unique devant tous vos services.
Circuit breaker	Coupe les appels vers un service en panne pour que tout le reste ne tombe pas.
Saga	Suite d'étapes où chaque étape peut être annulée si une étape suivante échoue.
Idempotent	Envoyer deux fois la même demande donne le même résultat que l'envoyer une fois.
Kafka	Outil qui transporte en continu un flux de messages (clics, commandes).
Fenêtre et watermark	Une fenêtre regroupe les événements sur une durée, par exemple 30 secondes. Le watermark est le retard maximum accepté pour un événement.
Checkpoint	Point de sauvegarde qui permet de redémarrer sans tout perdre.
Exactly-once	Chaque événement est traité une seule fois, ni perdu ni en double.
Lag	Retard de lecture : nombre de messages pas encore traités.
Observabilité	Voir ce qui se passe dans le système grâce aux logs, aux métriques et aux traces.
Authentification / autorisation	Authentification : prouver qui on est. Autorisation : savoir ce qu'on a le droit de faire.
JWT	Jeton signé, envoyé à chaque appel d'API. Il contient l'identité, les rôles et une date d'expiration.
RBAC	Contrôle d'accès par rôle : on donne des droits à des rôles, puis des rôles aux personnes.
401 / 403	401 : non identifié (jeton absent ou invalide). 403 : identifié mais interdit.
p95 / p99	Valeur que 95 % (ou 99 %) des mesures ne dépassent pas. Plus parlant qu'une moyenne pour un temps de réponse.
