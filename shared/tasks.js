export const TASK_TAGS = ['#code', '#bug', '#review', '#feature', '#docs', '#infra', '#learning'];

const PRIORITY_WEIGHT = {
  p1: 1,
  p2: 2,
  p3: 3
};

export function normalizePriority(priority, fallback = 'p2') {
  const normalized = String(priority || '').trim().toLowerCase();
  return Object.hasOwn(PRIORITY_WEIGHT, normalized) ? normalized : fallback;
}

export function normalizeTag(tag, fallback = '#code') {
  const normalized = String(tag || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

export function parseTaskInput(rawText, options = {}) {
  const fallbackPriority = normalizePriority(options.fallbackPriority, 'p2');
  const fallbackTag = normalizeTag(options.fallbackTag, '#code');
  const tokens = String(rawText || '').trim().split(/\s+/).filter(Boolean);

  let priority = fallbackPriority;
  let tag = fallbackTag;
  let consumedPriority = false;
  let consumedTag = false;
  const textTokens = [];

  tokens.forEach((token) => {
    const normalized = token.toLowerCase();

    if (!consumedPriority && /^p[123]$/.test(normalized)) {
      priority = normalized;
      consumedPriority = true;
      return;
    }

    if (!consumedPriority && /^!{1,3}$/.test(token)) {
      priority = token.length >= 2 ? 'p1' : 'p2';
      consumedPriority = true;
      return;
    }

    if (!consumedTag && /^#[a-z0-9][a-z0-9_-]*$/i.test(token)) {
      tag = normalizeTag(normalized, fallbackTag);
      consumedTag = true;
      return;
    }

    textTokens.push(token);
  });

  const text = textTokens.join(' ').trim();
  return {
    text: text || String(rawText || '').trim(),
    priority,
    tag
  };
}

export function createTask(rawText, options = {}) {
  const parsed = parseTaskInput(rawText, options);
  const now = options.now || Date.now();

  return {
    id: `task-${now}-${Math.random().toString(36).slice(2, 6)}`,
    text: parsed.text,
    completed: false,
    priority: parsed.priority,
    tag: parsed.tag,
    createdAt: now,
    completedAt: null
  };
}

export function sortTasksForDisplay(tasks = []) {
  return [...tasks].sort((a, b) => {
    if (!!a.completed !== !!b.completed) {
      return a.completed ? 1 : -1;
    }

    if (!a.completed && !b.completed) {
      const priorityDiff = (PRIORITY_WEIGHT[a.priority] || 2) - (PRIORITY_WEIGHT[b.priority] || 2);
      if (priorityDiff !== 0) return priorityDiff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    }

    return (b.completedAt || b.createdAt || 0) - (a.completedAt || a.createdAt || 0);
  });
}
