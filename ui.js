import { formatRelativeTime, truncateOneLine } from "./utils.js";

export function setStatus(el, message, type = "info") {
  el.textContent = message ?? "";
  el.classList.toggle("error", type === "error");
}

export function renderResults(container, entries, onOpenEntry, emptyMessage) {
  container.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyMessage ?? "Nothing here yet. Dump something.";
    container.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "result";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", "Open entry");

    const left = document.createElement("div");

    const title = document.createElement("div");
    title.className = "result-title";
    title.textContent = entry.title ?? truncateOneLine(entry.content, 80) ?? "(empty)";

    const meta = document.createElement("div");
    meta.className = "result-meta";

    if (entry.tags?.length) {
      for (const tag of entry.tags) {
        const pill = document.createElement("span");
        pill.className = "tag";
        pill.textContent = `#${tag}`;
        meta.appendChild(pill);
      }
    }

    left.appendChild(title);
    left.appendChild(meta);

    const date = document.createElement("div");
    date.className = "result-date";
    date.textContent = formatRelativeTime(entry.createdAt);

    row.appendChild(left);
    row.appendChild(date);

    const open = () => onOpenEntry(entry.id);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    container.appendChild(row);
  }
}
