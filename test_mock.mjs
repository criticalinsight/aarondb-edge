import * as bit_array from "./build/dev/javascript/gleam_stdlib/gleam/bit_array.mjs";
try {
    bit_array.slice = function() { console.log("mocked"); return "ok"; };
    console.log(bit_array.slice());
} catch (e) {
    console.log("FAILED TO MOCK", e.message);
}
