# Trusted Repository Writer v1

A fail-closed repository writer for recovery and maintenance work.

## Guarantees

- Branch-only by default; direct base/default branch writes are rejected.
- Exact validation evidence and exact owner approval are mandatory.
- Every file must match an approved path and expected pre-write SHA-256 hash.
- Replacement content must be complete, untruncated, unredacted, non-empty, and secret-free.
- Only manifest-listed paths may change.
- `git diff --check` and every declared test must pass before commit.
- A backup branch is created before changes.
- Optional push, deploy, and health-adoption verification occur only after tests pass.
- Any post-write failure triggers rollback to the backup branch.
- Every attempt produces a redacted audit record.
- Reusing a completed transaction ID is idempotent.

## Run

```bash
npm test
node bin/trusted-repository-writer.js examples/manifest.example.json
```

The writer does not create or request credentials. Supply credentials only through the trusted runner's environment or secret store.

## Tool Foundry adapter

`adapter/trusted_repository_writer.js` is a future Tool Foundry handler. It is intentionally not installed by this package. Install it only after the backend's authentication and mutation gates are active and its new-tool wiring has been separately validated and approved.
