# Tool Foundry Backend V2

Clean, dependency-free Node.js backend with automatic tool discovery, authenticated non-health routes, lifecycle enforcement, independent preflight, branch-only transactions, deployment verification, repair, and registry auditing.

Ordinary tools add only:

- `src/tools/<tool_id>.js`
- `test/tools/<tool_id>.test.js`
- `tool-manifests/<tool_id>.json`
