# AaronDB Edge: A Rich Hickey Gap Analysis

> "Simplicity is not about making things easy. It is about untangling complexity." — Rich Hickey

This document analyzes the gap between **AaronDB Edge** (the proposed pure-JS compiled Gleam Datalog engine running on Cloudflare Workers/Durable Objects) and the current landscape of edge, local-first, and WASM databases.

## 1. The Competitor Landscape

The edge database ecosystem is currently dominated by three architectural approaches:
1. **WASM-Compiled Engines:** CozoDB (Datalog/Graph/Vector) compiled to WASM.
2. **Local-First Sync Engines:** Triplit and ElectricSQL, which use CRDTs to sync local clients with a central server.
3. **Edge-Native SQL:** LibSQL (Turso) and Cloudflare D1, which distribute SQLite to edge locations.

## 2. Feature Set Differences

| Feature / Primitive | AaronDB Edge (Proposed) | CozoDB (WASM) | Triplit | LibSQL (Turso) | ElectricSQL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Logic/Graph Engine** | **Yes (Native Datalog)** | **Yes (Native Datalog)** | No (Relational/Document) | No (SQL) | No (SQL via Postgres) |
| **Edge Native (V8 Isolate)** | **Yes (Pure JS Output)** | Partial (Heavy WASM bundle) | **Yes (JS Native)** | **Yes (Edge Replicas)** | No (Local Client + Heavy BE) |
| **Time-Travel / Diff** | **Yes (Fact-based)** | Yes (Time-travel built-in) | Partial (via CRDT logs) | No | No |
| **Vector Search** | Yes | Yes (HNSW via WASM) | No | Yes (Extensions) | No |
| **Actor-Model Integration** | **Yes (via Durable Objects)**| No (Single-threaded WASM) | No | No | No |

### Explaining the Differences

*   **Logic Engine (Datalog vs SQL vs Document):** AaronDB and CozoDB treat data as facts (`EAVTx`), enabling powerful recursive queries (graph traversals) directly at the edge. Triplit, LibSQL, and ElectricSQL are restricted by the limits of relational or document schemas.
*   **Edge Execution (JS vs WASM):** AaronDB compiles directly to JavaScript via Gleam. This results in an incredibly lightweight bundle size perfectly suited for Cloudflare Workers (which have tight bundle limits like 1MB). CozoDB relies on WASM; while powerful, running heavy database WASM engines inside Cloudflare Workers introduces asynchronous I/O challenges and large bundle overheads.
*   **Time-Travel / Immutability:** Because AaronDB is fundamentally a fact-database, time-travel is native (just query `query_at(Time)`). Relational sync engines (ElectricSQL) rely on complex logical replication logs from Postgres, which are not queryable in the same declarative way.
*   **Actor State (Durable Objects):** AaronDB maps its BEAM OTP heritage directly onto Cloudflare Durable Objects. A DO holds the database indices in its isolate memory, creating a micro-tenant actor. Competitors treat the edge as a stateless proxy (Turso) or a sync layer, completely complecting state and network.

## 3. Complexity vs Utility Matrix 

From a Hickey perspective, we must evaluate if the *incidental complexity* of building an edge engine is worth the *utility* gained.

| Architectural Decision | Utility Gained | Incidental Complexity Added | Hickey Verdict |
| :--- | :--- | :--- | :--- |
| **Pure JS compilation via Gleam** | Zero WASM overhead, fits <1MB Limits, runs natively in V8 Isolates. | Must rewrite index logic (No ETS). Must adapt to single-threaded async behavior. | **Worth it.** De-complects the engine from the OS/Memory constraints of C/Rust. |
| **Durable Objects as Actors** | Micro-tenancy. State is always hot in memory for that specific tenant. (<10ms queries). | Network serialization: DOs communicate via RPC. Passing large graphs between DOs is slow. | **Partial Pass.** Great for *small* isolated graphs, awful for large global analytics. |
| **CRDT-based Sync (like Triplit)** | "Magic" offline editing and conflict resolution. | Massively complects the database core with network reconciliation logic and vector clocks. | **Reject.** Keep the database pure. Build sync as a *separate* system outside the query engine. |
| **WASM Embedding (like CozoDB)** | Write once in Rust, run anywhere. | Black-box memory management inside V8. Hard to debug. Doesn't utilize the isolate's native GC. | **Reject.** Compiling immutable functional code (Gleam) to JS works *with* the V8 GC, not against it. |

## 4. Trade-offs

### AaronDB Edge Pros:
- **Simplicity of deployment:** Pure JS means it deploys to Cloudflare Workers instantaneously without WASM tooling.
- **Expressiveness:** Full Datalog graph recursion running <50ms away from the user.
- **Micro-Sovereignty:** Using Durable Objects, every user/tenant gets their own isolated, hot-in-memory database actor.

### AaronDB Edge Cons:
- **Graph Size Limits:** V8 isolates have a 128MB memory limit. We cannot run large-scale analytics at the edge. It is strictly for small, active local graphs.
- **No Shared Memory:** We lose ETS. Indices must be rebuilt or maintained in standard JS `Map` objects.

## 5. Actionable Recommendation

**Proceed with a "Micro-Sovereign" Edge Engine.**

For a comprehensive weighted analysis against 6 industry competitors (Turso, XTDB, DataScript, etc.), see the [Rich Hickey Gap Analysis](file:///Users/brixelectronics/.gemini/antigravity/brain/0a1aa163-72a0-4ef7-a8bf-2aec9a5ac2e3/rich_hickey_gap_analysis.md).

**Action Plan:**
1. **The Honi.dev + Gleam Combo:** Align AaronDB Edge as the knowledge substrate for **Honi.dev** agents. Honi.dev handles the agentic orchestration (Durable Objects, D1, streaming), while the pure-JS compiled Gleam core provides the deductive Datalog logic.
2. **Do not build a CRDT sync engine.** This complects state with networking. Instead, build the Pure Datalog Engine.
3. **Target Micro-Tenancy.** Scope the edge engine specifically for small graphs (e.g., a single user's knowledge graph, a single document's AST, a single chat session). This avoids the 128MB V8 isolate limit and fits the Honi.dev agent model perfectly.
4. **Isolate the Core.** Extract `aarondb/algo` and `aarondb/shared` into a pure, FFI-free library that compiles flawlessly to JS. Use native JS `Map` for Silicon Saturation instead of ETS.

*Rich Hickey would approve: We are taking the pure, immutable logic of Datalog and placing it exactly where the data is needed, without complecting it with heavy runtime environments or magical network sync protocols.*
