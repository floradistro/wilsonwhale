#!/usr/bin/env node
/**
 * Lisa CLI - A conversational interface to your business
 *
 * Inspired by Claude Code's clean, minimal design.
 */

import { createInterface, emitKeypressEvents } from "readline";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { execSync, spawnSync } from "child_process";

// =============================================================================
// Configuration
// =============================================================================

const SUPABASE_URL = "https://uaednwpxursknmwdeejn.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZWRud3B4dXJza25td2RlZWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTcyMzMsImV4cCI6MjA3NjU3MzIzM30.N8jPwlyCBB5KJB5I-XaK6m-mq88rSR445AWFJJmwRCg";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZWRud3B4dXJza25td2RlZWpuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDk5NzIzMywiZXhwIjoyMDc2NTczMjMzfQ.l0NvBbS2JQWPObtWeVD2M2LD866A2tgLmModARYNnbI";

const VERSION = "2.0.0";

// GitHub repository for updates (uses Releases API)
const GITHUB_REPO = "floradistro/pt";

// =============================================================================
// ANSI Codes (minimal set)
// =============================================================================

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// Apple-inspired minimal palette
const WHITE = "\x1b[97m";               // Pure white - primary text
const GRAY = "\x1b[38;5;250m";          // Light gray - secondary text
const GRAY_DIM = "\x1b[38;5;245m";      // Medium gray - tertiary
const GRAY_DARK = "\x1b[38;5;240m";     // Dark gray - subtle
const BLUE = "\x1b[38;5;39m";           // Apple blue - accent, interactive
const GREEN = "\x1b[38;5;35m";          // Apple green - success, money
const GREEN_BRIGHT = "\x1b[38;5;46m";   // Bright green - emphasis
const RED = "\x1b[38;5;203m";           // Soft red - errors, negative
const ORANGE = "\x1b[38;5;215m";        // Soft orange - warnings
const GREEN_DIM = "\x1b[38;5;34m";      // For compatibility

// =============================================================================
// Session & Auth
// =============================================================================

const LISA_DIR = join(homedir(), ".lisa");
const AUTH_FILE = join(LISA_DIR, "auth.json");
const SESSION_FILE = join(LISA_DIR, "session.json");
const CONFIG_FILE = join(LISA_DIR, "config.json");

// Default configuration
const DEFAULT_CONFIG = {
  version: VERSION,
  autoUpdate: true,
  updateChannel: "stable",  // "stable" or "latest"
  ui: {
    theme: "dark",
    colors: true,
    animations: true,
  },
  session: {
    timeout: 30 * 60 * 1000,  // 30 minutes
    historyLimit: 20,
  },
  debug: false,
};

function ensureDir() {
  if (!existsSync(LISA_DIR)) mkdirSync(LISA_DIR, { recursive: true });
}

// =============================================================================
// Configuration Management
// =============================================================================

function loadConfig() {
  ensureDir();
  try {
    if (existsSync(CONFIG_FILE)) {
      const config = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
      return { ...DEFAULT_CONFIG, ...config };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getConfig() {
  return loadConfig();
}

// =============================================================================
// OTA Update System
// =============================================================================

async function checkForUpdates(silent = true) {
  const config = loadConfig();
  if (!config.autoUpdate) return null;

  try {
    // Fetch latest release from GitHub API
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Lisa-CLI'
      }
    });
    if (!res.ok) return null;

    const release = await res.json();
    const remoteVersion = release.tag_name.replace('v', '');

    if (compareVersions(remoteVersion, VERSION) > 0) {
      if (!silent) {
        console.log(`\n  ${BLUE}Update available:${RESET} ${VERSION} → ${remoteVersion}`);
        console.log(`  Run ${WHITE}lisa update${RESET} to install\n`);
      }
      return remoteVersion;
    }
  } catch {}
  return null;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function performUpdate() {
  console.log(`\n  ${BLUE}Checking for updates...${RESET}`);

  try {
    // Fetch latest release from GitHub API
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Lisa-CLI'
      }
    });

    if (!res.ok) {
      console.log(`  ${RED}Failed to check for updates${RESET}\n`);
      return false;
    }

    const release = await res.json();
    const targetVersion = release.tag_name.replace('v', '');

    if (compareVersions(targetVersion, VERSION) <= 0) {
      console.log(`  ${GREEN}Already up to date${RESET} (${VERSION})\n`);
      return true;
    }

    console.log(`  Updating ${VERSION} → ${targetVersion}...`);

    // Find the lisa binary asset in the release
    const lisaAsset = release.assets.find(a => a.name === 'lisa');
    if (!lisaAsset) {
      console.log(`  ${RED}Binary not found in release${RESET}\n`);
      return false;
    }

    // Download new version from release asset
    const binaryRes = await fetch(lisaAsset.browser_download_url, {
      headers: {
        'Accept': 'application/octet-stream',
        'User-Agent': 'Lisa-CLI'
      }
    });

    if (!binaryRes.ok) {
      console.log(`  ${RED}Failed to download update${RESET}\n`);
      return false;
    }

    const newBinary = await binaryRes.text();
    const installPath = process.argv[1];

    // Write new version
    writeFileSync(installPath, newBinary);

    console.log(`  ${GREEN}Updated successfully!${RESET}`);
    console.log(`  Restart Lisa to use version ${targetVersion}\n`);
    return true;
  } catch (err) {
    console.log(`  ${RED}Update failed: ${err.message}${RESET}\n`);
    return false;
  }
}

function loadAuth() {
  try {
    if (existsSync(AUTH_FILE)) return JSON.parse(readFileSync(AUTH_FILE, "utf8"));
  } catch {}
  return null;
}

