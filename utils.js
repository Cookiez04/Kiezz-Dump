export function extractTags(content) {
  const tags = new Set();
  const regex = /(^|\s)#([a-z0-9][a-z0-9_-]*)/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const tag = match[2].toLowerCase();
    if (tag) tags.add(tag);
  }
  return Array.from(tags);
}

export function computeTitle(content) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const firstLine = trimmed.split(/\r?\n/, 1)[0].trim();
  if (firstLine) return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;

  const flat = trimmed.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
}

export function truncateOneLine(text, maxLen) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, maxLen)}…`;
}

export function formatRelativeTime(timestampMs, nowMs = Date.now()) {
  const diffMs = nowMs - timestampMs;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 8) return `${week}w ago`;
  const month = Math.floor(day / 30);
  if (month < 24) return `${month}mo ago`;
  const year = Math.floor(day / 365);
  return `${year}y ago`;
}

export function debounce(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), waitMs);
  };
}

