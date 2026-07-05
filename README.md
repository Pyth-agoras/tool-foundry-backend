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
