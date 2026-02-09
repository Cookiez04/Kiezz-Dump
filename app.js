import { createDb } from "./db.js";
import { renderResults, setStatus } from "./ui.js";
import { computeTitle, debounce, extractTags, formatRelativeTime } from "./utils.js";

const dumpInput = document.getElementById("dumpInput");
const dumpBtn = document.getElementById("dumpBtn");
const dumpSuggestions = document.getElementById("dumpSuggestions");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");

const editorOverlay = document.getElementById("editorOverlay");
const editorMeta = document.getElementById("editorMeta");
const saveIndicator = document.getElementById("saveIndicator");
const editorSuggestions = document.getElementById("editorSuggestions");
const editorContent = document.getElementById("editorContent");
const closeEditorBtn = document.getElementById("closeEditorBtn");
const deleteEntryBtn = document.getElementById("deleteEntryBtn");
const footerEasterEgg = document.getElementById("footerEasterEgg");
const brandEgg = document.getElementById("brandEgg");
const brandSubtitle = document.getElementById("brandSubtitle");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

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
  updateAllSuggestions();
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
  updateSuggestionsFor(editorContent, editorSuggestions);

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

function getTagCounts(list) {
  const counts = new Map();
  for (const entry of list) {
    for (const tag of entry.tags ?? []) {
      const key = String(tag).toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function getFragmentInfo(textarea) {
  const value = textarea.value ?? "";
  const caret = textarea.selectionStart ?? 0;
  const upto = value.slice(0, caret);
  const match = /(^|\s)#([a-z0-9_-]*)$/i.exec(upto);
  if (!match) return null;
  const hashIndex = upto.lastIndexOf("#");
  return { hashIndex, fragment: match[2]?.toLowerCase() ?? "" };
}

function buildSuggestions(textarea, counts) {
  const tags = Array.from(counts.keys());
  if (!tags.length) return [];
  const fragmentInfo = getFragmentInfo(textarea);
  const used = new Set(extractTags(textarea.value));
  let candidates = tags;
  if (fragmentInfo) {
    const fragment = fragmentInfo.fragment;
    candidates = fragment
      ? tags.filter((t) => t.startsWith(fragment))
      : tags;
  } else {
    candidates = tags.filter((t) => !used.has(t));
  }
  const ranked = candidates.sort((a, b) => {
    const diff = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  return ranked.slice(0, 8);
}

function insertTagAtCursor(textarea, tag) {
  const value = textarea.value ?? "";
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const fragmentInfo = getFragmentInfo(textarea);
  let insert = `#${tag} `;
  let nextValue;
  let nextCursor;
  if (fragmentInfo) {
    const replaceStart = fragmentInfo.hashIndex;
    nextValue = value.slice(0, replaceStart) + insert + value.slice(end);
    nextCursor = replaceStart + insert.length;
  } else {
    const before = value.slice(0, start);
    const after = value.slice(end);
    if (before && !/\s$/.test(before)) {
      insert = ` ${insert}`;
    }
    nextValue = before + insert + after;
    nextCursor = before.length + insert.length;
  }
  textarea.value = nextValue;
  textarea.setSelectionRange(nextCursor, nextCursor);
  if (textarea === dumpInput) {
    autoGrow(dumpInput);
  }
}

function renderSuggestions(container, tags, onPick) {
  if (!container) return;
  container.innerHTML = "";
  if (!tags.length) {
    container.classList.add("hidden");
    return;
  }
  for (const tag of tags) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "suggestion-pill";
    pill.textContent = `#${tag}`;
    pill.addEventListener("click", () => onPick(tag));
    container.appendChild(pill);
  }
  container.classList.remove("hidden");
}

function updateSuggestionsFor(textarea, container) {
  if (!textarea || !container) return;
  const counts = getTagCounts(entries);
  const suggestions = buildSuggestions(textarea, counts);
  renderSuggestions(container, suggestions, (tag) => {
    insertTagAtCursor(textarea, tag);
    updateSuggestionsFor(textarea, container);
  });
}

function updateAllSuggestions() {
  updateSuggestionsFor(dumpInput, dumpSuggestions);
  if (!editorOverlay.classList.contains("hidden")) {
    updateSuggestionsFor(editorContent, editorSuggestions);
  }
}

function buildExportPayload() {
  return {
    version: 1,
    exportedAt: Date.now(),
    entries: sortNewestFirst(entries),
  };
}

function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatExportFilename() {
  const date = new Date().toISOString().slice(0, 10);
  return `kiezzdump-export-${date}.json`;
}

async function exportEntries() {
  const payload = buildExportPayload();
  downloadJsonFile(payload, formatExportFilename());
  setStatus(statusEl, `Exported ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
}

function normalizeImportedEntry(raw) {
  const now = Date.now();
  const content = typeof raw?.content === "string" ? raw.content : "";
  const createdAt = typeof raw?.createdAt === "number" ? raw.createdAt : now;
  const updatedAt = typeof raw?.updatedAt === "number" ? raw.updatedAt : createdAt;
  const id =
    typeof raw?.id === "string" && raw.id.trim() ? raw.id.trim() : crypto.randomUUID();
  const tags = Array.isArray(raw?.tags)
    ? raw.tags.filter((t) => typeof t === "string").map((t) => t.toLowerCase())
    : extractTags(content);
  const title = computeTitle(content);
  return {
    id,
    content,
    title,
    tags,
    createdAt,
    updatedAt,
  };
}

async function importEntriesFromFile(file) {
  if (!file || !db) return;
  const ok = window.confirm("Import will merge entries on this browser. Continue?");
  if (!ok) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const rawEntries = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (!Array.isArray(rawEntries)) {
      setStatus(statusEl, "Import failed. File format not recognized.", "error");
      return;
    }
    const byId = new Map(entries.map((e) => [e.id, e]));
    const toSave = [];
    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const raw of rawEntries) {
      const incoming = normalizeImportedEntry(raw);
      const existing = byId.get(incoming.id);
      if (!existing) {
        byId.set(incoming.id, incoming);
        toSave.push(incoming);
        added += 1;
        continue;
      }
      if ((incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
        byId.set(incoming.id, incoming);
        toSave.push(incoming);
        updated += 1;
      } else {
        skipped += 1;
      }
    }
    for (const entry of toSave) {
      await saveEntry(entry);
    }
    entries = Array.from(byId.values());
    refreshList();
    setStatus(
      statusEl,
      `Import done. Added ${added}, updated ${updated}, skipped ${skipped}.`
    );
  } catch (e) {
    setStatus(statusEl, "Import failed. Invalid JSON file.", "error");
  } finally {
    importFile.value = "";
  }
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
  updateSuggestionsFor(dumpInput, dumpSuggestions);
});
dumpInput.addEventListener("focus", () => updateSuggestionsFor(dumpInput, dumpSuggestions));
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
  updateSuggestionsFor(editorContent, editorSuggestions);
});
editorContent.addEventListener("focus", () =>
  updateSuggestionsFor(editorContent, editorSuggestions)
);
editorContent.addEventListener("blur", () => persistOpenEntry());

closeEditorBtn.addEventListener("click", () => closeEditor());
deleteEntryBtn.addEventListener("click", () => deleteOpenEntry());
editorOverlay.addEventListener("click", (e) => {
  if (e.target === editorOverlay) closeEditor();
});

setupShortcuts();
setupFooterEasterEgg();
setupBrandEasterEgg();
exportBtn?.addEventListener("click", () => exportEntries());
importBtn?.addEventListener("click", () => importFile?.click());
importFile?.addEventListener("change", (e) => {
  const file = e.target?.files?.[0];
  if (file) importEntriesFromFile(file);
});
boot();
