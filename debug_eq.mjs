import * as Fact from "./build/dev/javascript/aarondb_edge/aarondb_edge/fact.mjs";
import { isEqual } from "./build/dev/javascript/aarondb_edge/gleam.mjs";

const e1 = Fact.ref(1);
const e2 = Fact.ref(1);

console.log("e1:", e1);
console.log("e2:", e2);
console.log("e1 === e2:", e1 === e2);
console.log("isEqual(e1, e2):", isEqual(e1, e2));
console.log("e1.constructor:", e1.constructor);
console.log("e2.constructor:", e2.constructor);
console.log("e1.constructor === e2.constructor:", e1.constructor === e2.constructor);
