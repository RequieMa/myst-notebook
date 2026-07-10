// Minimal stub so pure-function tests can import modules that also import vscode.
// Only the exports needed by unit-tested pure functions need to be stubbed.
// The stub intentionally throws if any vscode runtime API is called —
// pure functions must not invoke vscode at test time.
export default {};
