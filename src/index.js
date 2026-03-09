import { run } from "../build/dev/javascript/aarondb_edge/aarondb_edge/engine.mjs";
import { new_state } from "../build/dev/javascript/aarondb_edge/aarondb_edge/shared/state.mjs";
import { where, to_query, v, s, new$ as newQuery, as_of } from "../build/dev/javascript/aarondb_edge/aarondb_edge/q.mjs";
import { ref, Str, Int, Float, Bool, Assert, Retract, All, new_datom, cosine_similarity } from "../build/dev/javascript/aarondb_edge/aarondb_edge/fact.mjs";
import { insert_eavt, insert_aevt } from "../build/dev/javascript/aarondb_edge/aarondb_edge/index.mjs";
import { transact, TxOp } from "../build/dev/javascript/aarondb_edge/aarondb_edge/transaction.mjs";
import { toList } from "../build/dev/javascript/aarondb_edge/gleam.mjs";
import * as $dict from "../build/dev/javascript/gleam_stdlib/gleam/dict.mjs";
import * as $ast from "../build/dev/javascript/aarondb_edge/aarondb_edge/shared/ast.mjs";

/**
 * Rich Hickey: "The database is a value."
 * AaronDB Class provides a pure functional interface to the underlying Gleam engine.
 */
export class AaronDB {
    constructor(initialState = null) {
        this.db = initialState || new_state();
    }

    /**
     * Helper to wrap JS values into Gleam Value types.
     */
    wrapValue(v) {
        if (typeof v === 'string') return new Str(v);
        if (typeof v === 'number') {
            if (Number.isInteger(v)) return new Int(v);
            return new Float(v);
        }
        if (typeof v === 'boolean') return new Bool(v);
        return v; // Assume already wrapped or complex
    }

    /**
     * Transact a list of operations.
     * @param {Array} ops - List of {e, a, v, op} objects.
     * @returns {number} The transaction ID.
     */
    transact(ops) {
        const txOpsArray = ops.map(o => {
            const operation = o.op === 'retract' ? new Retract() : new Assert();
            const entity = typeof o.e === 'number' ? ref(o.e) : o.e;
            const val = this.wrapValue(o.v);
            return new TxOp(entity, o.a, val, operation);
        });

        const txOps = toList(txOpsArray);
        const [newState, txId] = transact(this.db, txOps);
        this.db = newState;
        return txId;
    }

    /**
     * Helper to unwrap Gleam types into JS primitives.
     */
    unwrapValue(v) {
        if (v instanceof Str || v instanceof Int || v instanceof Float || v instanceof Bool) {
            return v[0];
        }
        // EntityId/Ref wrapping
        if (v && typeof v === 'object' && v[0] !== undefined && !v.toArray) {
            // Check if it's likely a Gleam CustomType wrapping a single value
            return v[0];
        }
        return v;
    }

    /**
     * Run a Datalog query.
     * @param {Object} queryBody - The query AST or builder.
     * @returns {Array} Results.
     */
    query(queryBody) {
        let q = queryBody;
        if (queryBody.where && !queryBody.clauses) {
            // Basic builder support
            let builder = newQuery();
            queryBody.where.forEach(clause => {
                const [e, a, val] = clause;

                // Map Entity
                let mappedE;
                if (typeof e === 'string' && e.startsWith('?')) mappedE = v(e.substring(1));
                else if (e.constructor.name === 'EntityId') mappedE = new $ast.Uid(e); // Assuming Val is the correct wrapper for EntityId in AST
                else if (typeof e === 'string') mappedE = new $ast.Uid(ref(e)); // Assuming Val is the correct wrapper for Ref in AST
                else mappedE = e;

                // Map Attribute
                let mappedA;
                if (typeof a === 'string' && a.startsWith('?')) mappedA = v(a.substring(1));
                else mappedA = a;

                // Map Value
                let mappedV;
                if (typeof val === 'string' && val.startsWith('?')) mappedV = v(val.substring(1));
                else if (val instanceof Str || val instanceof Int || val instanceof Float || val instanceof Bool) mappedV = new $ast.Val(val);
                else mappedV = new $ast.Val(this.wrapValue(val));

                builder = where(builder, mappedE, mappedA, mappedV);
            });
            q = to_query(builder);
        }

        const result = run(this.db, q);

        // Unwrap QueryResult.rows (Gleam List of Dicts)
        const rows = result.rows.toArray();
        return rows.map(dict => {
            const obj = {};
            // Convert Gleam Dict to Gleam List of [key, val] pairs, then to JS array
            const entries = $dict.to_list(dict).toArray();
            entries.forEach(pair => {
                const key = pair[0];
                const val = pair[1];
                obj[key] = this.unwrapValue(val);
            });
            return obj;
        });
    }

    /**
     * Export the current state as a value.
     */
    asValue() {
        return this.db;
    }

    static fromValue(value) {
        return new AaronDB(value);
    }
}

// Export raw primitives for advanced usage
export {
    run,
    new_state,
    where,
    to_query,
    v,
    s,
    newQuery,
    as_of,
    ref,
    Str,
    Int,
    Float,
    Bool,
    Assert,
    Retract,
    All,
    new_datom,
    cosine_similarity,
    insert_eavt,
    insert_aevt,
    transact,
    TxOp
};
