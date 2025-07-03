# HOCOVISIO - API

## Introduction

le backend HOCOVISIO est contruit en REST utilisant à la fois HTTP et websockets.

fonctions clés :

- mediasoup est installé comme un sfu (selective forwarding unit) pour recevoir et envoyer les flux media (audio et video)
- gérer les visioconférence (onetoone) entre les patients et les medecins et autre (sessions)
- téléverser et télécharger des documents
- connecter les dispositifs médicaux

## Achitecture générale

- ./src : contient le code source
  - ./Context : contient le seul ficheir Request.js :
    c'est une classe (class Context) qui regroupe le context d'une requete (request, response, session, onetoone)
  - ./Controllers : contient les controlleurs
  - ./Entities : Contient les tables SQL (postgres)
  - ./Factory : c'est une classe qui centralise les repositories, services, routes et controlleurs. elle aussi getController(name) qui initialize un controlleur
  - ./Repositories : contient les repositories crées par Typeorm nativement en ajoutant des méthodes spécifiques à notre usage
  - ./Routes : les routes (endpoints REST)
  - ./Services :
    - ./Documents/Uploader.js : librairie multer pour gérer les téléversements des fichiers
    - ./Monitor/Monitor.js : est une classe pour marquer les visioconférences (onetoone) comme killed ou les supprimer à partir d'une date précise
    - ./sfu : module qui contient le code mediasoup

## Architecture du SFU (mediasoup)

![alt text](./HocoVisio_sfu_architecture.png)

## Architecture de la base données

## Diagramme de séquence

Action : la première visite de l'application

```mermaid
sequenceDiagram
    Client->>Hocovisio: GET /settings
    Hocovisio->>PostgreSQL: Device : getAll
    PostgreSQL-->> Hocovisio: {devices : Device[]}
    Hocovisio-->>Client: {devices : Device[]}
```

Action : Create session

```mermaid
sequenceDiagram
    Client->>Hocovisio: POST /onetoone
    Hocovisio->>PostgreSQL: OneToOne : create
    Hocovisio->>PostgreSQL: Session : create
    Hocovisio->>PostgreSQL: Session : create
    Hocovisio->>PostgreSQL: Session : create
    PostgreSQL-->> Hocovisio: {sessions : Session[]}
    Hocovisio-->>Client: {sessions : Session[]}
```

Action : destroy this session

```mermaid
sequenceDiagram
    Client->>Hocovisio: DELETE /onetoone/:oneToOneToken
    Hocovisio->>PostgreSQL: OneToOne : find by token
    PostgreSQL-->> Hocovisio: {OneToOne : OneToOne}
    Hocovisio->>PostgreSQL: OneToOne.status = killed
    Hocovisio->>PostgreSQL: OneToOne.message : remove
    Hocovisio->>PostgreSQL: OneToOne.document : remove
    Hocovisio->>PostgreSQL: Stats : create('killed', onetoone, session=null)
    Hocovisio-->>Client: {}

```

Action : ouvrir la session du patient

```mermaid
sequenceDiagram
    Patient->>Hocovisio: GET /session/:ontoneToken/:sessionToken
    Hocovisio->>PostgreSQL : find session
    alt session not valid
        Hocovisio-->>Patient: err 401 : {msg : session not valid }
    else token_onetime_used = 0 or patient.isLogged
        Hocovisio-->>Patient: 200 : {session}
    else
        Hocovisio-->>Patient: 200 : {...session, session.token_onetime_used = 0, validate_fromadmin = 0}
        Hocovisio->>Medecin: ws:emit("newSessionToValidate")
        Medecin->>Hocovisio : POST: /validate {patient SessionId}
        Hocovisio-->>Medecin : 200 {success: patient SessionId}
        Hocovisio->>Patient : ws:emit newSessionIsValidate
        Hocovisio-->>Patient : 200 : {newSession}
    end
```

Action : ouvrir la session du medecin

```mermaid
sequenceDiagram
    Medecin->>Hocovisio: GET /session/:ontoneToken/:sessionToken
    Hocovisio-->>Medecin: 200 {session}
```

Action : Remplir le questionnaire médical

```mermaid
sequenceDiagram
    Patient->>Hocovisio: POST /session/infos  {data: {modified fields}}
    alt no data
        Hocovisio-->Patient: 401 : {msg: data not valid}
    else
        Hocovisio->>PostgreSQL: update MedicalInfo
        Hocovisio->>Medecin: ws:emit("infoUpdate")
        Hocovisio-->>Patient: 200 {id, data: modified fields}
    end

```

Action : Remplir le formulaire medecin

```mermaid
sequenceDiagram
    Medecin->>Hocovisio: POST /session/infos  {data: {modified fields}}
    alt no data
        Hocovisio-->Medecin: 401 : {msg: data not valid}
    else with data
        Hocovisio->>PostgreSQL: update MedicalInfo
        Hocovisio->>Patient: ws:emit("infoUpdate")
        Hocovisio-->>Medecin: 200 {id, data: modified fields}
        alt upload documents
        loop
        Medecin->>Hocovisio: POST /upload-file {document}
        Hocovisio->>PostgreSQL: create Document
        Hocovisio->>Patient: ws:emit("newMessage): document
        Hocovisio-->>Medecin: 200 {document}:
        Hocovisio->>PostgreSQL: update MedicalInfo
        Hocovisio->>Patient: ws:emit("infoUpdate")
        Hocovisio-->>Medecin: 200 {id, data: modified fields}
        end
        else no documents
        Hocovisio-->>Medecin: 200 [{}]
        end
    end
```
