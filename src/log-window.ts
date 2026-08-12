import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

const MAX_LINES = 2000;
const viewport = document.getElementById("logViewport")!;
const searchInput = document.getElementById("searchInput") as HTMLInputElement;
const searchCount = document.getElementById("searchCount")!;
const autoScrollBtn = document.getElementById("autoScrollBtn")!;
const clearBtn = document.getElementById("clearBtn")!;
const closeBtn = document.getElementById("closeBtn")!;
const lineCount = document.getElementById("lineCount")!;
const emptyState = document.getElementById("emptyState")!;
const statusBadge = document.getElementById("statusBadge")!;

closeBtn.addEventListener("click", () => {
  getCurrentWindow().close();
});

interface LogLine {
  line: string;
  timestamp: number;
}

let allLines: LogLine[] = [];
let autoScroll = true;
let filterText = "";
/** How many of `allLines` already have DOM nodes appended. Lets the hot path
 * (a log event per line during a fast scan) append incrementally instead of
 * re-rendering the whole list every event. */
let renderedCount = 0;
/** Set when the ring buffer dropped the oldest lines (offsets shift). */
let truncated = false;

// Auto-scroll detection
viewport.addEventListener("scroll", () => {
  const atBottom =
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24;
  if (atBottom !== autoScroll) {
    autoScroll = atBottom;
    autoScrollBtn.classList.toggle("active", autoScroll);
  }
});

autoScrollBtn.addEventListener("click", () => {
  autoScroll = true;
  autoScrollBtn.classList.add("active");
  viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
});

clearBtn.addEventListener("click", () => {
  allLines = [];
  renderedCount = 0;
  truncated = false;
  render();
});

searchInput.addEventListener("input", () => {
  filterText = searchInput.value.toLowerCase();
  render();
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const re = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  return escaped.replace(
    re,
    '<mark style="background:color-mix(in srgb,var(--primary) 28%,transparent);color:var(--primary);border-radius:2px;padding:0 1px">$1</mark>',
  );
}

function getLevelClass(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("error") || l.includes("failed") || l.includes("fatal"))
    return " level-error";
  if (l.includes("warn")) return " level-warn";
  return "";
}

function buildLine(l: LogLine, baseTs: number, query: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "log-line" + (query ? " highlight" : "") + getLevelClass(l.line);
  const relMs = l.timestamp - baseTs;
  const s = (relMs / 1000).toFixed(1);
  div.innerHTML = `<span class="ts">+${s}s</span>${highlightMatch(l.line, query)}`;
  return div;
}

function render() {
  const empty = allLines.length === 0;

  if (empty) {
    emptyState.style.display = "flex";
    viewport.querySelectorAll(".log-line").forEach((el) => el.remove());
    renderedCount = 0;
    lineCount.textContent = "0 lines";
    searchCount.textContent = "";
    return;
  }

  emptyState.style.display = "none";

  // Search filters the whole list, so a filtering change warrants a full
  // rebuild. Otherwise the common path just appends newly-arrived lines.
  const needFullRebuild =
    filterText !== "" || truncated || renderedCount > allLines.length;

  const baseTs = filterText
    ? (allLines.find((l) => l.line.toLowerCase().includes(filterText))?.timestamp ??
      allLines[0].timestamp)
    : allLines[0].timestamp;

  if (needFullRebuild) {
    viewport.querySelectorAll(".log-line").forEach((el) => el.remove());
    const frag = document.createDocumentFragment();
    for (const l of allLines) {
      if (filterText && !l.line.toLowerCase().includes(filterText)) continue;
      frag.appendChild(buildLine(l, baseTs, filterText));
    }
    viewport.appendChild(frag);
    renderedCount = allLines.length;
    truncated = false;
  } else if (renderedCount < allLines.length) {
    const frag = document.createDocumentFragment();
    for (let i = renderedCount; i < allLines.length; i++) {
      frag.appendChild(buildLine(allLines[i], baseTs, filterText));
    }
    viewport.appendChild(frag);
    renderedCount = allLines.length;
  }

  const filtered = filterText
    ? allLines.filter((l) => l.line.toLowerCase().includes(filterText))
    : allLines;
  lineCount.textContent = `${filtered.length}${filterText ? ` / ${allLines.length}` : ""} lines`;
  searchCount.textContent = filterText
    ? `${filtered.length} match${filtered.length !== 1 ? "es" : ""}`
    : "";

  if (autoScroll) {
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }
}

// Listen to log events from the main window's Aether process
await listen<LogLine>("aether://log", (event) => {
  allLines.push(event.payload);
  if (allLines.length > MAX_LINES) {
    allLines = allLines.slice(-MAX_LINES);
    truncated = true;
  }
  render();
});

// Listen to status events for the badge
await listen<{ state: string }>("aether://status", (event) => {
  const state = event.payload.state;
  statusBadge.textContent = state;

  const colors: Record<string, { bg: string; fg: string }> = {
    Connected: { bg: "rgba(34,197,94,0.15)", fg: "#4ade80" },
    Error: { bg: "rgba(248,113,113,0.15)", fg: "#f87171" },
    Connecting: { bg: "rgba(251,191,36,0.15)", fg: "#fbbf24" },
    Launching: { bg: "rgba(251,191,36,0.15)", fg: "#fbbf24" },
    Reconnecting: { bg: "rgba(251,146,60,0.15)", fg: "#fb923c" },
  };

  const c = colors[state] ?? { bg: "rgba(99,102,241,0.15)", fg: "#818cf8" };
  statusBadge.style.background = c.bg;
  statusBadge.style.color = c.fg;
});