function saveAuth(data) {
  ensureDir();
  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

function clearAuth() {
  ensureDir();
  if (existsSync(AUTH_FILE)) writeFileSync(AUTH_FILE, "{}");
}

function loadSession() {
  try {
    if (existsSync(SESSION_FILE)) {
      const data = JSON.parse(readFileSync(SESSION_FILE, "utf8"));
      if (Date.now() - data.lastActive < 30 * 60 * 1000) return data;
    }
  } catch {}
  return null;
}

function saveSession(data) {
  ensureDir();
  writeFileSync(SESSION_FILE, JSON.stringify({ ...data, lastActive: Date.now() }, null, 2));
}

function clearSession() {
  ensureDir();
  writeFileSync(SESSION_FILE, JSON.stringify({ lastActive: Date.now() }, null, 2));
}

// =============================================================================
// Auth Functions
// =============================================================================

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error_description || "Login failed");
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: data.user,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAuth(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error("Session expired. Run: lisa login");
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    user: data.user,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function getValidAuth() {
  const auth = loadAuth();
  if (!auth?.accessToken) return null;
  if (auth.expiresAt && Date.now() > auth.expiresAt - 300000) {
    try {
      const newAuth = await refreshAuth(auth.refreshToken);
      const full = { ...auth, ...newAuth };
      saveAuth(full);
      return full;
    } catch { return null; }
  }
  return auth;
}

async function getUserStore(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?auth_user_id=eq.${userId}&select=id,store_id,role,stores(id,store_name)`,
    { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  return {
    odooUserId: data[0].id,
    storeId: data[0].store_id,
    storeName: data[0].stores?.store_name,
    role: data[0].role,
  };
}

async function getStoreLocations(accessToken, storeId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/locations?store_id=eq.${storeId}&is_active=eq.true&select=id,name&order=name`,
    { headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];
  return res.json();
}

// =============================================================================
// Conversation Functions
// =============================================================================

async function getOrCreateConversation(accessToken, storeId, locationId = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_or_create_lisa_conversation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ p_store_id: storeId, p_chat_type: "ai", p_location_id: locationId }),
  });
  if (!res.ok) {
    const create = await fetch(`${SUPABASE_URL}/rest/v1/lisa_conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        store_id: storeId,
        chat_type: "ai",
        title: `CLI Chat - ${new Date().toLocaleDateString()}`,
        location_id: locationId,
      }),
    });
    const data = await create.json();
    return data[0]?.id;
  }
  return res.json();
}

async function loadHistory(accessToken, conversationId, limit = 20) {
  // Use service key for reading history (RLS bypass for test tokens)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/lisa_messages?conversation_id=eq.${conversationId}&select=role,content&order=created_at.desc&limit=${limit}`,
    { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
  );
  if (!res.ok) return [];
  const msgs = await res.json();
  return msgs.reverse();
}

async function saveMessage(accessToken, conversationId, role, content) {
  await fetch(`${SUPABASE_URL}/rest/v1/lisa_messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ conversation_id: conversationId, role, content }),
  });
}

// =============================================================================
// Session Context
// =============================================================================

let ctx = {
  auth: null,
  storeId: null,
  storeName: null,
  userId: null,
  userEmail: null,
  locationId: null,
  locationName: null,
  conversationId: null,
  history: [],

  // Current chat context - unified model
  // chatType: 'ai' (private Lisa), 'team' (location team chat)
  chatType: 'ai',
  chatName: 'Lisa',  // Display name for current chat

  // Backend-driven menu config (loaded on init)
  menuConfig: [],
};

// =============================================================================
// Backend-Driven Menu
// =============================================================================

async function loadMenuConfig(storeId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/cli_menu_config?store_id=eq.${storeId}&is_active=eq.true&order=sort_order.asc`,
      {
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`
        },
        signal: AbortSignal.timeout(5000)
      }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// =============================================================================
// Local File Tools (Client-Side Execution)
// From lisa-blessed.js - tool schemas sent to backend
// =============================================================================

const LOCAL_TOOLS = [
  { name: "Read", description: "Read file contents", parameters: { type: "object", properties: { file_path: { type: "string" }, offset: { type: "number" }, limit: { type: "number" } }, required: ["file_path"] } },
  { name: "Edit", description: "Edit file by replacing text", parameters: { type: "object", properties: { file_path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } }, required: ["file_path", "old_string", "new_string"] } },
  { name: "Write", description: "Write file contents", parameters: { type: "object", properties: { file_path: { type: "string" }, content: { type: "string" } }, required: ["file_path", "content"] } },
  { name: "Glob", description: "Find files by pattern", parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] } },
  { name: "Grep", description: "Search in files", parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" }, case_insensitive: { type: "boolean" } }, required: ["pattern"] } },
  { name: "Bash", description: "Run shell command", parameters: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" }, timeout: { type: "number" } }, required: ["command"] } },
  { name: "LS", description: "List directory", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
];

// Execute a local tool - returns structured result for backend
async function executeTool(name, params) {
  try {
    switch (name) {
      case "Read": {
        if (!params.file_path) return { success: false, error: 'Missing file_path' };
        const content = readFileSync(params.file_path, 'utf8');
        const lines = content.split('\n');
        const offset = Math.max(1, params.offset || 1);
        const limit = Math.min(2000, params.limit || 2000);
        const subset = lines.slice(offset - 1, offset - 1 + limit);
        return { success: true, content: subset.map((l, i) => `${String(offset + i).padStart(5)}  ${l}`).join('\n'), total_lines: lines.length };
      }
      case "Edit": {
        if (!params.file_path) return { success: false, error: 'Missing file_path' };
        const content = readFileSync(params.file_path, 'utf8');
        if (!content.includes(params.old_string)) return { success: false, error: 'String not found' };
        writeFileSync(params.file_path, params.replace_all ? content.split(params.old_string).join(params.new_string) : content.replace(params.old_string, params.new_string));
        return { success: true };
      }
      case "Write": {
        if (!params.file_path) return { success: false, error: 'Missing file_path' };
        const dir = dirname(params.file_path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(params.file_path, params.content);
        return { success: true };
      }
      case "Glob": {
        if (!params.pattern) return { success: false, error: 'Missing pattern' };
        const basePath = (params.path || process.cwd()).replace(/[`$();&|<>]/g, '');
        const filename = (params.pattern.split('/').pop() || '*').replace(/[`$();&|<>]/g, '');
        const output = execSync(`find "${basePath}" -type f -name "${filename}" 2>/dev/null | head -100`, { encoding: 'utf8', timeout: 30000 });
        return { success: true, files: output.trim().split('\n').filter(Boolean) };
      }
      case "Grep": {
        if (!params.pattern) return { success: false, error: 'Missing pattern' };
        const safePath = (params.path || '.').replace(/[`$();&|<>]/g, '');
        const safePattern = params.pattern.replace(/[`$();&|<>]/g, '\\$&');
        try {
          const output = execSync(`grep ${params.case_insensitive ? '-rni' : '-rn'} -- "${safePattern}" "${safePath}" 2>/dev/null | head -50`, { encoding: 'utf8', timeout: 30000 });
          return { success: true, matches: output };
        } catch { return { success: true, matches: '' }; }
      }
      case "Bash": {
        if (!params.command) return { success: false, error: 'Missing command' };
        const result = spawnSync('bash', ['-c', params.command], { cwd: params.cwd || process.cwd(), encoding: 'utf8', timeout: Math.min(params.timeout || 120000, 300000), maxBuffer: 10 * 1024 * 1024 });
        return { success: result.status === 0, stdout: result.stdout || '', stderr: result.stderr || '', exit_code: result.status };
      }
      case "LS": {
        if (!params.path) return { success: false, error: 'Missing path' };
        const entries = readdirSync(params.path, { withFileTypes: true });
        return { success: true, entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })) };
      }
      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// Spinner (Claude Code style)
// =============================================================================

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

class Spinner {
  constructor(text) {
    this.text = text;
    this.frame = 0;
    this.interval = null;
    this.start = Date.now();
  }

  run() {
    this.render();
    this.interval = setInterval(() => this.render(), 80);
    return this;
  }

  render() {
    const s = SPINNER[this.frame % SPINNER.length];
    process.stdout.write(`\r  ${GRAY_DIM}${s}${RESET} ${GRAY}${this.text}${RESET}`);
    this.frame++;
  }

  stop(text, ok = true) {
    if (this.interval) clearInterval(this.interval);
    const elapsed = ((Date.now() - this.start) / 1000).toFixed(1);
    const icon = ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    process.stdout.write(`\r\x1b[K  ${icon} ${GRAY}${text || this.text}${RESET} ${GRAY_DARK}${elapsed}s${RESET}\n`);
  }

  update(text) {
    this.text = text;
  }
}

// =============================================================================
// API
// =============================================================================

async function sendMessage(message, toolResults = null, pendingContent = null) {
  const body = {
    store_id: ctx.storeId,
    message,
    conversation_history: ctx.history.map(m => ({ role: m.role, content: m.content })),
    // Local tools for client-side execution
    local_tools: LOCAL_TOOLS,
    // New fields for backend-driven CLI
    working_directory: process.cwd(),
    platform: process.platform,
    client: 'cli',
    format_hint: 'terminal',
  };
  if (ctx.userId) body.user_id = ctx.userId;
  if (ctx.userEmail) body.user_email = ctx.userEmail;
  if (ctx.storeName) body.store_name = ctx.storeName;
  if (ctx.conversationId) body.conversation_id = ctx.conversationId;
  if (ctx.locationId) body.location_id = ctx.locationId;
  if (ctx.locationName) body.location_name = ctx.locationName;

  // Add tool results if this is a continuation after local tool execution
  if (toolResults) {
    body.tool_results = toolResults;
    body.pending_assistant_content = pendingContent;
  }

  const token = ctx.auth?.accessToken || SERVICE_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agentic-loop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res;
}

async function* parseSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { yield JSON.parse(line.slice(6)); } catch {}
      }
    }
  }
}

// =============================================================================
// Stream Response
// =============================================================================

async function streamResponse(response, userMessage, existingSpinner = null) {
  let fullText = "";
  let lineBuffer = "";  // Buffer for complete lines
  let spinner = existingSpinner || new Spinner("Thinking").run();
  let textStarted = false;

  const formatLine = (line) => {
    return line
      // === SECTION HEADERS === → elegant minimal header
      .replace(/(={3,})\s*([^=]+?)\s*(={3,})/g, (_, _a, title) => {
        const t = title.trim();
        return `\n  ${WHITE}${BOLD}${t}${RESET}\n  ${GRAY_DARK}${'─'.repeat(Math.max(t.length, 20))}${RESET}\n`;
      })
      // ALL CAPS HEADERS (like DAILY REVENUE)
      .replace(/^([A-Z][A-Z\s]{2,})$/gm, (_, title) => {
        return `\n  ${WHITE}${BOLD}${title}${RESET}\n  ${GRAY_DARK}${'─'.repeat(Math.max(title.length, 20))}${RESET}`;
      })
      // Column headers in tables - subtle
      .replace(/^(\s*)(Product|Item|Name|Date|Day|Location|Category|Total|Qty|Revenue|Orders|Amount|Count|Status|Week|Month|Avg|Min|Max)(\s+)/gim, `$1${GRAY_DIM}$2${RESET}$3`)
      // Chart bars - blue accent like Apple
      .replace(/(█+)/g, `${BLUE}$1${RESET}`)
      .replace(/(▓+)/g, `${GRAY}$1${RESET}`)
      .replace(/(░+)/g, `${GRAY_DARK}$1${RESET}`)
      // Money - green, the universal color for money
      .replace(/(\$[\d,]+(?:\.\d+)?)/g, `${GREEN}$1${RESET}`)
      // Percentages - subtle
      .replace(/(\d+\.?\d*%)/g, `${GRAY}$1${RESET}`)
      // Positive changes - green
      .replace(/(\+[\d.]+%|\+\$[\d,]+)/g, `${GREEN}$1${RESET}`)
      // Negative changes - soft red
      .replace(/(-[\d.]+%|-\$[\d,]+)/g, `${RED}$1${RESET}`)
      // Status words - critical (soft red, not shouty)
      .replace(/\b(critical|out of stock|low stock|0 units|overdue|failed|error)\b/gi, `${RED}$1${RESET}`)
      // Status words - warning (soft orange)
      .replace(/\b(warning|low|pending|needs attention|expiring|delayed)\b/gi, `${ORANGE}$1${RESET}`)
      // Status words - success
      .replace(/\b(in stock|complete|success|approved|active|done)\b/gi, `${GREEN}$1${RESET}`)
      // Dates - white to stand out
      .replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/gi, `${WHITE}$1${RESET}`)
      .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/gi, `${WHITE}$1 $2${RESET}`);
  };

  for await (const event of parseSSE(response)) {
    switch (event.type) {
      case "text":
      case "text_delta":
      case "chunk": {
        // Handle multiple text formats from backend
        let content = event.content || event.text || '';
        if (content) {
          if (!textStarted) {
            if (spinner) {
              spinner.stop("Thinking", true);
              spinner = null;
            }
            textStarted = true;
            process.stdout.write("\n");
          }

          // Buffer text and output complete lines only
          lineBuffer += content;
          const lines = lineBuffer.split("\n");

          // Keep the last incomplete line in buffer
          lineBuffer = lines.pop() || "";

          // Output complete lines with formatting
          for (const line of lines) {
            process.stdout.write(formatLine(line) + "\n");
          }

          fullText += content;
        }
        break;
      }

      case "content_block_delta": {
        // Claude API format - text delta inside content block
        if (event.delta?.text) {
          if (!textStarted) {
            if (spinner) {
              spinner.stop("Thinking", true);
              spinner = null;
            }
            textStarted = true;
            process.stdout.write("\n");
          }

          lineBuffer += event.delta.text;
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() || "";

          for (const line of lines) {
            process.stdout.write(formatLine(line) + "\n");
          }

          fullText += event.delta.text;
        }
        break;
      }

      case "tool_start":
        if (textStarted) process.stdout.write("\n");
        if (spinner) {
          spinner.stop(spinner.text, true);
          spinner = null;
        }
        const toolStartName = event.tool_name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        spinner = new Spinner(toolStartName).run();
        textStarted = false;
        break;

      case "pause_for_tools":
        // Backend is requesting local tool execution - execute and send results back
        if (spinner) {
          spinner.stop(spinner.text, true);
          spinner = null;
        }
        if (textStarted) {
          // Flush line buffer before tools
          if (lineBuffer) {
            process.stdout.write(formatLine(lineBuffer) + "\n");
            lineBuffer = "";
          }
          textStarted = false;
        }

        const pendingTools = event.pending_tools || [];
        if (pendingTools.length > 0) {
          // Execute tools in parallel
          const results = [];
          for (const tool of pendingTools) {
            const toolDisplayName = tool.name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            spinner = new Spinner(toolDisplayName).run();

            const result = await executeTool(tool.name, tool.input);

            spinner.stop(toolDisplayName, result.success !== false);
            spinner = null;

            results.push({ tool_use_id: tool.id, content: JSON.stringify(result) });
          }

          // Send results back to backend and continue the loop
          const continuation = await sendMessage(userMessage, results, event.assistant_content);
          // Recursively process the continuation response
          return streamResponse(continuation, null, null);
        }
        break;

      case "tool_result":
        if (spinner) {
          const toolResultName = event.tool_name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          spinner.stop(toolResultName, true);
          spinner = null;
        }
        break;

      case "error":
        if (spinner) {
          spinner.stop("Error", false);
          spinner = null;
        }
        console.error(`\n${RED}Error: ${event.error}${RESET}`);
        return;

      case "done":
        if (spinner) {
          spinner.stop(spinner.text, true);
          spinner = null;
        }
        // Flush remaining buffer
        if (lineBuffer) {
          process.stdout.write(formatLine(lineBuffer));
          lineBuffer = "";
        }
        if (!textStarted) process.stdout.write("\n");
        break;
    }
  }

  // Final flush just in case
  if (lineBuffer) {
    process.stdout.write(formatLine(lineBuffer) + "\n");
  }

  // Update history
  if (userMessage) {
    ctx.history.push({ role: "user", content: userMessage });
    if (ctx.auth && ctx.conversationId) {
      saveMessage(ctx.auth.accessToken, ctx.conversationId, "user", userMessage).catch(() => {});
    }
  }
  if (fullText) {
    ctx.history.push({ role: "assistant", content: fullText });
    if (ctx.auth && ctx.conversationId) {
      saveMessage(ctx.auth.accessToken, ctx.conversationId, "assistant", fullText).catch(() => {});
    }
  }

  // Trim history
  if (ctx.history.length > 20) ctx.history = ctx.history.slice(-20);

  // Save session
  saveSession({
    conversationId: ctx.conversationId,
    storeId: ctx.storeId,
    locationId: ctx.locationId,
    historyLength: ctx.history.length,
    localHistory: !ctx.auth ? ctx.history : undefined,
  });

  process.stdout.write("\n");
}

// =============================================================================
// Init Session
// =============================================================================

async function initSession(opts = {}) {
  const auth = await getValidAuth();

  if (auth) {
    ctx.auth = auth;
    ctx.storeId = auth.storeId;
    ctx.storeName = auth.storeName;
    ctx.userId = auth.user?.id;
    ctx.userEmail = auth.user?.email;

    // If userId is not a valid UUID, look it up by email
    const isValidUUID = ctx.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ctx.userId);
    if (!isValidUUID && ctx.userEmail) {
      try {
        const userRes = await fetch(
          `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(ctx.userEmail)}&select=auth_user_id`,
          { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
        );
        if (userRes.ok) {
          const users = await userRes.json();
          if (users.length > 0 && users[0].auth_user_id) {
            ctx.userId = users[0].auth_user_id;
          }
        }
      } catch {}
    }

    if (opts.location) {
      const loc = auth.locations?.find(l =>
        l.id === opts.location || l.name.toLowerCase().includes(opts.location.toLowerCase())
      );
      if (loc) {
        ctx.locationId = loc.id;
        ctx.locationName = loc.name;
      }
    }

    if (!opts.newSession) {
      const session = loadSession();
      if (session?.conversationId && session?.storeId === auth.storeId) {
        ctx.conversationId = session.conversationId;
        // Restore location from session if set
        if (session.locationId) {
          ctx.locationId = session.locationId;
          ctx.locationName = session.locationName || auth.locations?.find(l => l.id === session.locationId)?.name;
        }
        ctx.history = await loadHistory(auth.accessToken, session.conversationId);
        // Load backend-driven menu config
        ctx.menuConfig = await loadMenuConfig(auth.storeId);
        return true;
      }
    }

    ctx.conversationId = await getOrCreateConversation(auth.accessToken, auth.storeId, ctx.locationId);
    // Always load history from database (might have messages from previous sessions)
    ctx.history = await loadHistory(auth.accessToken, ctx.conversationId);

    // Load backend-driven menu config
    ctx.menuConfig = await loadMenuConfig(auth.storeId);

    return false;
  } else {
    // No demo mode - require login
    return null;
  }
}

// =============================================================================
// Interactive Mode
// =============================================================================

async function interactive(hasPrevious) {
  console.clear();

  // Get current time for dynamic greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const userName = ctx.userEmail?.split('@')[0] || 'there';

  // Gradient bar
  const gradientBar = () => {
    const colors = [51, 50, 49, 45, 44, 39, 38, 33, 32, 27];
    return colors.map(c => `\x1b[38;5;${c}m━━━━━━`).join('') + RESET;
  };

  // Store info
  const storeDisplay = ctx.storeName || 'Flora';
  const locationDisplay = ctx.locationName || 'All locations';

  // Rotating taglines
  const taglines = [
    "Your data speaks. I translate.",
    "Insights at the speed of thought",
    "Know your numbers. Own your future.",
    "From chaos to clarity",
    "Ask anything. Get answers.",
  ];
  const tagline = taglines[Math.floor(Math.random() * taglines.length)];

  // Clean header with gradient accent
  console.log();
  console.log(`  ${gradientBar()}`);
  console.log();
  console.log(`  ${WHITE}${BOLD}${storeDisplay}${RESET}  ${GRAY_DARK}›${RESET}  ${GRAY}${locationDisplay}${RESET}`);
  console.log();
  console.log(`  ${WHITE}${greeting}, ${BOLD}${userName}${RESET}${WHITE}.${RESET}`);
  console.log(`  ${GRAY_DIM}${tagline}${RESET}`);
  console.log();

  // Session info
  if (hasPrevious && ctx.history.length > 0) {
    console.log(`  ${GRAY_DIM}↩ ${ctx.history.length} messages${RESET}  ${GRAY_DARK}·${RESET}  ${BLUE}/new${RESET} ${GRAY_DIM}fresh start${RESET}`);
  } else {
    console.log(`  ${GRAY_DIM}Try${RESET}  ${WHITE}"sales today"${RESET}  ${GRAY_DARK}·${RESET}  ${WHITE}"low stock"${RESET}  ${GRAY_DARK}·${RESET}  ${WHITE}"top products"${RESET}`);
  }

  console.log();

  // ==========================================================================
  // SLASH COMMAND MENU SYSTEM
  // ==========================================================================

  // All available commands - combines backend menu config with local commands
  const getCommands = () => {
    // Start with backend-driven menu items if available
    const commands = [];

    // Add backend menu items first (from cli_menu_config)
    if (ctx.menuConfig?.length) {
      for (const item of ctx.menuConfig) {
        commands.push({
          cmd: `/${item.item_id}`,
          desc: item.description || item.label,
          icon: item.icon || "●",
          category: item.menu_type || "main",
          action: item.action,
          value: item.value,
        });
      }
    } else {
      // Fallback to hardcoded menu if backend config not loaded
      commands.push(
        { cmd: "/new_chat", desc: "Start fresh", icon: "+", category: "main", action: "view", value: "new_chat" },
        { cmd: "/history", desc: "Chat history", icon: "↵", category: "main", action: "view", value: "history" },
        { cmd: "/team", desc: "Team chats", icon: "◆", category: "main", action: "view", value: "team" },
        { cmd: "/alerts", desc: "Alerts", icon: "!", category: "main", action: "view", value: "alerts" },
        { cmd: "/locations", desc: "Switch location", icon: "◇", category: "main", action: "view", value: "locations" },
      );
    }

    // Always add local-only commands (not backend-driven)
    commands.push(
      { cmd: "/lisa", desc: "Private AI chat", icon: "●", category: "chat" },
      { cmd: "/new", desc: "Start fresh conversation", icon: "✦", category: "chat" },
      { cmd: "/clear", desc: "Clear screen", icon: "○", category: "view" },
      { cmd: "/login", desc: "Sign in to your account", icon: "→", category: "auth" },
      { cmd: "/logout", desc: "Sign out", icon: "←", category: "auth" },
      { cmd: "/status", desc: "View connection status", icon: "●", category: "info" },
      { cmd: "/settings", desc: "Configure Lisa", icon: "⚙", category: "system" },
      { cmd: "/update", desc: "Check for updates", icon: "↑", category: "system" },
      { cmd: "/help", desc: "Show all commands", icon: "?", category: "info" },
      { cmd: "/quit", desc: "Exit Lisa", icon: "⏻", category: "system" },
    );

    // Add location shortcuts if authenticated
    if (ctx.auth?.locations?.length) {
      for (const loc of ctx.auth.locations.slice(0, 5)) {
        commands.push({
          cmd: `/loc:${loc.name.toLowerCase().replace(/\s+/g, '-')}`,
          desc: `Switch to ${loc.name}`,
          icon: ctx.locationId === loc.id ? "●" : "○",
          category: "location",
          location: loc
        });
      }
    }

    return commands;
  };

  // Execute command
  const executeCommand = async (item) => {

    // Location switch
    if (item.location) {
      ctx.locationId = item.location.id;
      ctx.locationName = item.location.name;
      if (ctx.auth) {
        ctx.conversationId = await getOrCreateConversation(ctx.auth.accessToken, ctx.storeId, ctx.locationId);
      }
      ctx.history = [];
      saveSession({
        conversationId: ctx.conversationId,
        locationId: ctx.locationId,
        locationName: ctx.locationName,
        storeId: ctx.storeId,
        historyLength: 0
      });
      console.log();
      console.log(`  ${GREEN}✓${RESET} ${WHITE}Switched to ${item.location.name}${RESET}`);
      console.log();
      return true;
    }

    switch (item.cmd) {
      case "/location":
      case "/locations":
        if (!ctx.auth?.locations?.length) {
          console.log(`\n  ${GRAY_DIM}No locations available. Login first.${RESET}\n`);
        } else {
          console.log(`\n  ${WHITE}${BOLD}Locations${RESET}\n`);
          for (const loc of ctx.auth.locations) {
            const active = ctx.locationId === loc.id;
            const icon = active ? `${GREEN}●${RESET}` : `${GRAY_DIM}○${RESET}`;
            const name = active ? `${WHITE}${loc.name}${RESET}` : `${GRAY}${loc.name}${RESET}`;
            console.log(`  ${icon} ${name}`);
          }
          console.log(`\n  ${GRAY_DIM}Type /loc:name to switch${RESET}\n`);
        }
        return true;

      case "/new":
        if (ctx.auth) {
          ctx.conversationId = await getOrCreateConversation(ctx.auth.accessToken, ctx.storeId, ctx.locationId);
        }
        ctx.history = [];
        // Preserve location when starting new conversation
        saveSession({
          conversationId: ctx.conversationId,
          locationId: ctx.locationId,
          locationName: ctx.locationName,
          storeId: ctx.storeId,
          historyLength: 0
        });
        console.log(`\n  ${GREEN}✓${RESET} ${GRAY}New conversation started${RESET}\n`);
        return true;

      case "/history":
        // History is handled interactively in the live menu system
        return "history";

      case "/clear":
        console.clear();
        // Redraw header
        console.log();
        console.log(`  ${WHITE}${BOLD}${ctx.storeName || 'Flora'}${RESET}  ${GRAY_DARK}›${RESET}  ${GRAY}${ctx.locationName || 'All locations'}${RESET}`);
        console.log();
        return true;

      case "/status":
        console.log(`\n  ${WHITE}${BOLD}Status${RESET}\n`);
        console.log(`  ${GRAY_DIM}Store${RESET}     ${WHITE}${ctx.storeName || 'Flora'}${RESET}`);
        console.log(`  ${GRAY_DIM}Location${RESET}  ${WHITE}${ctx.locationName || 'All locations'}${RESET}`);
        console.log(`  ${GRAY_DIM}Auth${RESET}      ${ctx.auth ? `${GREEN}●${RESET} ${GRAY}${ctx.userEmail}${RESET}` : `${ORANGE}○${RESET} ${GRAY}demo mode${RESET}`}`);
        console.log(`  ${GRAY_DIM}Messages${RESET}  ${WHITE}${ctx.history.length}${RESET}`);
        console.log();
        return true;

      case "/login":
        console.log(`\n  ${GRAY_DIM}Run${RESET} ${WHITE}lisa login${RESET} ${GRAY_DIM}from terminal${RESET}\n`);
        return true;

      case "/logout":
        clearAuth();
        clearSession();
        ctx.auth = null;
        console.log(`\n  ${GREEN}✓${RESET} ${GRAY}Logged out${RESET}\n`);
        return true;

      case "/help":
        console.log(`\n  ${WHITE}${BOLD}Commands${RESET}\n`);
        const categories = {};
        for (const c of getCommands()) {
          if (!categories[c.category]) categories[c.category] = [];
          categories[c.category].push(c);
        }
        for (const [cat, cmds] of Object.entries(categories)) {
          if (cat === 'location') continue;
          for (const c of cmds) {
            console.log(`  ${GRAY_DIM}${c.icon}${RESET} ${BLUE}${c.cmd}${RESET}  ${GRAY_DIM}${c.desc}${RESET}`);
          }
        }
        console.log();
        return true;

      case "/settings":
        const config = loadConfig();
        console.log(`\n  ${WHITE}${BOLD}Settings${RESET}\n`);
        console.log(`  ${GRAY_DIM}Version${RESET}        ${WHITE}${VERSION}${RESET}`);
        console.log(`  ${GRAY_DIM}Auto-update${RESET}    ${config.autoUpdate ? `${GREEN}on${RESET}` : `${GRAY}off${RESET}`}`);
        console.log(`  ${GRAY_DIM}Channel${RESET}        ${WHITE}${config.updateChannel}${RESET}`);
        console.log(`  ${GRAY_DIM}Theme${RESET}          ${WHITE}${config.ui?.theme || 'dark'}${RESET}`);
        console.log(`  ${GRAY_DIM}Colors${RESET}         ${config.ui?.colors ? `${GREEN}on${RESET}` : `${GRAY}off${RESET}`}`);
        console.log(`  ${GRAY_DIM}Animations${RESET}     ${config.ui?.animations ? `${GREEN}on${RESET}` : `${GRAY}off${RESET}`}`);
        console.log(`  ${GRAY_DIM}History limit${RESET}  ${WHITE}${config.session?.historyLimit || 20}${RESET}`);
        console.log(`  ${GRAY_DIM}Session timeout${RESET} ${WHITE}${Math.round((config.session?.timeout || 1800000) / 60000)}m${RESET}`);
        console.log(`  ${GRAY_DIM}Debug${RESET}          ${config.debug ? `${GREEN}on${RESET}` : `${GRAY}off${RESET}`}`);
        console.log();
        console.log(`  ${GRAY_DIM}Config file: ${CONFIG_FILE}${RESET}`);
        console.log();
        return true;

      case "/update":
        await performUpdate();
        return true;

      case "/quit":
      case "/exit":
      case "/q":
        console.log(`\n${DIM}Goodbye${RESET}\n`);
        process.exit(0);

      default:
        return false;
    }
  };

  // ==========================================================================
  // LIVE INPUT WITH MENU
  // ==========================================================================

  let inputBuffer = "";
  let menuItems = [];
  let menuIndex = 0;
  let menuVisible = false;
  let isProcessing = false;

  // Get the prompt prefix based on current context
  const getPrompt = () => {
    if (ctx.chatType === 'team') {
      return `${ctx.chatName} > `;
    }
    return `> `;
  };

  // Show prompt
  const showPrompt = () => {
    process.stdout.write(getPrompt());
  };

  // Full render - clears below cursor and redraws everything
  const render = () => {
    if (isProcessing) return;

    // Move to start of line, clear from cursor to end of screen
    process.stdout.write('\r\x1b[K');

    // Draw input with context-aware prompt
    process.stdout.write(`${getPrompt()}${inputBuffer}`);

    // Draw command menu if visible
    if (menuVisible && menuItems.length > 0) {
      process.stdout.write('\x1b[J');

      // Find max command width for alignment
      const maxCmdLen = Math.max(...menuItems.map(i => i.cmd.length));

      for (let i = 0; i < menuItems.length; i++) {
        const item = menuItems[i];
        const selected = i === menuIndex;
        const padding = ' '.repeat(maxCmdLen - item.cmd.length + 4);
        const pointer = selected ? `${BLUE}>${RESET} ` : '  ';
        if (selected) {
          process.stdout.write(`\n  ${pointer}\x1b[7m ${item.cmd} \x1b[27m${padding}${WHITE}${item.desc}${RESET}`);
        } else {
          process.stdout.write(`\n  ${pointer}${item.cmd}${padding}${GRAY_DIM}${item.desc}${RESET}`);
        }
      }

      const menuLines = menuItems.length;
      process.stdout.write(`\x1b[${menuLines}A\r`);
      process.stdout.write(`${getPrompt()}${inputBuffer}`);
    }

    // Draw submenu if visible (generic for history, location, team, etc.)
    if (submenu.visible && submenu.items.length > 0) {
      process.stdout.write('\x1b[J');

      // Find max label width for alignment
      const maxLabelLen = Math.max(...submenu.items.map(i => i.label.length));

      for (let i = 0; i < submenu.items.length; i++) {
        const item = submenu.items[i];
        const selected = i === submenu.index;
        const padding = item.desc ? ' '.repeat(maxLabelLen - item.label.length + 4) : '';
        const desc = item.desc || '';
        const pointer = selected ? `${BLUE}>${RESET} ` : '  ';
        if (selected) {
          process.stdout.write(`\n  ${pointer}\x1b[7m ${item.label} \x1b[27m${padding}${WHITE}${desc}${RESET}`);
        } else {
          process.stdout.write(`\n  ${pointer}${item.label}${padding}${GRAY_DIM}${desc}${RESET}`);
        }
      }

      const menuLines = submenu.items.length;
      process.stdout.write(`\x1b[${menuLines}A\r`);
      process.stdout.write(`${getPrompt()}${inputBuffer}`);
    }
  };

  // Update menu based on input
  const updateMenu = () => {
    const commands = getCommands();

    if (inputBuffer === "/") {
      menuItems = commands.slice(0, 9);
      menuIndex = 0;
      menuVisible = true;
    } else if (inputBuffer.startsWith("/") && inputBuffer.length > 1) {
      const q = inputBuffer.slice(1).toLowerCase();
      menuItems = commands.filter(c =>
        c.cmd.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q)
      ).slice(0, 6);
      menuIndex = 0;
      menuVisible = menuItems.length > 0;
    } else {
      menuItems = [];
      menuVisible = false;
    }
  };

  // Close menu
  const closeMenu = () => {
    menuVisible = false;
    menuItems = [];
    menuIndex = 0;
  };

  // ==========================================================================
  // GENERIC SUBMENU SYSTEM
  // ==========================================================================

  let submenu = {
    visible: false,
    type: null,        // 'history', 'location', 'team'
    title: '',
    items: [],
    index: 0,
    hint: '',
    onSelect: null,    // callback when item selected
  };

  const closeSubmenu = () => {
    submenu = { visible: false, type: null, title: '', items: [], index: 0, hint: '', onSelect: null };
  };

  // Open history submenu - loads all user's conversations from database
  const openHistoryMenu = async () => {
    if (!ctx.storeId) {
      return false;
    }

    try {
      // Load all AI conversations for this user/store
      const url = `${SUPABASE_URL}/rest/v1/lisa_conversations?store_id=eq.${ctx.storeId}&chat_type=eq.ai&select=id,title,location_id,updated_at,locations(name)&order=updated_at.desc&limit=10`;
      const res = await fetch(url, { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } });

      if (!res.ok) {
        return false;
      }
      const conversations = await res.json();
      if (conversations.length === 0) {
        return false;
      }

      submenu = {
        visible: true,
        type: 'history',
        title: 'History',
        items: conversations.map(c => ({
          label: c.locations?.name || 'All locations',
          desc: new Date(c.updated_at).toLocaleDateString(),
          data: { conversationId: c.id, locationId: c.location_id, locationName: c.locations?.name },
        })),
        index: 0,
        hint: '↑↓ navigate · enter select · esc cancel',
        onSelect: async (item) => {
          ctx.chatType = 'ai';
          ctx.chatName = 'Lisa';
          ctx.locationId = item.data.locationId;
          ctx.locationName = item.data.locationName;
          ctx.conversationId = item.data.conversationId;
          ctx.history = await loadHistory(ctx.auth?.accessToken, ctx.conversationId);

          console.clear();
          console.log();
          if (ctx.locationName) {
            console.log(`${WHITE}${BOLD}${ctx.storeName}${RESET}  ${GRAY_DARK}›${RESET}  ${GRAY}${ctx.locationName}${RESET}`);
          } else {
            console.log(`${WHITE}${BOLD}${ctx.storeName}${RESET}`);
          }
          console.log();
          console.log(`${GRAY_DIM}${ctx.history.length} messages${RESET}`);
          console.log();
        },
      };
      return true;
    } catch (e) {
      return false;
    }
  };

  // Open location submenu
  const openLocationMenu = () => {
    if (!ctx.auth?.locations?.length) return false;

    submenu = {
      visible: true,
      type: 'location',
      title: 'Locations',
      items: ctx.auth.locations.map(loc => ({
        label: loc.name,
        data: loc,
      })),
      index: Math.max(0, ctx.auth.locations.findIndex(l => l.id === ctx.locationId)),
      hint: '↑↓ navigate · enter select · esc cancel',
      onSelect: async (item) => {
        ctx.chatType = 'ai';
        ctx.chatName = 'Lisa';
        ctx.locationId = item.data.id;
        ctx.locationName = item.data.name;
        ctx.conversationId = await getOrCreateConversation(ctx.auth?.accessToken, ctx.storeId, ctx.locationId);
        ctx.history = await loadHistory(ctx.auth?.accessToken, ctx.conversationId);

        saveSession({
          conversationId: ctx.conversationId,
          locationId: ctx.locationId,
          locationName: ctx.locationName,
          storeId: ctx.storeId,
          historyLength: ctx.history.length
        });

        console.clear();
        console.log();
        console.log(`${WHITE}${BOLD}${ctx.storeName}${RESET}  ${GRAY_DARK}›${RESET}  ${GRAY}${ctx.locationName}${RESET}`);
        console.log();
        if (ctx.history.length > 0) {
          console.log(`${GRAY_DIM}${ctx.history.length} messages${RESET}`);
        }
        console.log();
      },
    };
    return true;
  };

  // Switch to private AI chat (clears location - store-wide context)
  const switchToPrivateChat = async () => {
    ctx.chatType = 'ai';
    ctx.chatName = 'Lisa';
    ctx.locationId = null;
    ctx.locationName = null;
    ctx.conversationId = await getOrCreateConversation(ctx.auth?.accessToken, ctx.storeId, null);
    ctx.history = await loadHistory(ctx.auth?.accessToken, ctx.conversationId);

    console.clear();
    console.log();
    console.log(`${WHITE}${BOLD}${ctx.storeName || 'Lisa'}${RESET}`);
    console.log();

    if (ctx.history.length > 0) {
      console.log(`${GRAY_DIM}${ctx.history.length} messages${RESET}`);
    }
    console.log();
    showPrompt();
  };

  // Open team chat submenu - shows location team chats
  const openTeamMenu = async () => {
    if (!ctx.storeId) return false;

    // Load all location team chats from database
    const locationChats = await loadLocationTeamChats(ctx.storeId);
    if (locationChats.length === 0) return false;

    submenu = {
      visible: true,
      type: 'team',
      title: 'Team Chats',
      items: locationChats.map(chat => ({
        label: chat.name,
        icon: ctx.locationId === chat.locationId ? `${GREEN}●${RESET}` : `${GRAY_DIM}○${RESET}`,
        data: chat,
      })),
      index: Math.max(0, locationChats.findIndex(c => c.locationId === ctx.locationId)),
      hint: '↑↓ navigate · enter select · esc cancel',
      onSelect: async (item) => {
        // Switch to team chat mode
        ctx.chatType = 'team';
        ctx.chatName = item.data.name;
        ctx.locationId = item.data.locationId;
        ctx.locationName = item.data.locationName;

        // Set team chat location context for AI
        ctx.teamChatLocation = {
          locationId: item.data.locationId,
          locationName: item.data.locationName
        };

        // Get or create the location team chat conversation
        const chatId = await getOrCreateLocationChat(ctx.auth?.accessToken, ctx.storeId, item.data.locationId);
        ctx.conversationId = chatId;

        // Load team chat history
        const teamHistory = await loadTeamChatHistory(chatId);

        // Clear screen and show team chat
        console.clear();
        console.log();
        console.log(`${WHITE}${BOLD}${item.data.name}${RESET}`);
        console.log();

        if (teamHistory.length === 0) {
          console.log(`${GRAY_DIM}No messages yet${RESET}`);
          console.log();
        } else {
          // Display team chat messages with clear visual separation
          for (const msg of teamHistory) {
            const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (msg.role === 'user') {
              const sender = msg.sender_name || 'Unknown';
              console.log(`${BLUE}${sender}${RESET}  ${GRAY_DIM}${time}${RESET}`);
              console.log(`${msg.content}`);
              console.log();
            } else {
              console.log(`${GREEN}Lisa${RESET}  ${GRAY_DIM}${time}${RESET}`);
              const lines = msg.content.split('\n');
              for (const line of lines) {
                console.log(line);
              }
              console.log();
            }
          }
        }

        console.log(`${GRAY_DIM}@lisa to ask · /team to switch · /lisa for private chat${RESET}`);
        console.log();
      },
    };
    return true;
  };

  // Load all location team chats for the store
  async function loadLocationTeamChats(storeId) {
    // Get all location chats with their location info
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/lisa_conversations?store_id=eq.${storeId}&chat_type=eq.location&select=id,title,location_id,message_count,locations(id,name)&order=title.asc`,
      { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
    );

    if (!res.ok) return [];

    const chats = await res.json();
    return chats.map(c => ({
      id: c.id,
      name: c.locations?.name ? `${c.locations.name} Team` : c.title,
      locationId: c.location_id,
      locationName: c.locations?.name || 'Unknown',
      messageCount: c.message_count || 0,
    })).sort((a, b) => a.locationName.localeCompare(b.locationName));
  }

  // Get or create location team chat
  async function getOrCreateLocationChat(accessToken, storeId, locationId) {
    // First try to find existing location chat
    const findRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lisa_conversations?store_id=eq.${storeId}&location_id=eq.${locationId}&chat_type=eq.location&select=id&limit=1`,
      { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
    );

    if (findRes.ok) {
      const existing = await findRes.json();
      if (existing.length > 0) {
        return existing[0].id;
      }
    }

    // Create new location chat
    const location = ctx.auth.locations.find(l => l.id === locationId);
    const createRes = await fetch(
      `${SUPABASE_URL}/rest/v1/lisa_conversations`,
      {
        method: "POST",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          store_id: storeId,
          location_id: locationId,
          chat_type: "location",
          title: `${location?.name || 'Location'} Team`,
          status: "active"
        })
      }
    );

    if (createRes.ok) {
      const created = await createRes.json();
      return created[0].id;
    }

    throw new Error("Failed to create location chat");
  }

  // Load team chat history
  async function loadTeamChatHistory(conversationId, limit = 20) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/lisa_messages?conversation_id=eq.${conversationId}&select=id,role,content,created_at,sender_id&order=created_at.desc&limit=${limit}`,
      { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
    );

    if (!res.ok) return [];

    const msgs = await res.json();

    // Get sender emails from users table (uses auth_user_id)
    const senderIds = [...new Set(msgs.filter(m => m.sender_id).map(m => m.sender_id))];
    const emailMap = {};

    if (senderIds.length > 0) {
      // Batch fetch user emails
      const idsFilter = senderIds.map(id => `auth_user_id.eq.${id}`).join(',');
      const userRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?or=(${idsFilter})&select=auth_user_id,email,first_name`,
        { headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` } }
      );
      if (userRes.ok) {
        const users = await userRes.json();
        for (const u of users) {
          emailMap[u.auth_user_id] = u.first_name || u.email?.split('@')[0] || 'Unknown';
        }
      }
    }

    return msgs.reverse().map(m => ({
      ...m,
      sender_name: emailMap[m.sender_id] || null
    }));
  }

  // Execute selected command or send message
  const submit = async () => {
    const input = inputBuffer.trim();
    const hadMenu = menuVisible;
    const hadSubmenu = submenu.visible;
    const submenuType = submenu.type;
    const selectedItem = hadMenu && menuItems.length > 0 ? menuItems[menuIndex] : null;
    const selectedSubmenuItem = hadSubmenu && submenu.items.length > 0 ? submenu.items[submenu.index] : null;
    const submenuCallback = submenu.onSelect;

    // Clear state
    inputBuffer = "";
    closeMenu();
    closeSubmenu();

    // Clear the menu from display
    process.stdout.write('\r\x1b[J');

    // Handle submenu selection (all submenus now use onSelect callback)
    if (selectedSubmenuItem && submenuCallback) {
      await submenuCallback(selectedSubmenuItem);
      showPrompt();
      return;
    }

    if (!input && !selectedItem) {
      showPrompt();
      return;
    }

    // If we had a command menu selection, execute that command
    if (selectedItem) {
      // Commands that open submenus (don't echo - menu replaces input)
      if (selectedItem.cmd === "/history") {
        if (await openHistoryMenu()) {
          render();
        } else {
          process.stdout.write(`${getPrompt()}${selectedItem.cmd}\n`);
          console.log(`  ${GRAY_DIM}No messages in history${RESET}\n`);
          showPrompt();
        }
        return;
      }

      if (selectedItem.cmd === "/location" || selectedItem.cmd === "/locations") {
        if (openLocationMenu()) {
          render();
        } else {
          process.stdout.write(`${getPrompt()}${selectedItem.cmd}\n`);
          console.log(`  ${GRAY_DIM}No locations available. Login first.${RESET}\n`);
          showPrompt();
        }
        return;
      }

      if (selectedItem.cmd === "/team") {
        if (await openTeamMenu()) {
          render();
        } else {
          process.stdout.write(`${getPrompt()}${selectedItem.cmd}\n`);
          console.log(`  ${GRAY_DIM}Team chat not available${RESET}\n`);
          showPrompt();
        }
        return;
      }

      if (selectedItem.cmd === "/lisa") {
        await switchToPrivateChat();
        return;
      }

      // Echo command for other commands
      process.stdout.write(`${getPrompt()}${selectedItem.cmd}\n`);
      isProcessing = true;
      await executeCommand(selectedItem);
      isProcessing = false;
      process.stdout.write('\n');
      showPrompt();
      return;
    }

    // Handle commands that open submenus (don't echo - menu replaces input)
    if (input === "/history") {
      if (await openHistoryMenu()) {
        render();
      } else {
        process.stdout.write(`${getPrompt()}${input}\n`);
        console.log(`  ${GRAY_DIM}No messages in history${RESET}\n`);
        showPrompt();
      }
      return;
    }

    if (input === "/location" || input === "/locations") {
      if (openLocationMenu()) {
        render();
      } else {
        process.stdout.write(`${getPrompt()}${input}\n`);
        console.log(`  ${GRAY_DIM}No locations available. Login first.${RESET}\n`);
        showPrompt();
      }
      return;
    }

    if (input === "/team") {
      if (await openTeamMenu()) {
        render();
      } else {
        process.stdout.write(`${getPrompt()}${input}\n`);
        console.log(`  ${GRAY_DIM}Team chat not available${RESET}\n`);
        showPrompt();
      }
      return;
    }

    if (input === "/lisa") {
      // Already in private chat, just refresh
      await switchToPrivateChat();
      return;
    }

    // Echo the command for other inputs
    process.stdout.write(`${getPrompt()}${input}\n`);

    // Quick exit commands
    if (input === "/quit" || input === "/exit" || input === "/q") {
      console.log(`\n${DIM}Goodbye${RESET}\n`);
      process.exit(0);
    }

    if (input === "/logout") {
      clearAuth();
      clearSession();
      ctx.auth = null;
      console.log(`\n  ${GREEN}✓${RESET} ${GRAY}Logged out${RESET}\n`);
      showPrompt();
      return;
    }

    // Check for location shortcut
    if (input.startsWith("/loc:")) {
      const locName = input.slice(5).toLowerCase().replace(/-/g, ' ');
      const loc = ctx.auth?.locations?.find(l =>
        l.name.toLowerCase().includes(locName)
      );
      if (loc) {
        isProcessing = true;
        await executeCommand({ cmd: input, location: loc });
        isProcessing = false;
        process.stdout.write('\n');
        showPrompt();
        return;
      }
      console.log(`  ${RED}✗${RESET} ${GRAY}Location not found${RESET}\n`);
      showPrompt();
      return;
    }

    // Check for exact command match
    if (input.startsWith("/")) {
      const commands = getCommands();
      const exactMatch = commands.find(c => c.cmd === input);
      if (exactMatch) {
        isProcessing = true;
        await executeCommand(exactMatch);
        isProcessing = false;
        process.stdout.write('\n');
        showPrompt();
        return;
      }

      // Unknown command
      console.log(`  ${GRAY_DIM}Unknown command. Type${RESET} ${BLUE}/${RESET} ${GRAY_DIM}to see commands${RESET}\n`);
      showPrompt();
      return;
    }

    // Check if we're in team chat mode - handle non-command messages
    if (ctx.chatType === 'team' && !input.startsWith('/')) {
      // Handle @lisa to invoke AI in team chat
      if (input.toLowerCase().startsWith('@lisa ')) {
        const lisaPrompt = input.slice(6).trim();
        if (lisaPrompt) {
          isProcessing = true;

          // Show who's asking
          const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const sender = ctx.userEmail ? ctx.userEmail.split('@')[0] : 'You';
          console.log(`${BLUE}${sender}${RESET}  ${GRAY_DIM}${time}${RESET}`);
          console.log(`${input}`);
          console.log();

          // Save user message to team chat
          try {
            await sendTeamMessage(ctx.conversationId, input, true, lisaPrompt);
          } catch (err) {
            // Continue even if save fails
          }

          // Call Lisa AI and stream response
          const spinner = new Spinner("Lisa").run();
          try {
            const res = await sendTeamChatToLisa(lisaPrompt, ctx.conversationId);
            const aiResponse = await streamTeamResponse(res, spinner);

            // Save Lisa's response to team chat
            if (aiResponse) {
              await saveTeamAIResponse(ctx.conversationId, aiResponse);
            }
          } catch (err) {
            spinner.stop("Error", false);
            console.error(`${RED}Error: ${err.message}${RESET}\n`);
          }
          isProcessing = false;
          showPrompt();
          return;
        }
      }

      // Regular team chat message (not a command, not @lisa)
      isProcessing = true;
      try {
        await sendTeamMessage(ctx.conversationId, input, false);
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const sender = ctx.userEmail ? ctx.userEmail.split('@')[0] : 'You';
        console.log(`${BLUE}${sender}${RESET}  ${GRAY_DIM}${time}${RESET}`);
        console.log(`${input}`);
        console.log();
      } catch (err) {
        console.error(`${RED}Error: ${err.message}${RESET}\n`);
      }
      isProcessing = false;
      showPrompt();
      return;
    }

    // Regular message to Lisa (AI mode) - not a command
    if (!input.startsWith('/')) {
      isProcessing = true;
      const spinner = new Spinner("Thinking").run();
      try {
        const res = await sendMessage(input);
        await streamResponse(res, input, spinner);
      } catch (err) {
        spinner.stop("Error", false);
        console.error(`${RED}Error: ${err.message}${RESET}\n`);
      }
      isProcessing = false;

      process.stdout.write('\n');
      showPrompt();
      return;
    }
  };

  // Send team chat message
  async function sendTeamMessage(conversationId, content, invokeAI = false, aiPrompt = null) {
    // Only include sender_id if it's a valid UUID (not "test")
    const isValidUUID = ctx.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ctx.userId);

    const messageData = {
      conversation_id: conversationId,
      role: "user",
      content: content,
      is_ai_invocation: invokeAI,
    };

    if (isValidUUID) {
      messageData.sender_id = ctx.userId;
    }
    if (aiPrompt) {
      messageData.ai_prompt = aiPrompt;
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/lisa_messages`,
      {
        method: "POST",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify(messageData)
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to send message: ${err}`);
    }

    return res.json();
  }

  // Send message to Lisa AI for team chat
  async function sendTeamChatToLisa(message, conversationId) {
    const body = {
      store_id: ctx.storeId,
      message,
      history: [], // Team chat doesn't need history context - Lisa sees the conversation
      conversation_id: conversationId,
      chat_type: 'location', // Tell the agent this is a team chat
    };
    if (ctx.userId) body.user_id = ctx.userId;
    if (ctx.userEmail) body.user_email = ctx.userEmail;
    if (ctx.storeName) body.store_name = ctx.storeName;
    if (ctx.teamChatLocation?.locationId) body.location_id = ctx.teamChatLocation.locationId;
    if (ctx.teamChatLocation?.locationName) body.location_name = ctx.teamChatLocation.locationName;

    const token = ctx.auth?.accessToken || SERVICE_KEY;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agentic-loop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res;
  }

  // Stream response for team chat (similar to streamResponse but returns the text)
  async function streamTeamResponse(response, existingSpinner = null) {
    let fullText = "";
    let lineBuffer = "";
    let spinner = existingSpinner;
    let textStarted = false;

    const formatLine = (line) => {
      return line
        .replace(/(\$[\d,]+(?:\.\d+)?)/g, `${GREEN}$1${RESET}`)
        .replace(/(\d+\.?\d*%)/g, `${GRAY}$1${RESET}`)
        .replace(/(\+[\d.]+%|\+\$[\d,]+)/g, `${GREEN}$1${RESET}`)
        .replace(/(-[\d.]+%|-\$[\d,]+)/g, `${RED}$1${RESET}`);
    };

    for await (const event of parseSSE(response)) {
      switch (event.type) {
        case "text":
          if (event.content) {
            if (!textStarted) {
              if (spinner) {
                spinner.stop("Lisa", true);
                spinner = null;
              }
              textStarted = true;
              const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              console.log(`  ${GREEN}Lisa${RESET} ${GRAY_DIM}${time}${RESET}`);
            }

            lineBuffer += event.content;
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() || "";

            for (const line of lines) {
              console.log(`  ${formatLine(line)}`);
            }

            fullText += event.content;
          }
          break;

        case "tool_start":
          if (spinner) {
            spinner.stop(spinner.text, true);
            spinner = null;
          }
          const toolName = event.tool_name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          spinner = new Spinner(toolName).run();
          textStarted = false;
          break;

        case "tool_end":
          if (spinner) {
            spinner.stop(spinner.text, true);
            spinner = null;
          }
          break;

        case "error":
          if (spinner) spinner.stop("Error", false);
          console.error(`${RED}Error: ${event.message}${RESET}`);
          return null;
      }
    }

    // Output any remaining buffered text
    if (lineBuffer) {
      if (!textStarted) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        console.log(`  ${GREEN}Lisa${RESET} ${GRAY_DIM}${time}${RESET}`);
      }
      console.log(`  ${formatLine(lineBuffer)}`);
    }

    if (spinner) spinner.stop("Done", true);
    console.log();

    return fullText;
  }

  // Save Lisa's AI response to team chat
  async function saveTeamAIResponse(conversationId, content) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/lisa_messages`,
      {
        method: "POST",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          role: "assistant",
          content: content,
        })
      }
    );

    if (!res.ok) {
      console.error(`${GRAY_DIM}Warning: Could not save response to chat${RESET}`);
    }
  }

  // Setup raw mode for keypress handling
  emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    // Disable bracketed paste mode (causes [ ] artifacts)
    process.stdout.write('\x1b[?2004l');
  }

  // Initial prompt
  process.stdout.write('\n');
  showPrompt();

  process.stdin.on("keypress", async (str, key) => {
    if (isProcessing) return;

    // Handle special keys
    if (key) {
      // Ctrl+C - if input exists, clear it; otherwise exit
      if (key.ctrl && key.name === "c") {
        if (inputBuffer.length > 0 || menuVisible || submenu.visible) {
          inputBuffer = "";
          closeMenu();
          closeSubmenu();
          render();
        } else {
          process.stdout.write('\r\x1b[J');
          console.log(`\n${DIM}Goodbye${RESET}\n`);
          process.exit(0);
        }
        return;
      }

      // Escape - close menus, then clear input
      if (key.name === "escape") {
        if (submenu.visible) {
          closeSubmenu();
          process.stdout.write('\r\x1b[J');
          showPrompt();
        } else if (menuVisible) {
          closeMenu();
          render();
        } else if (inputBuffer.length > 0) {
          inputBuffer = "";
          render();
        }
        return;
      }

      // Enter to submit
      if (key.name === "return") {
        await submit();
        return;
      }

      // Backspace
      if (key.name === "backspace") {
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          updateMenu();
          render();
        }
        return;
      }

      // Ctrl+U - clear entire line (like bash)
      if (key.ctrl && key.name === "u") {
        inputBuffer = "";
        closeMenu();
        render();
        return;
      }

      // Arrow up - navigate menu or submenu
      if (key.name === "up") {
        if (submenu.visible && submenu.items.length > 0) {
          submenu.index = Math.max(0, submenu.index - 1);
          render();
          return;
        }
        if (menuVisible && menuItems.length > 0) {
          menuIndex = Math.max(0, menuIndex - 1);
          render();
          return;
        }
      }

      // Arrow down - navigate menu or submenu
      if (key.name === "down") {
        if (submenu.visible && submenu.items.length > 0) {
          submenu.index = Math.min(submenu.items.length - 1, submenu.index + 1);
          render();
          return;
        }
        if (menuVisible && menuItems.length > 0) {
          menuIndex = Math.min(menuItems.length - 1, menuIndex + 1);
          render();
          return;
        }
      }

      // Tab - autocomplete/select if single match
      if (key.name === "tab" && menuVisible && menuItems.length === 1) {
        inputBuffer = menuItems[0].cmd;
        updateMenu();
        render();
        return;
      }
    }

    // Regular character input
    if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
      // Close submenu if typing
      if (submenu.visible) {
        closeSubmenu();
        process.stdout.write('\r\x1b[J');
        showPrompt();
      }
      inputBuffer += str;
      updateMenu();
      render();
    }
  });

  // Handle close
  process.stdin.on("close", () => {
    process.exit(0);
  });
}

// =============================================================================
// Commands
// =============================================================================

async function loginCmd() {
  console.log(`\n${BOLD}Lisa Login${RESET}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const lines = [];

  await new Promise((resolve) => {
    process.stdout.write(`  Email: `);
    rl.on("line", (line) => {
      lines.push(line);
      if (lines.length === 1) process.stdout.write(`  Password: `);
      if (lines.length >= 2) { rl.close(); resolve(); }
    });
    rl.on("close", resolve);
  });

  const [email, password] = lines;
  if (!email || !password) {
    console.error(`${RED}Email and password required${RESET}\n`);
    process.exit(1);
  }

  console.log(`\n${DIM}Signing in...${RESET}`);

  try {
    const auth = await signIn(email, password);
    const store = await getUserStore(auth.user.id);
    if (!store) throw new Error("No store found");

    const locations = await getStoreLocations(auth.accessToken, store.storeId);

    saveAuth({ ...auth, storeId: store.storeId, storeName: store.storeName, role: store.role, locations });

    console.log(`\n${GREEN}✓${RESET} Logged in as ${auth.user.email}`);
    console.log(`${DIM}  Store: ${store.storeName}${RESET}`);
    if (locations.length) console.log(`${DIM}  Locations: ${locations.map(l => l.name).join(", ")}${RESET}`);
    console.log();
  } catch (err) {
    console.error(`\n${RED}✗ ${err.message}${RESET}\n`);
    process.exit(1);
  }
}

async function logoutCmd() {
  clearAuth();
  clearSession();
  console.log(`\n${GREEN}✓${RESET} Logged out\n`);
}

async function whoamiCmd() {
  const auth = loadAuth();
  if (!auth?.user) {
    console.log(`\n${DIM}Not logged in. Run: lisa login${RESET}\n`);
    return;
  }
  console.log(`\n${BOLD}Lisa${RESET}\n`);
  console.log(`  Email: ${auth.user.email}`);
  console.log(`  Store: ${auth.storeName || "Unknown"}`);
  console.log(`  Role:  ${auth.role || "Unknown"}`);
  if (auth.locations?.length) console.log(`  Locations: ${auth.locations.map(l => l.name).join(", ")}`);
  console.log();
}

// =============================================================================
// Parse Args
// =============================================================================

function parseArgs(argv) {
  const args = { message: [], help: false, version: false, newSession: false, location: null };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") args.help = true;
    else if (arg === "-v" || arg === "--version") args.version = true;
    else if (arg === "-n" || arg === "--new") args.newSession = true;
    else if (arg === "-l" || arg === "--location") args.location = argv[++i];
    else if (!arg.startsWith("-")) args.message.push(arg);
  }

  args.message = args.message.join(" ");
  return args;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(`
${BOLD}Lisa${RESET} v${VERSION}

${BOLD}Usage:${RESET}
  lisa                     Interactive mode
  lisa "question"          Ask a question
  lisa --new "question"    New conversation

${BOLD}Commands:${RESET}
  lisa login               Sign in
  lisa logout              Sign out
  lisa whoami              Show user info

${BOLD}Options:${RESET}
  -h, --help               Show help
  -v, --version            Show version
  -n, --new                New conversation
  -l, --location NAME      Filter by location
`);
    process.exit(0);
  }

  if (args.version) {
    console.log(`Lisa v${VERSION}`);
    process.exit(0);
  }

  const cmd = args.message.toLowerCase();
  if (cmd === "login") { await loginCmd(); return; }
  if (cmd === "logout") { await logoutCmd(); return; }
  if (cmd === "whoami") { await whoamiCmd(); return; }

  const hasPrevious = await initSession(args);

  // Require login
  if (hasPrevious === null) {
    console.log();
    console.log(`  ${GRAY_DIM}Not logged in.${RESET}`);
    console.log(`  ${GRAY_DIM}Run${RESET} ${WHITE}lisa login${RESET} ${GRAY_DIM}to sign in.${RESET}`);
    console.log();
    process.exit(1);
  }

  if (!args.message) {
    await interactive(hasPrevious);
    return;
  }

  // Single query - show spinner immediately
  const spinner = new Spinner("Thinking").run();
  try {
    const res = await sendMessage(args.message);
    await streamResponse(res, args.message, spinner);
  } catch (err) {
    spinner.stop("Error", false);
    console.error(`${RED}Error: ${err.message}${RESET}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`${RED}Fatal: ${err.message}${RESET}`);
  process.exit(1);
});
