# Tool Foundry foundation-security recovery bundle

Mission: `mission_1783652475518`

Base commit: `f449950a77e48e85f2a2e2cb9d18e54614bf4a66`

Recommended branch: `recovery/foundation-security-f449950`

This bundle contains a hash-guarded patch applicator, complete new security modules,
focused tests, and manifest evidence. It performs no GitHub operation itself.

The external trusted installer must:

1. Verify `main` still equals the exact base commit.
2. Create the recovery branch from that commit.
3. Run the applicator from the repository root.
4. Copy the test files into `test/`.
5. Run all new and existing tests.
6. Run the preflight verifier with actual evidence.
7. Open a draft pull request only if all checks pass.

`mutation_gates_enforced` intentionally remains `false` until a later transactional
operator and automatic deployment rollback are live.
