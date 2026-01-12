import { createDb } from "./db.js";
import { renderResults, setStatus } from "./ui.js";
import { computeTitle, debounce, extractTags, formatRelativeTime } from "./utils.js";

const dumpInput = document.getElementById("dumpInput");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");

const editorOverlay = document.getElementById("editorOverlay");
const editorMeta = document.getElementById("editorMeta");
const editorContent = document.getElementById("editorContent");
const closeEditorBtn = document.getElementById("closeEditorBtn");
const deleteEntryBtn = document.getElementById("deleteEntryBtn");
const footerEasterEgg = document.getElementById("footerEasterEgg");

let db = null;
let entries = [];
let filtered = [];
let openEntryId = null;

function sortNewestFirst(list) {
  return list.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function matchesQuery(entry, rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const inContent = entry.content?.toLowerCase().includes(q);
  const inTitle = entry.title?.toLowerCase().includes(q);
  const inTags = (entry.tags ?? []).some((t) => t.toLowerCase().includes(q));
  return Boolean(inContent || inTitle || inTags);
}

function refreshList() {
  const query = dumpInput.value;
  const base = sortNewestFirst(entries);
  filtered = query.trim() ? base.filter((e) => matchesQuery(e, query)) : base;

  renderResults(resultsEl, filtered, (id) => openEditor(id));
  setStatus(statusEl, `${filtered.length} result${filtered.length === 1 ? "" : "s"}`);
}

function showOverlay(show) {
  editorOverlay.classList.toggle("hidden", !show);
  editorOverlay.setAttribute("aria-hidden", show ? "false" : "true");
}

function getEntryById(id) {
  return entries.find((e) => e.id === id) ?? null;
}

async function saveEntry(entry) {
  await db.putEntry(entry);
}

async function addEntryFromInput() {
  const content = dumpInput.value;
  if (!content.trim()) return;

  const now = Date.now();
  const entry = {
    id: crypto.randomUUID(),
    content,
    title: computeTitle(content),
    tags: extractTags(content),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await saveEntry(entry);
    entries.unshift(entry);
    dumpInput.value = "";
    refreshList();
  } catch (e) {
    setStatus(statusEl, "IndexedDB error. Nothing saved.", "error");
  }
}

function openEditor(id) {
  const entry = getEntryById(id);
  if (!entry) return;

  openEntryId = id;
  editorContent.value = entry.content ?? "";
  editorMeta.textContent = `${formatRelativeTime(entry.createdAt)} • ${entry.tags?.length ? entry.tags.map((t) => `#${t}`).join(" ") : "no tags"}`;

  showOverlay(true);
  editorContent.focus();
}

function closeEditor() {
  openEntryId = null;
  showOverlay(false);
  dumpInput.focus();
}

const debouncedEditorSave = debounce(async () => {
  if (!openEntryId) return;
  const entry = getEntryById(openEntryId);
  if (!entry) return;

  const content = editorContent.value;
  const now = Date.now();
  const updated = {
    ...entry,
    content,
    title: computeTitle(content),
    tags: extractTags(content),
    updatedAt: now,
  };

  try {
    await saveEntry(updated);
    entries = entries.map((e) => (e.id === updated.id ? updated : e));
    editorMeta.textContent = `${formatRelativeTime(updated.createdAt)} • ${updated.tags?.length ? updated.tags.map((t) => `#${t}`).join(" ") : "no tags"}`;
    refreshList();
  } catch (e) {
    setStatus(statusEl, "IndexedDB error. Edit not saved.", "error");
  }
}, 450);

async function deleteOpenEntry() {
  if (!openEntryId) return;
  const entry = getEntryById(openEntryId);
  if (!entry) return;

  const ok = window.confirm("Delete this entry? This is permanent.");
  if (!ok) return;

  try {
    await db.deleteEntry(entry.id);
    entries = entries.filter((e) => e.id !== entry.id);
    closeEditor();
    refreshList();
  } catch (e) {
    setStatus(statusEl, "IndexedDB error. Delete failed.", "error");
  }
}

function setupShortcuts() {
  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const active = document.activeElement;
      const isTypingInField =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active?.getAttribute?.("contenteditable") === "true";

      if (!isTypingInField) {
        e.preventDefault();
        dumpInput.focus();
      }
    }

    if (e.key === "Escape") {
      if (!editorOverlay.classList.contains("hidden")) {
        e.preventDefault();
        closeEditor();
        return;
      }
      if (document.activeElement === dumpInput && dumpInput.value) {
        e.preventDefault();
        dumpInput.value = "";
        refreshList();
        return;
      }
    }

    if (!editorOverlay.classList.contains("hidden")) {
      const isDeleteCombo = (e.ctrlKey || e.metaKey) && e.key === "Backspace";
      if (isDeleteCombo) {
        e.preventDefault();
        deleteOpenEntry();
      }
    }
  });
}

function setupFooterEasterEgg() {
  let flipped = false;
  footerEasterEgg.addEventListener("click", () => {
    flipped = !flipped;
    footerEasterEgg.textContent = flipped
      ? "Local-only. No cloud. No regrets."
      : "Data is dumped locally in this browser.";
  });
}

async function boot() {
  setStatus(statusEl, "Loading…");
  try {
    db = await createDb();
    const all = await db.getAllEntries();
    entries = Array.isArray(all) ? all : [];
    refreshList();
  } catch (e) {
    setStatus(statusEl, "IndexedDB failed. App cannot run.", "error");
  }
}

dumpInput.addEventListener("input", () => refreshList());
dumpInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addEntryFromInput();
  }
});

editorContent.addEventListener("input", () => debouncedEditorSave());
editorContent.addEventListener("blur", () => debouncedEditorSave());

closeEditorBtn.addEventListener("click", () => closeEditor());
deleteEntryBtn.addEventListener("click", () => deleteOpenEntry());
editorOverlay.addEventListener("click", (e) => {
  if (e.target === editorOverlay) closeEditor();
});

setupShortcuts();
setupFooterEasterEgg();
boot();

