const fs = require("fs");
const path = require("path");

const DEFAULT_STATE = {
  missions: [],
  tools: [],
  evaluations: [],
  executions: [],
  revisions: [],
  events: []
};

function getDataFile() {
  return process.env.DATA_FILE || path.join(process.cwd(), "data", "store.json");
}

function ensureStoreFile() {
  const file = getDataFile();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(DEFAULT_STATE, null, 2));
  return file;
}

function readStore() {
  const file = ensureStoreFile();
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeStore(nextState) {
  const file = ensureStoreFile();
  fs.writeFileSync(file, JSON.stringify(nextState, null, 2));
  return nextState;
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function addEvent(type, payload = {}) {
  const state = readStore();
  state.events.push({ id: id("evt"), type, payload, created_at: nowIso() });
  writeStore(state);
}

module.exports = { readStore, writeStore, addEvent, nowIso, id };
