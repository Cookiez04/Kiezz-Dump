import { createDb } from "./db.js";
import { renderResults, setStatus } from "./ui.js";
import { computeTitle, debounce, extractTags, formatRelativeTime } from "./utils.js";

const dumpInput = document.getElementById("dumpInput");
const dumpBtn = document.getElementById("dumpBtn");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");

const editorOverlay = document.getElementById("editorOverlay");
const editorMeta = document.getElementById("editorMeta");
const saveIndicator = document.getElementById("saveIndicator");
const editorContent = document.getElementById("editorContent");
const closeEditorBtn = document.getElementById("closeEditorBtn");
const deleteEntryBtn = document.getElementById("deleteEntryBtn");
const footerEasterEgg = document.getElementById("footerEasterEgg");
const brandEgg = document.getElementById("brandEgg");
const brandSubtitle = document.getElementById("brandSubtitle");

let db = null;
let entries = [];
let filtered = [];
let openEntryId = null;
let detachViewportListeners = null;

function sortNewestFirst(list) {
  return list.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function matchesQuery(entry, rawQuery) {
  const q = rawQuery.replace(/\s+/g, " ").trim().toLowerCase();
  if (!q) return true;

  const inContent = entry.content?.toLowerCase().includes(q);
  const inTitle = entry.title?.toLowerCase().includes(q);
  const inTags = (entry.tags ?? []).some((t) => t.toLowerCase().includes(q));
  return Boolean(inContent || inTitle || inTags);
}

function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
}

function setDumpEnabled() {
  if (!dumpBtn) return;
  dumpBtn.disabled = !dumpInput.value.trim();
}

function refreshList() {
  const query = dumpInput.value;
  const base = sortNewestFirst(entries);
  filtered = query.trim() ? base.filter((e) => matchesQuery(e, query)) : base;

  const emptyMessage = query.trim()
    ? "No matches. Try fewer words or a tag."
    : "Nothing here yet. Dump something.";
  renderResults(resultsEl, filtered, (id) => openEditor(id), emptyMessage);
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
    autoGrow(dumpInput);
    setDumpEnabled();
    refreshList();
  } catch (e) {
    setStatus(statusEl, "IndexedDB error. Nothing saved.", "error");
  }
}

function setSaveState(message, type = "info") {
  if (!saveIndicator) return;
  saveIndicator.textContent = message ?? "";
  saveIndicator.classList.toggle("error", type === "error");
}

function updateKeyboardInset() {
  const vv = window.visualViewport;
  if (!vv) return;
  const keyboard = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
  editorOverlay?.style?.setProperty("--kb", `${keyboard}px`);
}

function ensureEditorVisible() {
  if (!editorContent) return;
  editorContent.scrollIntoView({ block: "nearest" });
}

function attachKeyboardAvoidance() {
  const vv = window.visualViewport;
  if (!vv || !editorOverlay) return () => {};

  const onViewportChange = () => {
    updateKeyboardInset();
    ensureEditorVisible();
  };

  vv.addEventListener("resize", onViewportChange);
  vv.addEventListener("scroll", onViewportChange);
  updateKeyboardInset();

  return () => {
    vv.removeEventListener("resize", onViewportChange);
    vv.removeEventListener("scroll", onViewportChange);
    editorOverlay.style.removeProperty("--kb");
  };
}

function openEditor(id) {
  const entry = getEntryById(id);
  if (!entry) return;

  openEntryId = id;
  editorContent.value = entry.content ?? "";
  editorMeta.textContent = `${formatRelativeTime(entry.createdAt)} • ${entry.tags?.length ? entry.tags.map((t) => `#${t}`).join(" ") : "no tags"}`;
  setSaveState("Saved");

  showOverlay(true);
  editorContent.focus();

  if (detachViewportListeners) detachViewportListeners();
  detachViewportListeners = attachKeyboardAvoidance();
}

async function persistOpenEntry() {
  if (!openEntryId) return;
  const entry = getEntryById(openEntryId);
  if (!entry) return;

  const content = editorContent.value;
  if (content === entry.content) return;

  setSaveState("Saving…");

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
    setSaveState("Saved");
    refreshList();
  } catch (e) {
    setSaveState("Save failed", "error");
    throw e;
  }
}

async function closeEditor() {
  try {
    await persistOpenEntry();
  } catch {
  }

  if (detachViewportListeners) {
    detachViewportListeners();
    detachViewportListeners = null;
  }

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
    setSaveState("Saved");
    refreshList();
  } catch (e) {
    setStatus(statusEl, "IndexedDB error. Edit not saved.", "error");
    setSaveState("Save failed", "error");
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
    await closeEditor();
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
        autoGrow(dumpInput);
        setDumpEnabled();
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

function setupBrandEasterEgg() {
  if (!brandEgg || !brandSubtitle) return;
  let mode = 0;
  const lines = [
    "searchable brain exhaust",
    "dump now. regret later.",
    "zero sync. zero mercy.",
  ];
  brandEgg.addEventListener("click", () => {
    mode = (mode + 1) % lines.length;
    brandSubtitle.textContent = lines[mode];
  });
}

async function boot() {
  setStatus(statusEl, "Loading…");
  try {
    db = await createDb();
    const all = await db.getAllEntries();
    entries = Array.isArray(all) ? all : [];
    autoGrow(dumpInput);
    setDumpEnabled();
    refreshList();
  } catch (e) {
    setStatus(statusEl, "IndexedDB failed. App cannot run.", "error");
  }
}

dumpInput.addEventListener("input", () => {
  autoGrow(dumpInput);
  setDumpEnabled();
  refreshList();
});
dumpInput.addEventListener("keydown", (e) => {
  const isSubmitCombo = (e.ctrlKey || e.metaKey) && e.key === "Enter";
  if (isSubmitCombo) {
    e.preventDefault();
    addEntryFromInput();
  }
});

dumpBtn?.addEventListener("click", () => addEntryFromInput());

editorContent.addEventListener("input", () => {
  setSaveState("Saving…");
  debouncedEditorSave();
});
editorContent.addEventListener("blur", () => persistOpenEntry());

closeEditorBtn.addEventListener("click", () => closeEditor());
deleteEntryBtn.addEventListener("click", () => deleteOpenEntry());
editorOverlay.addEventListener("click", (e) => {
  if (e.target === editorOverlay) closeEditor();
});

setupShortcuts();
setupFooterEasterEgg();
setupBrandEasterEgg();
boot();
