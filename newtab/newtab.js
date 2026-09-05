// newtab/newtab.js
import { getSettings, updateSettings, getTasks, saveTasks, evaluateFocusStatus } from '../shared/storage.js';
import { DEV_QUOTES, GRAPH_THEMES } from '../shared/constants.js';
import { fetchGitHubContributions, renderContributionGraph } from '../shared/github.js';

let appSettings = null;
let allTasks = [];
let currentFilter = 'all';
let selectedPriority = 'p2';
let focusTimerInterval = null;
let cachedContributionData = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Load initial settings and tasks
  appSettings = await getSettings();
  allTasks = await getTasks();

  // Initialize all subsystems
  initClock();
  initFocusManager();
  initTaskManager();
  initGitHubSection();
  initQuotes();
  updateStatsRibbon();

  // Setup Options button
  document.getElementById('btn-open-options').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.location.href = '../options/options.html';
    }
  });
});

/* ==========================================================
   1. CLOCK & HEADER
   ========================================================== */
function initClock() {
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');

  function update() {
    const now = new Date();
    const is24h = appSettings?.clockFormat !== '12h';

    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    if (!is24h) {
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      timeEl.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
    } else {
      timeEl.textContent = `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
    }

    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    dateEl.textContent = now.toLocaleDateString(undefined, options);
  }

  update();
  setInterval(update, 1000);
}

/* ==========================================================
   2. FOCUS & POMODORO CONTROL
   ========================================================== */
async function initFocusManager() {
  const dotEl = document.getElementById('focus-status-dot');
  const labelEl = document.getElementById('focus-status-text');
  const countdownEl = document.getElementById('focus-timer-countdown');
  const btn25 = document.getElementById('btn-quick-pomodoro');
  const btn50 = document.getElementById('btn-deep-work');
  const btnStop = document.getElementById('btn-stop-focus');

  async function refreshFocusState() {
    appSettings = await getSettings();
    const status = evaluateFocusStatus(appSettings);

    dotEl.className = 'focus-status-indicator';
    countdownEl.classList.add('hidden');
    btnStop.classList.add('hidden');
    btn25.classList.remove('hidden');
    btn50.classList.remove('hidden');

    if (status.reason === 'snooze') {
      dotEl.classList.add('snooze');
      labelEl.textContent = 'Break Snooze';
      countdownEl.classList.remove('hidden');
      tickCountdown(status.until);
    } else if (status.active) {
      dotEl.classList.add('active');
      labelEl.textContent = status.reason === 'schedule' ? 'Focus Hours' : 'Deep Focus';
      btnStop.classList.remove('hidden');
      btn25.classList.add('hidden');
      btn50.classList.add('hidden');

      if (status.until) {
        countdownEl.classList.remove('hidden');
        tickCountdown(status.until);
      }
    } else {
      labelEl.textContent = 'Focus Idle';
      if (focusTimerInterval) clearInterval(focusTimerInterval);
    }

    updateStatsRibbon(status);
  }

  function tickCountdown(targetMs) {
    if (focusTimerInterval) clearInterval(focusTimerInterval);

    function tick() {
      const now = Date.now();
      const diff = targetMs - now;
      if (diff <= 0) {
        countdownEl.textContent = '00:00';
        clearInterval(focusTimerInterval);
        refreshFocusState();
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      countdownEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    tick();
    focusTimerInterval = setInterval(tick, 1000);
  }

  btn25.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'START_FOCUS_SESSION', durationMinutes: 25 }, refreshFocusState);
    } else {
      appSettings.focusSession = { active: true, endTime: Date.now() + 25 * 60 * 1000, durationMinutes: 25 };
      await updateSettings(appSettings);
      refreshFocusState();
    }
  });

  btn50.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'START_FOCUS_SESSION', durationMinutes: 50 }, refreshFocusState);
    } else {
      appSettings.focusSession = { active: true, endTime: Date.now() + 50 * 60 * 1000, durationMinutes: 50 };
      await updateSettings(appSettings);
      refreshFocusState();
    }
  });

  btnStop.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'STOP_FOCUS_SESSION' }, refreshFocusState);
    } else {
      appSettings.focusSession = { active: false, endTime: null };
      await updateSettings(appSettings);
      refreshFocusState();
    }
  });

  await refreshFocusState();
}

/* ==========================================================
   3. DAILY TASK MANAGER
   ========================================================== */
function initTaskManager() {
  const form = document.getElementById('new-task-form');
  const input = document.getElementById('task-input-text');
  const tagSelect = document.getElementById('task-tag-select');
  const priorityBtns = document.querySelectorAll('.priority-btn');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const btnClearCompleted = document.getElementById('btn-clear-completed');

  // Priority buttons selector
  priorityBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      priorityBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPriority = btn.getAttribute('data-priority');
    });
  });

  // Filter tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      renderTasks();
    });
  });

  // Add task form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const newTask = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      text,
      completed: false,
      priority: selectedPriority,
      tag: tagSelect.value,
      createdAt: Date.now(),
      completedAt: null
    };

    allTasks.unshift(newTask);
    await saveTasks(allTasks);

    input.value = '';
    renderTasks();
  });

  // Clear completed
  btnClearCompleted.addEventListener('click', async () => {
    allTasks = allTasks.filter(t => !t.completed);
    await saveTasks(allTasks);
    renderTasks();
  });

  renderTasks();
}

function renderTasks() {
  const listEl = document.getElementById('task-list');
  const emptyEl = document.getElementById('empty-tasks-state');
  const activeBadge = document.getElementById('active-task-badge');
  const progressBar = document.getElementById('task-progress-bar');
  const progressLabel = document.getElementById('progress-percent-label');

  listEl.innerHTML = '';

  const pendingCount = allTasks.filter(t => !t.completed).length;
  activeBadge.textContent = `${pendingCount} pending`;

  // Filter tasks
  let filtered = [...allTasks];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (currentFilter === 'active') {
    filtered = filtered.filter(t => !t.completed);
  } else if (currentFilter === 'completed') {
    filtered = filtered.filter(t => t.completed);
  } else if (currentFilter === 'today') {
    filtered = filtered.filter(t => t.createdAt >= todayStart.getTime());
  }

  // Update progress bar
  const total = allTasks.length;
  const completedCount = allTasks.filter(t => t.completed).length;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  progressBar.style.width = `${percent}%`;
  progressLabel.textContent = `${completedCount} of ${total} tasks finished (${percent}%)`;

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
  }

  filtered.forEach(task => {
    const li = document.createElement('li');
    li.className = `task-item ${task.completed ? 'completed' : ''}`;
    li.setAttribute('data-id', task.id);

    const timeAgo = formatTimeAgo(task.createdAt);

    li.innerHTML = `
      <div class="task-item-left">
        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
        <div class="task-content-wrapper">
          <span class="task-text">${escapeHtml(task.text)}</span>
          <div class="task-badges">
            <span class="priority-pill ${task.priority}">${task.priority.toUpperCase()}</span>
            <span class="tag-pill">${escapeHtml(task.tag)}</span>
            <span class="task-time">${timeAgo}</span>
          </div>
        </div>
      </div>
      <div class="task-item-actions">
        <button class="btn-task-del" title="Delete Task">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Toggle complete
    const checkbox = li.querySelector('.task-checkbox');
    checkbox.addEventListener('change', async () => {
      task.completed = checkbox.checked;
      task.completedAt = checkbox.checked ? Date.now() : null;

      if (task.completed) {
        // Increment stats
        const currentStats = appSettings.stats || {};
        currentStats.tasksCompletedCount = (currentStats.tasksCompletedCount || 0) + 1;
        await updateSettings({ stats: currentStats });
      }

      await saveTasks(allTasks);
      renderTasks();
      updateStatsRibbon();
    });

    // Delete task
    const delBtn = li.querySelector('.btn-task-del');
    delBtn.addEventListener('click', async () => {
      allTasks = allTasks.filter(t => t.id !== task.id);
      await saveTasks(allTasks);
      renderTasks();
      updateStatsRibbon();
    });

    listEl.appendChild(li);
  });
}

