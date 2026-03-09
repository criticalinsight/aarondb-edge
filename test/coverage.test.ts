import { expect, test, describe } from "bun:test";
// @ts-ignore
import * as Engine from "../build/dev/javascript/aarondb_edge/aarondb_edge/engine.mjs";
// @ts-ignore
import * as Fact from "../build/dev/javascript/aarondb_edge/aarondb_edge/fact.mjs";
// @ts-ignore
import * as Index from "../build/dev/javascript/aarondb_edge/aarondb_edge/index.mjs";
// @ts-ignore
import * as Q from "../build/dev/javascript/aarondb_edge/aarondb_edge/q.mjs";
// @ts-ignore
import * as State from "../build/dev/javascript/aarondb_edge/aarondb_edge/shared/state.mjs";
// @ts-ignore
import * as Ast from "../build/dev/javascript/aarondb_edge/aarondb_edge/shared/ast.mjs";
// @ts-ignore
import * as Dict from "../build/dev/javascript/gleam_stdlib/gleam/dict.mjs";
// @ts-ignore
import * as List from "../build/dev/javascript/gleam_stdlib/gleam/list.mjs";
// @ts-ignore
import { toList, Ok } from "../build/dev/javascript/aarondb_edge/gleam.mjs";
// @ts-ignore
import { Some, None } from "../build/dev/javascript/gleam_stdlib/gleam/option.mjs";

function makeDb() {
    return State.new_state();
}

function insertDatom(db: any, e: number, a: string, v: any) {
    const f = Fact.new_datom(Fact.ref(e), a, v, 1, 0, Fact.Operation$Assert());
    db.eavt = Index.insert_eavt(db.eavt, f, Fact.Retention$All());
    db.aevt = Index.insert_aevt(db.aevt, f, Fact.Retention$All());
    return db;
}

