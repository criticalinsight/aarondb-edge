// import aarondb_edge/algo/cracking
import aarondb_edge/fact
import aarondb_edge/index
import aarondb_edge/shared/ast
import aarondb_edge/shared/query_types
import aarondb_edge/shared/state
import aarondb_edge/storage/internal
import gleam/dict.{type Dict}
// import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/order
import gleam/result

pub fn run(
  db_state: state.DbState,
  query: ast.Query,
) -> query_types.QueryResult {
  let initial_context = [dict.new()]
  let planned_clauses = query.where

  let #(rows, store) =
    list.fold(planned_clauses, #(initial_context, None), fn(acc, clause) {
      let #(contexts, current_store) = acc
      case clause {
        ast.LimitClause(n) -> #(list.take(contexts, n), current_store)
        ast.OffsetClause(n) -> #(list.drop(contexts, n), current_store)
        ast.OrderByClause(var, dir) -> {
          let sorted =
            list.sort(contexts, fn(a, b) {
              let val_a = dict.get(a, var) |> result.unwrap(fact.Int(0))
              let val_b = dict.get(b, var) |> result.unwrap(fact.Int(0))
              let ord = fact.compare(val_a, val_b)
              case dir {
                ast.Asc -> ord
                ast.Desc ->
                  case ord {
                    order.Lt -> order.Gt
                    order.Gt -> order.Lt
                    order.Eq -> order.Eq
                  }
              }
            })
          #(sorted, current_store)
        }
        _ -> {
          let #(next_contexts, next_store) =
            list.fold(contexts, #([], current_store), fn(inner_acc, ctx) {
              let #(acc_ctxs, acc_store) = inner_acc
              let #(new_ctxs, clause_store) =
                solve_clause(db_state, clause, ctx)
              #(
                list.append(acc_ctxs, new_ctxs),
                merge_optional_stores(acc_store, clause_store),
              )
            })
          #(next_contexts, next_store)
        }
      }
    })

  query_types.QueryResult(
    rows: rows |> list.unique(),
    metadata: query_types.QueryMetadata(
      tx_id: None,
      valid_time: None,
      execution_time_ms: 0,
      index_hits: 0,
      plan: "",
      shard_id: None,
      aggregates: dict.new(),
    ),
    updated_columnar_store: store,
  )
}

fn solve_clause(
  db_state: state.DbState,
  clause: ast.BodyClause,
  ctx: Dict(String, fact.Value),
) -> #(
  List(Dict(String, fact.Value)),
  Option(Dict(String, List(internal.StorageChunk))),
) {
  case clause {
    ast.Positive(triple) -> {
      solve_positive(db_state, triple, ctx)
    }
    ast.Negative(triple) -> {
      let #(results, store) = solve_positive(db_state, triple, ctx)
      case results {
        [] -> #([ctx], store)
        _ -> #([], store)
      }
    }
    ast.Filter(expr) -> {
      let pred = compile_predicate(expr)
      case pred(ctx) {
        True -> #([ctx], None)
        False -> #([], None)
      }
    }
    ast.Bind(var_p, val_p) -> {
      let var_name = case var_p {
        ast.Var(n) -> n
        _ -> ""
      }
      let val = resolve_part(val_p, ctx) |> option.unwrap(fact.Int(0))
      #([dict.insert(ctx, var_name, val)], None)
    }
    _ -> #([ctx], None)
  }
}

fn solve_positive(
  db_state: state.DbState,
  triple: ast.Clause,
  ctx: Dict(String, fact.Value),
) -> #(
  List(Dict(String, fact.Value)),
  Option(Dict(String, List(internal.StorageChunk))),
) {
  let #(e_p, attr, v_p) = triple
  let e_val = resolve_part(e_p, ctx)
  let v_val = resolve_part(v_p, ctx)

  // Simplified: Only check memory indices
  let datoms = case e_val, v_val {
    Some(fact.Ref(eid)), Some(v) ->
      index.get_datoms_by_entity_attr_val(db_state.eavt, eid, attr, v)
    Some(fact.Ref(eid)), None ->
      index.get_datoms_by_entity_attr(db_state.eavt, eid, attr)
    None, Some(v) -> index.get_datoms_by_val(db_state.aevt, attr, v)
    None, None -> index.get_all_datoms_for_attr(db_state.eavt, attr)
    _, _ -> []
  }

  let results =
    list.flat_map(datoms, fn(d) {
      let next_ctx = case e_p {
        ast.Var(name) -> dict.insert(ctx, name, fact.Ref(d.entity))
        _ -> ctx
      }
      let next_ctx = case v_p {
        ast.Var(name) -> dict.insert(next_ctx, name, d.value)
        _ -> next_ctx
      }
      [next_ctx]
    })

  #(results, None)
}

fn resolve_part(part: ast.Part, ctx: Dict(String, fact.Value)) -> Option(fact.Value) {
  case part {
    ast.Var(name) -> dict.get(ctx, name) |> option.from_result
    ast.Val(v) -> Some(v)
    ast.Uid(eid) -> Some(fact.Ref(eid))
    _ -> None
  }
}

fn compile_predicate(expr: ast.Expression) -> fn(Dict(String, fact.Value)) -> Bool {
  fn(ctx) {
    case expr {
      ast.Eq(p1, p2) -> resolve_part(p1, ctx) == resolve_part(p2, ctx)
      ast.Neq(p1, p2) -> resolve_part(p1, ctx) != resolve_part(p2, ctx)
      ast.Gt(p1, p2) -> {
        case resolve_part(p1, ctx), resolve_part(p2, ctx) {
          Some(v1), Some(v2) -> fact.compare(v1, v2) == order.Gt
          _, _ -> False
        }
      }
      ast.Lt(p1, p2) -> {
        case resolve_part(p1, ctx), resolve_part(p2, ctx) {
          Some(v1), Some(v2) -> fact.compare(v1, v2) == order.Lt
          _, _ -> False
        }
      }
      ast.And(e1, e2) -> compile_predicate(e1)(ctx) && compile_predicate(e2)(ctx)
      ast.Or(e1, e2) -> compile_predicate(e1)(ctx) || compile_predicate(e2)(ctx)
    }
  }
}

fn merge_optional_stores(
  s1: Option(Dict(String, List(internal.StorageChunk))),
  s2: Option(Dict(String, List(internal.StorageChunk))),
) -> Option(Dict(String, List(internal.StorageChunk))) {
  case s1, s2 {
    Some(m1), Some(m2) -> Some(dict.merge(m1, m2))
    Some(_), None -> s1
    None, Some(_) -> s2
    None, None -> None
  }
}