/* ==========================================================
   4. GITHUB CONTRIBUTION GRAPH
   ========================================================== */
async function initGitHubSection() {
  const username = appSettings.github?.username || 'torvalds';
  const token = appSettings.github?.token || '';
  const currentTheme = appSettings.github?.theme || 'github-dark';

  const userHeader = document.getElementById('github-username-header');
  const userLabel = document.getElementById('github-user-label');
  const profileLink = document.getElementById('github-profile-link');
  const themeSelect = document.getElementById('graph-theme-select');
  const btnRefresh = document.getElementById('btn-refresh-github');
  const demoIndicator = document.getElementById('demo-indicator');

  userHeader.textContent = `${username}'s Activity`;
  userLabel.textContent = `@${username}`;
  profileLink.href = `https://github.com/${encodeURIComponent(username)}`;
  themeSelect.value = currentTheme;

  // Theme selector event
  themeSelect.addEventListener('change', async () => {
    const newTheme = themeSelect.value;
    appSettings.github.theme = newTheme;
    await updateSettings({ github: appSettings.github });
    if (cachedContributionData) {
      renderHeatmap(cachedContributionData, newTheme);
    }
  });

  // Refresh button
  btnRefresh.addEventListener('click', async () => {
    btnRefresh.classList.add('spin');
    await loadAndRenderContributions(true);
    btnRefresh.classList.remove('spin');
  });

  await loadAndRenderContributions(false);
}