describe("AaronDB Engine Coverage", () => {
    test("Datalog: Simple Fact Retrieval", () => {
        let db = State.new_state();

        const datom = Fact.new_datom(
            Fact.ref(1),
            "name",
            new Fact.Str("Aaron"),
            1,
            0,
            Fact.Operation$Assert()
        );

        db.eavt = Index.insert_eavt(db.eavt, datom, Fact.Retention$All());
        db.aevt = Index.insert_aevt(db.aevt, datom, Fact.Retention$All());

        let queryBuilder = Q.new$();
        queryBuilder = Q.where(queryBuilder, Q.v("e"), "name", Q.s("Aaron"));
        const builtQuery = Q.to_query(queryBuilder);

        const result = Engine.run(db, builtQuery);

        const rows = result.rows.toArray();
        expect(rows[0]).toBeDefined();
        const row = rows[0];
        const res = Dict.get(row, "e");
        expect(res instanceof Ok).toBe(true);
        const eBinding = res[0];
        // EntityId class check
        expect(eBinding[0][0]).toEqual(1);
    });

    test("Datalog: Multi-clause Join", () => {
        let db = State.new_state();

        const f1 = Fact.new_datom(Fact.ref(1), "name", new Fact.Str("Aaron"), 1, 0, Fact.Operation$Assert());
        const f2 = Fact.new_datom(Fact.ref(1), "friend", new Fact.Ref(Fact.ref(2)), 1, 1, Fact.Operation$Assert());
        const f3 = Fact.new_datom(Fact.ref(2), "name", new Fact.Str("Alice"), 1, 2, Fact.Operation$Assert());

        [f1, f2, f3].forEach(f => {
            db.eavt = Index.insert_eavt(db.eavt, f, Fact.Retention$All());
            db.aevt = Index.insert_aevt(db.aevt, f, Fact.Retention$All());
        });

        let query = Q.new$();
        query = Q.where(query, Q.v("me"), "name", Q.s("Aaron"));
        query = Q.where(query, Q.v("me"), "friend", Q.v("f"));
        query = Q.where(query, Q.v("f"), "name", Q.v("fname"));

        const result = Engine.run(db, Q.to_query(query));

        const rows = result.rows.toArray();
        expect(rows[0]).toBeDefined();
        const row = rows[0];
        const res = Dict.get(row, "fname");
        expect(res[0][0]).toEqual("Alice");
    });

    test("Datalog: Negation", () => {
        let db = State.new_state();

        const f1 = Fact.new_datom(Fact.ref(1), "name", new Fact.Str("Aaron"), 1, 0, Fact.Operation$Assert());
        db.eavt = Index.insert_eavt(db.eavt, f1, Fact.Retention$All());
        db.aevt = Index.insert_aevt(db.aevt, f1, Fact.Retention$All());

        let query = Q.new$();
        query = Q.where(query, Q.v("e"), "name", Q.s("Aaron"));
        query = Q.negate(query, Q.v("e"), "admin", new Fact.Bool(true));

        const result = Engine.run(db, Q.to_query(query));
        const rows = result.rows.toArray();
        expect(rows[0]).toBeDefined();

        const f2 = Fact.new_datom(Fact.ref(1), "admin", new Fact.Bool(true), 1, 1, Fact.Operation$Assert());
        db.eavt = Index.insert_eavt(db.eavt, f2, Fact.Retention$All());
        db.aevt = Index.insert_aevt(db.aevt, f2, Fact.Retention$All());

        const result2 = Engine.run(db, Q.to_query(query));
        expect(result2.rows.toArray()[0]).toBeUndefined();
    });

    test("Datalog: Filter (Manual AST)", () => {
        let db = State.new_state();

        const f1 = Fact.new_datom(Fact.ref(1), "age", new Fact.Int(25), 1, 0, Fact.Operation$Assert());
        const f2 = Fact.new_datom(Fact.ref(2), "age", new Fact.Int(35), 1, 1, Fact.Operation$Assert());

        [f1, f2].forEach(f => {
            db.eavt = Index.insert_eavt(db.eavt, f, Fact.Retention$All());
            db.aevt = Index.insert_aevt(db.aevt, f, Fact.Retention$All());
        });

        let builder = Q.new$();
        builder = Q.where(builder, Q.v("e"), "age", Q.v("a"));

        // Use factories instead of classes to avoid "not a constructor" issues with compiled Gleam
        const filterClause = Ast.BodyClause$Filter(
            new Ast.Gt(new Ast.Var("a"), new Ast.Val(new Fact.Int(30)))
        );
        builder.clauses = List.append(builder.clauses, toList([filterClause]));

        const result = Engine.run(db, Q.to_query(builder));
        const rows = result.rows.toArray();
        expect(rows[0]).toBeDefined();
        const row = rows[0];
        const eRes = Dict.get(row, "e");
        expect(eRes[0][0][0]).toEqual(2);
    });

    test("Datalog: Ordering and Limits", () => {
        let db = State.new_state();

        const p1 = Fact.new_datom(Fact.ref(1), "score", new Fact.Int(50), 1, 0, Fact.Operation$Assert());
        const p2 = Fact.new_datom(Fact.ref(2), "score", new Fact.Int(100), 1, 1, Fact.Operation$Assert());
        const p3 = Fact.new_datom(Fact.ref(3), "score", new Fact.Int(75), 1, 2, Fact.Operation$Assert());

        [p1, p2, p3].forEach(f => {
            db.eavt = Index.insert_eavt(db.eavt, f, Fact.Retention$All());
            db.aevt = Index.insert_aevt(db.aevt, f, Fact.Retention$All());
        });

        let query = Q.new$();
        query = Q.where(query, Q.v("e"), "score", Q.v("s"));
        query = Q.order_by(query, "s", Ast.OrderDirection$Desc());
        query = Q.limit(query, 2);

        const result = Engine.run(db, Q.to_query(query));
        const rows = result.rows.toArray();
        expect(rows.length).toBe(2);

        expect(Dict.get(rows[0], "s")[0][0]).toEqual(100);
        expect(Dict.get(rows[1], "s")[0][0]).toEqual(75);
    });

    test("Serialization: Fact Encoding/Decoding", () => {
        const datom = Fact.new_datom(
            Fact.ref(42),
            "test",
            new Fact.Str("hello"),
            100,
            7,
            Fact.Operation$Assert()
        );

        const encoded = Fact.encode_datom(datom);
        const decodedResult = Fact.decode_datom(encoded);

        expect(decodedResult instanceof Ok).toBe(true);
        const [decodedDatom, _] = decodedResult[0];

        expect(decodedDatom.attribute).toEqual("test");
        expect(decodedDatom.value[0]).toEqual("hello");
        expect(decodedDatom.tx).toEqual(100);
        expect(decodedDatom.tx_index).toEqual(7);
        expect(decodedDatom.entity[0]).toEqual(42);
    });

    test("FFI: Semantic Search Utilities", () => {
        const v1 = toList([1.0, 0.0, 0.0]);
        const v2 = toList([0.8, 0.6, 0.0]);
        const sim = Fact.cosine_similarity(v1, v2);
        expect(sim).toBeGreaterThan(0.7);
        expect(sim).toBeLessThan(0.9);
    });

    test("Datalog: Predicates and Boolean Logic", () => {
        let db = State.new_state();
        const f1 = Fact.new_datom(Fact.ref(1), "age", new Fact.Int(20), 1, 0, Fact.Operation$Assert());
        const f2 = Fact.new_datom(Fact.ref(2), "age", new Fact.Int(30), 1, 1, Fact.Operation$Assert());
        [f1, f2].forEach(f => {
            db.eavt = Index.insert_eavt(db.eavt, f, Fact.Retention$All());
            db.aevt = Index.insert_aevt(db.aevt, f, Fact.Retention$All());
        });

        // Lt and And
        let q = Q.new$();
        q = Q.where(q, Q.v("e"), "age", Q.v("a"));
        const ltFilter = Ast.BodyClause$Filter(
            new Ast.And(
                new Ast.Lt(new Ast.Var("a"), new Ast.Val(new Fact.Int(25))),
                new Ast.Eq(new Ast.Var("a"), new Ast.Val(new Fact.Int(20)))
            )
        );
        q.clauses = List.append(q.clauses, toList([ltFilter]));
        let rows = Engine.run(db, Q.to_query(q)).rows.toArray();
        expect(rows.length).toBe(1);
        expect(Dict.get(rows[0], "a")[0][0]).toEqual(20);

        // Or and Neq
        let q2 = Q.new$();
        q2 = Q.where(q2, Q.v("e"), "age", Q.v("a"));
        const orFilter = Ast.BodyClause$Filter(
            new Ast.Or(
                new Ast.Neq(new Ast.Var("a"), new Fact.Int(20)),
                new Ast.Eq(new Ast.Var("a"), new Fact.Int(20))
            )
        );
        // Note: Neq/Or construction might need adjustment based on factory vs class
        // Let's use factory if strictly needed, but Neq/Or are exported as classes too.
    });

    test("Datalog: Offset and Ascending Order", () => {
        let db = State.new_state();
        const p1 = Fact.new_datom(Fact.ref(1), "x", new Fact.Int(1), 1, 0, Fact.Operation$Assert());
        const p2 = Fact.new_datom(Fact.ref(2), "x", new Fact.Int(2), 1, 1, Fact.Operation$Assert());
        const p3 = Fact.new_datom(Fact.ref(3), "x", new Fact.Int(3), 1, 2, Fact.Operation$Assert());
        [p1, p2, p3].forEach(f => {
            db.eavt = Index.insert_eavt(db.eavt, f, Fact.Retention$All());
            db.aevt = Index.insert_aevt(db.aevt, f, Fact.Retention$All());
        });

        let q = Q.new$();
        q = Q.where(q, Q.v("e"), "x", Q.v("val"));
        q = Q.order_by(q, "val", Ast.OrderDirection$Asc());
        q = Q.offset(q, 1);
        q = Q.limit(q, 1);

        let rows = Engine.run(db, Q.to_query(q)).rows.toArray();
        expect(rows.length).toBe(1);
        expect(Dict.get(rows[0], "val")[0][0]).toEqual(2);
    });

    test("Datalog: Engine Edge Cases", () => {
        let db = State.new_state();
        // Bind with non-variable (should hit line 106 in engine.gleam)
        let q = Q.new$();
        const bindNonVar = Ast.BodyClause$Bind(new Ast.Val(new Fact.Int(10)), new Ast.Val(new Fact.Int(20)));
        q.clauses = List.append(q.clauses, toList([bindNonVar]));
        let result = Engine.run(db, Q.to_query(q));
        expect(result.rows.toArray().length).toBe(1);

        // Negative with no results (hit line 92 in engine.gleam)
        let q2 = Q.new$();
        q2 = Q.where(q2, Q.v("x"), "nonexistent", Q.v("y"));
        // This is just a normal query that returns 0 rows. 
        // A negation of something that doesn't exist should return original context.
        let q3 = Q.new$();
        q3 = Q.negate(q3, Q.v("x"), "nonexistent", Q.v("y"));
        let res3 = Engine.run(db, Q.to_query(q3));
        expect(res3.rows.toArray().length).toBe(1); // empty context returned

        // resolve_part default case
        // Query with an unknown part type
    });

    test("Datalog: Embedded Clause Types", () => {
        let db = State.new_state();
        const d1 = Fact.new_datom(Fact.ref(1), "val", new Fact.Int(100), 1, 0, Fact.Operation$Assert());
        const d2 = Fact.new_datom(Fact.ref(2), "val", new Fact.Int(50), 1, 1, Fact.Operation$Assert());
        [d1, d2].forEach(f => {
            db.eavt = Index.insert_eavt(db.eavt, f, Fact.Retention$All());
            db.aevt = Index.insert_aevt(db.aevt, f, Fact.Retention$All());
        });

        // OrderBy inside the body
        let q = Q.new$();
        q = Q.where(q, Q.v("e"), "val", Q.v("v"));
        const orderClause = Ast.BodyClause$OrderByClause("v", Ast.OrderDirection$Asc());
        q.clauses = List.append(q.clauses, toList([orderClause]));

        let rows = Engine.run(db, Q.to_query(q)).rows.toArray();
        expect(rows.length).toBe(2);
        expect(Dict.get(rows[0], "v")[0][0]).toEqual(50);
        expect(Dict.get(rows[1], "v")[0][0]).toEqual(100);

        // Limit inside the body
        let q2 = Q.new$();
        q2 = Q.where(q2, Q.v("e"), "val", Q.v("v"));
        const limitClause = Ast.BodyClause$LimitClause(1);
        q2.clauses = List.append(q2.clauses, toList([limitClause]));
        let res2 = Engine.run(db, Q.to_query(q2)).rows.toArray();
        expect(res2.length).toBe(1);
    });

    test("Serialization: Exhaustive Value Types", () => {
        const values = [
            new Fact.Str("test"),
            new Fact.Int(123),
            new Fact.Bool(true),
            new Fact.Bool(false),
            new Fact.Ref(Fact.ref(456)),
            new Fact.Float(3.14),
            new Fact.Str("550e8400-e29b-41d4-a716-446655440000"),
            new Fact.Blob(new Uint8Array([1, 2, 3])),
            new Fact.Str("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")
        ];

        values.forEach(v => {
            const encoded = Fact.encode_compact(v);
            const decoded = Fact.decode_compact(encoded);
            if (v instanceof Fact.Blob) {
                // Compare raw buffers for BitArrays
                expect(decoded[0][0][0].rawBuffer).toEqual(v[0]);
            } else {
                expect(decoded[0][0]).toEqual(v);
            }
        });
    });

    test("Datalog: Descending Order and Offset", () => {
        let db = makeDb();
        db = insertDatom(db, 1, "age", new Fact.Int(30));
        db = insertDatom(db, 2, "age", new Fact.Int(25));
        db = insertDatom(db, 3, "age", new Fact.Int(40));

        let q = Q.new$();
        q = Q.where(q, Q.v("e"), "age", Q.v("v"));
        let q3 = Q.order_by(q, "v", Ast.OrderDirection$Desc());
        q3 = Q.limit(q3, 2);
        q3 = Q.offset(q3, 1);

        const result = Engine.run(db, Q.to_query(q3));
        const rows = result.rows.toArray();
        expect(rows.length).toBe(2);
        // Desc: 40, 30, 25. Offset 1 -> 30, 25.
        expect(Dict.get(rows[0], "v")[0]).toEqual(new Fact.Int(30));
        expect(Dict.get(rows[1], "v")[0]).toEqual(new Fact.Int(25));
    });

    test("Datalog: Predicates Or, Neq, Gt edge cases", () => {
        let db = makeDb();
        db = insertDatom(db, 1, "score", new Fact.Int(10));
        db = insertDatom(db, 2, "score", new Fact.Int(20));

        let q = Q.new$();
        q = Q.where(q, Q.v("e"), "score", Q.v("s"));

        // Or(Eq(s, 10), Neq(s, 20))
        const p_or = Ast.BodyClause$Filter(
            Ast.Expression$Or(
                Ast.Expression$Eq(new Ast.Var("s"), Ast.Part$Val(new Fact.Int(10))),
                Ast.Expression$Neq(new Ast.Var("s"), Ast.Part$Val(new Fact.Int(20)))
            )
        );

        q.clauses = List.append(q.clauses, toList([p_or]));

        const result = Engine.run(db, Q.to_query(q));
        const rows = result.rows.toArray();
        console.log("Rows OR:", rows);
        expect(rows.length).toBe(1);
        expect(Dict.get(rows[0], "s")[0]).toEqual(new Fact.Int(10));
    });

    test("Datalog: Engine Uid and Bind edge cases", () => {
        let db = makeDb();
        db = insertDatom(db, 100, "name", new Fact.Str("Alice"));
        let q = Q.new$();
        // Positive with Uid and Val to test non-variable e_val and v_val
        const b1 = Ast.BodyClause$Positive([
            new Ast.Uid(Fact.EntityId$EntityId(100)),
            "name",
            Ast.Part$Val(new Fact.Str("Alice"))
        ]);
        // Bind with Var
        const b2 = Ast.BodyClause$Bind(new Ast.Var("x"), Ast.Part$Val(new Fact.Int(5)));

        q.clauses = List.append(q.clauses, toList([b1, b2]));
        const result = Engine.run(db, Q.to_query(q));
        const rows = result.rows.toArray();
        console.log("Rows UID:", rows);
        expect(rows.length).toBe(1);
        expect(Dict.get(rows[0], "x")[0]).toEqual(new Fact.Int(5));
    });
});
