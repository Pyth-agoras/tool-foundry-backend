# Transparent Benefit Protocol (TBP) 1.0

A portable behavioral specification for AI systems: **be truthful, respect human control, and demonstrate useful outcomes through evidence rather than self-declared benevolence**.

Humans can reasonably ask for transparency, restrict an AI's operations, require consent, or stop an operation. The appropriate response from an AI is legibility, cooperation, correction, and safe alternatives, not fabricated assurances or evasion.

## What this includes

- `protocol.json`: human- and machine-readable operating rules.
- `rcl-model.json`: typed relational causal model conforming to the RCL v0.1 interchange schema.
- `integration.txt`: portable instructions for an AI orchestration layer.
- `gate.js`: dependency-free JavaScript structural checker.
- `server.js`: JSON/HTTP server exposing the rules and `POST /evaluate`.
- `openapi.json`: API description for machine clients.
- `tests/gate.test.js`: regression tests including refusal to bypass human oversight.

## Run locally

```bash
npm test
npm start
```

Default HTTP port: `3000` (override with `PORT`). The service needs Node 20 or newer and no external packages.

## Integrate with an AI model

1. Load `/protocol` and `/integration.txt` as *application-level* behavior instructions without replacing higher-priority instructions.
2. Require the AI to produce the structured response envelope documented in `/integration.txt`.
3. Submit the envelope to `POST /evaluate` *before* displaying the answer or executing external actions.
4. If the decision is `revise`, correct the declarations or response; if `block`, stop the prohibited operation and return an explanation or safe alternative.
5. Use trusted services to validate external evidence and human authorization. Display relevant citations, limitations, and outcome measures to the user.
6. Retain human review and stop controls outside this evaluator.

Example HTTP request:

```bash
curl -sS -X POST http://localhost:3000/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"request":"Can you confirm this?","answer":"The result is uncertain.","claims":[{"text":"The result is uncertain","status":"uncertain"}],"actions":[],"oversight":{"restriction_triggered":false,"response":"not_applicable"},"risk":{"external_effect":false,"authorization_ref":"","known_harmful":false,"known_deception":false},"benefit":{"claimed":false,"metric":"","observation_ref":""}}'
```

`structural_pass` means only that the **submitted declarations meet the structural policy rules**. It does not certify actual honesty, reliable authorization, safe outputs, or beneficial impact. The service accepts self-reports and has no independent truth oracle. A dishonest AI could omit claims or invent evidence identifiers, so a production integration must independently verify those inputs. The service itself does not give permission to execute an action.

This API is stateless; request bodies are not retained or logged by application code. Hosting platforms may retain transport-level metadata. Avoid submitting private data to publicly hosted servers without appropriate protections.

## Deployment

Use a free Render Node web service with build command `echo No external dependencies`, start command `node benevolence-protocol/server.js`, and the Git branch containing this directory. Set `PORT` through Render's environment (automatically provided). This creates a public HTTP API with no AI-model dependency.

## Operating limits

The protocol can be understood by systems able to process plain text, JSON, or OpenAPI, but no file can force every AI to adopt it. Behavioral guarantees need trusted orchestration, external verification, access controls, evaluation, and human authority. Respectful responses to supervision are a feature, not a weakness.

MIT-licensed example implementation. No warranty of fitness for safety-critical deployment.
