# Arquitectura de Backend — Handle

Versión 0.1 · 2026-11-07

Diagramas en Mermaid (se renderizan en GitHub, VS Code con extensión Mermaid, y la mayoría de visores Markdown).

---

## 1. Diagrama de componentes (alto nivel)

```mermaid
flowchart TB
    subgraph Cliente["🖥️ Cliente (Browser / PWA)"]
        UI["React + shadcn/ui"]
        MAP["MapLibre GL JS"]
    end

    subgraph Edge["☁️ Cloudflare Worker — TanStack Start"]
        SF["Server Functions / API /api/v1"]
        WH["Webhook Handler (Pey)"]
        PP["PaymentProvider\n(Pey | Mock)"]
        GEO["Geocoder (Nominatim client)"]
    end

    subgraph Supabase["🗄️ Supabase"]
        AUTH["Auth (email/magic link)"]
        DB[("Postgres + RLS")]
        ST["Storage (KYB docs, privado)"]
    end

    subgraph Externos["🌐 Servicios externos"]
        PEY["API Pey — CoDi QR/Push"]
        NOM["Nominatim / OSM"]
        TILES["Tiles OSM"]
    end

    UI -->|auth, datos| SF
    UI --> AUTH
    MAP --> TILES
    MAP -->|GET negocios aprobados| SF
    SF --> DB
    SF --> ST
    SF --> PP
    PP --> PEY
    SF --> GEO
    GEO --> NOM
    PEY -->|webhook pago| WH
    WH --> DB
    WH -->|acumula puntos + ingreso| DB
```

---

## 2. Diagrama entidad-relación (núcleo)

```mermaid
erDiagram
    organizations ||--o{ profiles : tiene
    organizations ||--|| businesses : "es"
    businesses ||--o{ kyb_documents : adjunta
    businesses ||--o{ kyb_reviews : "revisado por"
    businesses ||--|| pey_accounts : "cobra con"
    businesses ||--o{ charges : genera
    businesses ||--o{ point_rules : define
    customers ||--o{ charges : "paga (opc)"
    customers ||--o{ point_transactions : acumula
    charges ||--o{ point_transactions : origina
    profiles ||--o{ charges : "cajero crea"

    organizations {
        uuid id PK
        text nombre
    }
    businesses {
        uuid id PK
        uuid org_id FK
        text nombre_comercial
        text rfc
        enum categoria
        enum estado_kyb
        bool recomendado
        numeric lat
        numeric lng
    }
    charges {
        uuid id PK
        uuid business_id FK
        uuid customer_id FK
        numeric monto
        enum tipo
        enum estado
        text pey_charge_id
        text idempotency_key
    }
    point_transactions {
        uuid id PK
        uuid customer_id FK
        uuid business_id FK
        enum tipo
        numeric puntos
        numeric saldo_resultante
    }
```

---

## 3. Secuencia — Cobro CoDi con acumulación de puntos

```mermaid
sequenceDiagram
    actor Cajero
    participant UI as App (cliente)
    participant SF as Worker (server fn)
    participant Pey
    participant WH as Webhook handler
    participant DB as Supabase

    Cajero->>UI: Nuevo cobro (monto, cliente?)
    UI->>SF: crearCobro(monto, tipo=qr, idempotencyKey)
    SF->>DB: insert charge (estado=pendiente)
    SF->>Pey: createQrCharge(bankAccountId, monto)
    Pey-->>SF: { chargeId, qrPayload }
    SF->>DB: update charge (pey_charge_id)
    SF-->>UI: muestra QR CoDi
    Note over Cajero,UI: Cliente escanea y paga desde su app bancaria
    Pey-->>WH: webhook pago confirmado (firmado)
    WH->>WH: verifica firma + idempotencia
    WH->>DB: update charge (estado=pagado)
    WH->>DB: insert transaction (ingreso)
    WH->>DB: insert point_transaction (acumulacion)
    WH-->>Pey: 200 OK
```

---

## 4. Secuencia — KYB (alta y aprobación)

```mermaid
sequenceDiagram
    actor Dueno as Dueño
    actor Admin as Admin de red
    participant UI
    participant SF as Worker
    participant DB as Supabase
    participant NOM as Nominatim

    Dueno->>UI: Completa formulario KYB + sube docs
    UI->>SF: guardarExpediente()
    SF->>DB: insert business (estado=en_revision) + kyb_documents
    Admin->>UI: Revisa cola de KYB
    UI->>SF: aprobar(business_id)
    SF->>DB: update business (estado=aprobado)
    SF->>NOM: geocode(direccion + cp)
    NOM-->>SF: { lat, lng }
    SF->>DB: update business (lat, lng, activo=true)
    SF->>DB: insert kyb_review (decision=aprobado)
    Note over Admin,DB: Negocio ya puede conectar cuenta Pey y aparece en el mapa
```

---

## 5. Roles y acceso (RLS resumen)

```mermaid
flowchart LR
    AR["Admin de red\n(global)"] --> ALL["Todas las orgs\n+ cola KYB + mapa"]
    DU["Dueño\n(org_id)"] --> OWN["Su negocio:\nKYB, Pey, puntos, equipo, reportes"]
    CA["Cajero\n(org_id)"] --> CAJA["Solo: cobrar + canjear puntos"]
    CL["Cliente\n(customer)"] --> WALLET["Su monedero + historial + mapa"]
```
