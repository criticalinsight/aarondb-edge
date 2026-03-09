import aarondb_edge/engine
import aarondb_edge/fact
import aarondb_edge/index
import aarondb_edge/q
import aarondb_edge/shared/state
import gleam/dict
import gleeunit/should

pub fn engine_test() {
  let db = state.new_state()
  
  // Assert a fact
  let datom = fact.new_datom(
    entity: fact.ref(1),
    attribute: "name",
    value: fact.Str("Aaron"),
    tx: 1,
    tx_index: 0,
    operation: fact.Assert,
  )
  
  let db = state.DbState(
    ..db,
    eavt: index.insert_eavt(db.eavt, datom, fact.All),
    aevt: index.insert_aevt(db.aevt, datom, fact.All),
  )
  
  // Query
  let query = q.new()
    |> q.where(q.v("e"), "name", q.s("Aaron"))
    |> q.to_query()
  
  let result = engine.run(db, query)
  
  // Verify
  result.rows
  |> should.equal([
    {
      let ctx = dict.new()
      dict.insert(ctx, "e", fact.Ref(fact.ref(1)))
    }
  ])
}