async function loadAndRenderContributions(forceRefresh = false) {
  const container = document.getElementById('github-heatmap-container');
  const demoIndicator = document.getElementById('demo-indicator');
  const username = appSettings.github?.username || 'torvalds';
  const token = appSettings.github?.token || '';
  const theme = appSettings.github?.theme || 'github-dark';

  // Check cache if not forcing refresh
  const now = Date.now();
  const cache = appSettings.github?.cachedData;
  const cacheTs = appSettings.github?.cacheTimestamp;
  const isFresh = cacheTs && (now - cacheTs) < (appSettings.github?.cacheExpiry || 3600000);

  if (!forceRefresh && cache && isFresh && cache.username === username) {
    cachedContributionData = cache;
    renderHeatmap(cache, theme);
    if (cache.isMock) demoIndicator.classList.remove('hidden');
    else demoIndicator.classList.add('hidden');
    return;
  }

  container.innerHTML = '<div class="heatmap-skeleton">Fetching GitHub activity matrix...</div>';

  try {
    const data = await fetchGitHubContributions(username, token);
    cachedContributionData = data;

    // Cache results in storage
    appSettings.github.cachedData = data;
    appSettings.github.cacheTimestamp = now;
    await updateSettings({ github: appSettings.github });

    if (data.isMock) demoIndicator.classList.remove('hidden');
    else demoIndicator.classList.add('hidden');

    renderHeatmap(data, theme);
  } catch (err) {
    console.error("Failed to fetch contributions:", err);
    container.innerHTML = '<div class="heatmap-skeleton">Could not load GitHub data. Check network or options.</div>';
  }
}

function renderHeatmap(data, theme) {
  const container = document.getElementById('github-heatmap-container');
  const metricTotal = document.getElementById('metric-total-commits');
  const metricCurrentStreak = document.getElementById('metric-current-streak');
  const metricLongestStreak = document.getElementById('metric-longest-streak');

  metricTotal.textContent = Number(data.total || 0).toLocaleString();
  metricCurrentStreak.textContent = `${data.currentStreak || 0} days`;
  metricLongestStreak.textContent = `${data.longestStreak || 0} days`;

  renderContributionGraph(container, data.contributions, theme);
  updateStatsRibbon();
}

/* ==========================================================
   5. STATS RIBBON & QUOTES
   ========================================================== */
function updateStatsRibbon(focusStatus = null) {
  const status = focusStatus || evaluateFocusStatus(appSettings);
  const stateEl = document.getElementById('stat-focus-state');
  const tasksEl = document.getElementById('stat-tasks-progress');
  const streakEl = document.getElementById('stat-commit-streak');
  const blockedEl = document.getElementById('stat-blocked-count');

  if (status.reason === 'snooze') {
    stateEl.textContent = 'Break Snooze';
    stateEl.style.color = '#f59e0b';
  } else if (status.active) {
    stateEl.textContent = status.reason === 'schedule' ? 'Schedule ON' : 'Focus Mode';
    stateEl.style.color = '#10b981';
  } else {
    stateEl.textContent = 'Idle (Off)';
    stateEl.style.color = '#94a3b8';
  }

  const completedToday = allTasks.filter(t => t.completed).length;
  const totalTasks = allTasks.length;
  tasksEl.textContent = `${completedToday} / ${totalTasks}`;

  if (cachedContributionData) {
    streakEl.textContent = `🔥 ${cachedContributionData.currentStreak || 0} days`;
  }

  const blockedCount = appSettings?.stats?.blockedAttemptsCount || 0;
  blockedEl.textContent = `🛡️ ${blockedCount} blocked`;
}

function initQuotes() {
  const textEl = document.getElementById('dashboard-quote-text');
  const authorEl = document.getElementById('dashboard-quote-author');
  const btnNext = document.getElementById('btn-next-quote');

  function showRandomQuote() {
    const quote = DEV_QUOTES[Math.floor(Math.random() * DEV_QUOTES.length)];
    textEl.textContent = `"${quote.text}"`;
    authorEl.textContent = `— ${quote.author}`;
  }

  btnNext.addEventListener('click', showRandomQuote);
  showRandomQuote();
}

/* ==========================================================
   UTILITY HELPERS
   ========================================================== */
function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
