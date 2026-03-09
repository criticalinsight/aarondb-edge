# Edge-Native AaronDB: A Cloudflare Workers Scope

> "Simplicity is not about making things easy. It is about untangling complexity." — Rich Hickey

## 1. The Essential vs. The Incidental
AaronDB is currently built on the Erlang VM (BEAM). Its power derives from two distinct sources:
- **Essential Complexity**: Datalog rule evaluation, fact representation (Entity, Attribute, Value), and semi-naive evaluation algorithms spanning multi-way joins.
- **Incidental Complexity (Host)**: ETS for lock-free O(1) indices (Silicon Saturation), Mnesia/SQLite for storage, and OTP Actors for query suspension and distributed computing.

To run on Cloudflare Workers (compiling Gleam to JavaScript), we must strip away the BEAM-specific incidentals. JavaScript isolates provide no shared memory, no built-in ETS, and no OTP. Thus, we must re-architect the host bindings while preserving the essential Datalog soul.

## 2. Cloudflare Primitives as Replacements
The edge architecture demands different trade-offs:

| BEAM Primitive | Cloudflare Equivalent | Implication |
| -------------- | --------------------- | ----------- |
| ETS (Indices) | Native JS `Map`/`Set` | The isolate is single-threaded. We don't need ETS for concurrency *within* a request, but we lose it across requests. |
| Mnesia/SQLite | Cloudflare D1 (SQLite) | D1 represents the durable log. Queries must be resolved over edge-cached data or materialized into D1. |
| OTP Actors | Durable Objects (DO) | A Durable Object represents a location-bound Actor with its own memory and transactional storage API. |

## 3. The Edge Actor Model (Durable Objects)
To emulate AaronDB's Sovereign Fabric on the edge, we compose it using Durable Objects:

- **The Database DO**: Acts as the authoritative source of truth for a specific logical shard or tenant. It holds the latest indices in its RAM (isolate memory).
- **The Query DO**: Ephemeral workers that spawn, load facts from the Database DO, and execute the pure Datalog evaluation. 

## 4. Trade-offs: Is it worth the utility?
### Why we should do this:
- **Global Latency**: Moving query processing to the edge puts Datalog evaluation <50ms from users.
- **Micro-tenancy**: Spinning up a zero-cost AaronDB instance per user/tenant via Durable Objects.

### Why this might be a mistake (The Hickey Test):
- **Serialization Overhead**: Passing massive datasets (Facts) between Cloudflare Workers or DOs over HTTP is fundamentally complecting computation and network topology.
- **Memory Limits**: Cloudflare isolates cap at 128MB. Silicon Saturation requires RAM. Large datasets *will* crash the isolate. Emulating chunked out-of-core sorts in JS is complex and antithetical to the goal.

## 5. Proposed Approach
If we proceed, we do so by constraining the scope:

1. **Lightweight Embedding**: AaronDB becomes an in-memory query engine for small,
   tenant-specific datasets synced from Cloudflare D1 or KV.
2. **Pure Gleam Core**: Isolate `src/aarondb/algo` and `src/aarondb/shared` from
   FFI. Use JS FFI for `Map`/`Set` to ensure V8 compatibility.
3. **Honi Integration**: AaronDB Edge serves as the "Sovereign Knowledge Engine"
   for **Honi (honi.dev)** agents. Honi handles orchestration, while AaronDB
   provides deep Datalog reasoning.
4. **Write-Optimized Sync**: Mutations push to D1, which then fan-outs to Worker
   caches or Honi-maintained Durable Objects.

## 6. The Honi-Datalog Hybrid Pattern
The optimal way to utilize Honi with AaronDB Edge is to de-complect **Agentic Orchestration** from **Knowledge Reasoning**:

- **Orchestration (Honi)**: Handle the ephemeral, non-deterministic LLM loops, streaming responses, and HTTP routing.
- **Working Memory (Durable Objects)**: Use a Honi-managed Durable Object to hold the AaronDB in-memory index. This avoids Cloudflare's SQL "Row Read" limits per query.
- **Durable History (D1/R2)**: The DO periodically flushes immutable facts to D1. New DO instances "rehydrate" by scanning the D1 log once, then serving all subsequent queries from RAM.
- **Reasoning (AaronDB Edge)**: Use the Pure Gleam Datalog engine to perform
  complex joins over the "Working Memory" within the DO.
- **Agentic RAG**: Perform semantic lookups via `cosine_similarity` FFI, then
  use Datalog to filter candidates by logical providence.
- **Workers AI**: Generate embeddings (`bge-small-en-v1.5`) and run local LLM
  inference (`llama-3-8b`) directly at the edge.
- **Vectorize**: Use as a global "Long-Term Memory" index when an agent's
  knowledge base exceeds Durable Object RAM.

This pattern transforms the Agent from a "stateless prompt-wrapper" into a
"stateful reasoning entity" with a sovereign memory that scales.

## 7. The Unified Sovereign Stack
To achieve Silicon Saturation at the edge, we compose these primitives into a single de-complected flow:

| Primitive | Role | Why? |
| :--- | :--- | :--- |
| **Honi** | Orchestrator | The deterministic entry point for LLM loops and HTTP routing. |
| **Durable Object** | The Brain | Holds the AaronDB Datalog index in RAM for O(1) Reasoning. |
| **D1 (SQL)** | The Fact Log | An immutable append-only store for facts that need SQL analytics. |
| **R2 (S3)** | The Archive | For large blobs and cold facts too heavy for RAM/SQL. |
| **KV** | Global Map | Mapping user-friendly names to specific Agent IDs across the edge. |

### The Data Flow
1. **Ingest**: Honi receives a fact from a user.
2. **Commit**: Honi calls the Agent's **Durable Object**. 
3. **Logic**: The DO asserts the fact into the **AaronDB Datalog** engine in RAM.
4. **Persist**: The DO asynchronously pushes the fact to **D1** for long-term storage.
5. **Reason**: The engine joins the local memory to answer queries in <5ms.

This stack ensures that our "Knowledge" is **alive** in memory (DO) but **durable** in the log (D1).
