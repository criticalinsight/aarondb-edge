# AaronDB Edge Architecture

AaronDB Edge is a "Memory-First" Transactional Datalog Engine designed for
high-performance agentic orchestration at the network edge.

## The Sovereign Stack

### 1. Durable Object "Brain"

The engine is hosted inside a **Cloudflare Durable Object** (`AaronDBState`).

- **Locality**: Computation and state live in the same process.
- **In-Memory Datalog**: The engine maintains a full EAVT index as an immutable
  data structure, allowing complex Datalog joins without network I/O.

### 2. Hybrid Persistence

- **D1 (Log Layer)**: Transactions are logged to a Cloudflare D1 SQLite
  database for rehydration and durability.
- **R2 (Archive Layer)**: Snapshots of the database state are archived to R2
  blobs for long-term recovery.

### 3. Native AI Orchestration

- **Vectorize**: Integrated with Cloudflare Vectorize for global semantic
  indexing.
- **Workers AI**: Direct access to local LLMs (e.g., Llama-3) for reasoning
  over the Datalog-retrieved context.
- **Auto-Embedding**: Asynchronous background tasks generate vector
  embeddings for new text facts.

## Engineering Principles

- **Immutability**: The core engine logic is written in Gleam and compiled
  to JS, preserving functional purity and deterministic state transitions.
- **De-complecting**: Storage is de-coupled from the execution engine,
  allowing the engine to run purely in memory while the log persists elsewhere.
