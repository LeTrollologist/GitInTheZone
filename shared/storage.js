// shared/storage.js
import { DEFAULT_SETTINGS } from './constants.js';

// Detect extension storage API (chrome.storage.local or browser.storage.local)
const hasExtensionStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

/**
 * Storage adapter supporting chrome.storage.local and local mock storage (for browser testing).
 */
export const storage = {
  async get(key) {
    if (hasExtensionStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve(result[key]);
        });
      });
    }
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : undefined;
    } catch {
      return undefined;
    }
  },

  async set(key, value) {
    if (hasExtensionStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      });
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Storage error:", e);
    }
  },

  async remove(key) {
    if (hasExtensionStorage) {
      return new Promise((resolve) => {
        chrome.storage.local.remove([key], () => resolve());
      });
    }
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error("Storage error:", e);
    }
  }
};

/**
 * Deep merge utility for settings defaults
 */
function deepMerge(target, source) {
  const output = { ...target };
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    Object.keys(source).forEach((key) => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  return output;
}

/**
 * Get extension settings merged with default fallback
 */
export async function getSettings() {
  const raw = await storage.get('settings');
  if (!raw) {
    await storage.set('settings', DEFAULT_SETTINGS);
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  return deepMerge(DEFAULT_SETTINGS, raw);
}

/**
 * Update extension settings partially
 */
export async function updateSettings(partial) {
  const current = await getSettings();
  const updated = deepMerge(current, partial);
  await storage.set('settings', updated);
  return updated;
}

/**
 * Get all tasks from storage
 */
export async function getTasks() {
  const tasks = await storage.get('tasks');
  if (!Array.isArray(tasks)) {
    // Initial starter tasks for developers
    const initialTasks = [
      {
        id: 'task-welcome-1',
        text: 'Review pull request and merge feature branch',
        completed: false,
        priority: 'p1',
        tag: '#review',
        createdAt: Date.now() - 3600000,
        completedAt: null
      },
      {
        id: 'task-welcome-2',
        text: 'Fix memory leak in background worker cache',
        completed: false,
        priority: 'p2',
        tag: '#bug',
        createdAt: Date.now() - 1800000,
        completedAt: null
      },
      {
        id: 'task-welcome-3',
        text: 'Plan Q3 API refactor & update OpenAPI specs',
        completed: true,
        priority: 'p3',
        tag: '#docs',
        createdAt: Date.now() - 7200000,
        completedAt: Date.now() - 1200000
      }
    ];
    await storage.set('tasks', initialTasks);
    return initialTasks;
  }
  return tasks;
}

/**
 * Save tasks to storage
 */
export async function saveTasks(tasks) {
  await storage.set('tasks', tasks);
  return tasks;
}

/**
 * Evaluates whether focus mode is currently active based on schedule, on-demand session, and snooze.
 */
export function evaluateFocusStatus(settings, dateObj = new Date()) {
  const nowMs = dateObj.getTime();

  // 1. Check emergency snooze pass
  if (settings.snooze?.active && settings.snooze.until && settings.snooze.until > nowMs) {
    return {
      active: false,
      reason: 'snooze',
      remainingMs: settings.snooze.until - nowMs,
      until: settings.snooze.until
    };
  }

  // 2. Check active on-demand focus session (Pomodoro or manual)
  if (settings.focusSession?.active && settings.focusSession.endTime && settings.focusSession.endTime > nowMs) {
    return {
      active: true,
      reason: settings.focusSession.mode || 'pomodoro',
      remainingMs: settings.focusSession.endTime - nowMs,
      until: settings.focusSession.endTime
    };
  }

  // 3. Check scheduled focus hours
  const schedule = settings.focusSchedule;
  if (schedule?.enabled && Array.isArray(schedule.days)) {
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    if (schedule.days.includes(dayOfWeek)) {
      const currentMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
      
      const [startH, startM] = (schedule.startTime || '09:00').split(':').map(Number);
      const [endH, endM] = (schedule.endTime || '17:00').split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      let isInsideHours = false;
      if (startMinutes <= endMinutes) {
        // Standard same-day interval (e.g. 09:00 to 17:00)
        isInsideHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      } else {
        // Overnight interval (e.g. 22:00 to 06:00)
        isInsideHours = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }

      if (isInsideHours) {
        // Calculate remaining minutes until schedule end
        let remainingMinutes = 0;
        if (currentMinutes < endMinutes) {
          remainingMinutes = endMinutes - currentMinutes;
        } else {
          remainingMinutes = (24 * 60 - currentMinutes) + endMinutes;
        }

        return {
          active: true,
          reason: 'schedule',
          remainingMs: remainingMinutes * 60 * 1000,
          until: nowMs + (remainingMinutes * 60 * 1000)
        };
      }
    }
  }

  return {
    active: false,
    reason: 'idle',
    remainingMs: null,
    until: null
  };
}

/**
 * Check if a URL matches any blocked domain or pattern in the blocklist.
 */
function normalizeBlockPattern(pattern) {
  let value = String(pattern || '').trim().toLowerCase();
  if (!value) return null;

  value = value
    .replace(/^https?:\/\//, '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '');

  let wildcard = false;
  if (value.startsWith('*.')) {
    wildcard = true;
    value = value.slice(2);
  }

  const slashIndex = value.indexOf('/');
  const rawHostname = slashIndex === -1 ? value : value.slice(0, slashIndex);
  const hostname = rawHostname.replace(/:\d+$/, '');
  const rawPath = slashIndex === -1 ? '' : value.slice(slashIndex);

  if (!hostname) return null;

  return {
    hostname,
    path: rawPath ? rawPath.replace(/\/+$/, '') || '/' : '',
    wildcard
  };
}

function hostnameMatches(hostname, patternHostname, wildcard = false) {
  if (hostname === patternHostname) return true;
  if (wildcard) return hostname.endsWith(`.${patternHostname}`);
  return hostname.endsWith(`.${patternHostname}`);
}

function pathMatches(pathname, patternPath) {
  if (!patternPath) return true;
  const normalizedPath = (pathname || '/').replace(/\/+$/, '') || '/';
  return normalizedPath === patternPath || normalizedPath.startsWith(`${patternPath}/`);
}

function isDeveloperHost(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '');

  if (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.test')
  ) {
    return true;
  }

  return (
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
    /^169\.254\./.test(normalized)
  );
}

export function isUrlBlocked(urlString, blocklist = []) {
  if (!urlString || typeof urlString !== 'string') return false;

  // Ignore internal and system pages
  if (
    urlString.startsWith('chrome://') ||
    urlString.startsWith('chrome-extension://') ||
    urlString.startsWith('moz-extension://') ||
    urlString.startsWith('about:') ||
    urlString.startsWith('edge://') ||
    urlString.startsWith('brave://') ||
    urlString.startsWith('view-source:')
  ) {
    return false;
  }

  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Whitelist localhost and private IPs for developer workflow
    if (isDeveloperHost(hostname)) {
      return false;
    }

    for (const pattern of blocklist) {
      const cleanPattern = normalizeBlockPattern(pattern);
      if (!cleanPattern) continue;

      if (
        hostnameMatches(hostname, cleanPattern.hostname, cleanPattern.wildcard) &&
        pathMatches(pathname, cleanPattern.path)
      ) {
        return true;
      }
    }
  } catch {
    // Malformed URL, do not block
    return false;
  }

  return false;
}
