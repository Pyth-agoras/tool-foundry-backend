# Tool Foundry Backend

This is the first working backend for your Self-Extending Tool Foundry Custom GPT.

It lets your Custom GPT:
- create tool missions
- list registered tools
- check mission status
- send revision requests
- register tools
- evaluate tools
- execute approved tools

This starter version includes a basic built-in `idea_analyzer` tool handler so you can test the full loop.

## Deploy on Render

1. Go to Render.com.
2. Click **New +**.
3. Click **Web Service**.
4. Connect GitHub.
5. Select this repository: `tool-foundry-backend`.
6. Build Command: `npm install`
7. Start Command: `npm start`
8. Add Environment Variable:
   - Key: `API_KEY`
   - Value: make a long private secret key
9. Click **Create Web Service**.

After deployment, open:

`https://YOUR-RENDER-URL/health`

You should see a healthy response.

## Custom GPT Actions

1. Open your Custom GPT.
2. Go to **Configure → Actions → Create new action**.
3. Open `openapi.yaml`.
4. Replace `https://YOUR-RENDER-URL` with your real Render URL.
5. Paste the schema into Actions.
6. Set authentication to API Key.
7. Use header name: `x-api-key`.
8. Paste the same API key you put in Render.
9. Test `healthCheck`.
10. Test `listTools`.

## First tool to register

Ask your Custom GPT:

`Register an approved starter tool called idea_analyzer. Its purpose is to analyze raw user ideas into a core goal, intelligence pattern, risk level, and next action.`

The backend already knows how to execute `idea_analyzer`.

## Important

Do not upload a `.env` file to GitHub.
Do not share your real API key.

## Starter executable tools

This backend includes two starter executable handlers:

- `idea_analyzer`: analyzes a raw user idea into a core goal, intelligence pattern, risk level, needed tool type, and next action.
- `tool_mission_generator`: converts a raw idea or analysis result into a complete Codex-ready Tool Mission object.

Register each tool as `Approved` before executing it from the Custom GPT.


## Version 0.2.0 — Self-Healing Core Tools

This version adds three built-in core tools that appear automatically in `/tools/list` after every deploy:

- `idea_analyzer`
- `tool_mission_generator`
- `foundry_self_healer`

Why this matters:

The first v0 backend stored tools in local runtime storage. After a Render redeploy, the registry could appear empty, which forced manual re-registration. The new version makes the core starter tools built into the backend code so the user does not repeat that setup loop.

### Built-in tools

#### idea_analyzer

Analyzes a raw idea.

Call through `executeTool` with:

```json
{
  "tool_id": "idea_analyzer",
  "input": {
    "raw_idea": "I want an AI that builds tools for itself."
  },
  "user_visible_purpose": "Analyze the user's raw idea."
}
```

#### tool_mission_generator

Turns a raw idea into a Codex-ready tool mission.

```json
{
  "tool_id": "tool_mission_generator",
  "input": {
    "raw_idea": "I want a setup repair tool.",
    "desired_tool_type": "foundry maintenance tool",
    "risk_level": "low",
    "user_constraints": "The user is non-technical. Do not ask coding questions."
  },
  "user_visible_purpose": "Generate a Codex-ready tool mission."
}
```

#### foundry_self_healer

Diagnoses and repairs common Tool Foundry setup issues.

```json
{
  "tool_id": "foundry_self_healer",
  "input": {
    "repair_mode": true,
    "check_scope": "core tools, action schema, registry, redeploy readiness"
  },
  "user_visible_purpose": "Check and repair Tool Foundry setup issues."
}
```

### Important limitation

Core tools now survive redeploys because they are built into code.

Custom generated tools, missions, evaluations, and execution logs still need a persistent database upgrade if they must survive all redeploys and instance resets.

## Version 0.3.0 — Foundry Operator

This version adds the built-in `foundry_operator` tool.

The operator is the automation layer that is supposed to stop the repeated manual loop of:

- downloading ZIP files
- uploading files to GitHub
- manually redeploying Render
- manually re-registering core tools

### Built-in tools after this update

After deploying this version, `/tools/list` should show:

- `idea_analyzer`
- `tool_mission_generator`
- `foundry_self_healer`
- `foundry_operator`

### One-time owner setup values in Render

Add these in Render → your `tool-foundry-backend` service → Environment:

- `API_KEY`: your existing private backend key
- `GITHUB_TOKEN`: a GitHub fine-grained token limited to this repo with Contents read/write
- `GITHUB_OWNER`: your GitHub username or org, for example `Pyth-agoras`
- `GITHUB_REPO`: `tool-foundry-backend`
- `GITHUB_BRANCH`: `main`
- `RENDER_DEPLOY_HOOK_URL`: the Deploy Hook URL from this Render service
- `PUBLIC_BASE_URL`: your live Render URL, for example `https://tool-foundry-backend.onrender.com`

Leave `AUTO_APPROVE_SAFE_UPDATES` unset unless you intentionally want safe self-updates to proceed without approval.

### Test the operator through Custom GPT

Ask the Custom GPT:

```text
Use foundry_operator to diagnose the Tool Foundry setup.

Use:
tool_id: foundry_operator

input:
{
  "mode": "diagnose",
  "check_scope": "GitHub token, Render deploy hook, public base URL, core tools, self-update readiness"
}

user_visible_purpose:
Confirm whether the Tool Foundry can update GitHub, trigger Render redeploys, and repair itself without manual ZIP uploads.
```

Expected result:

- core tools present
- GitHub configuration detected
- Render deploy hook detected
- public base URL detected
- self-update readiness reported

### Direct maintenance endpoints

The backend also exposes protected endpoints:

- `POST /foundry/diagnose`
- `POST /foundry/repair`
- `POST /foundry/deploy`
- `POST /foundry/upgrade`
- `POST /foundry/full-cycle`

These require the same `x-api-key` authentication as the other protected endpoints.

### Safety limits

The operator blocks:

- writes outside the project
- `.env`
- `.git/`
- `node_modules/`
- `data/`
- path traversal like `../`
- repo targets other than `tool-foundry-backend`

It requires owner approval for file updates unless `AUTO_APPROVE_SAFE_UPDATES=true`.

