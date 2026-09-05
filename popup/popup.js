// popup/popup.js
import { getSettings, updateSettings, getTasks, saveTasks, evaluateFocusStatus } from '../shared/storage.js';

let appSettings = null;
let allTasks = [];
let popupTimerInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  appSettings = await getSettings();
  allTasks = await getTasks();

  initFocusControls();
  initTasksQuickList();
  initStats();
  initNavLinks();
});

function initFocusControls() {
  const dotEl = document.getElementById('popup-status-dot');
  const textEl = document.getElementById('popup-status-text');
  const timerBadge = document.getElementById('popup-timer-badge');
  const btn25 = document.getElementById('popup-btn-25');
  const btn50 = document.getElementById('popup-btn-50');
  const btnStop = document.getElementById('popup-btn-stop');

  async function refresh() {
    appSettings = await getSettings();
    const status = evaluateFocusStatus(appSettings);

    dotEl.className = 'status-dot';
    timerBadge.classList.add('hidden');
    btnStop.classList.add('hidden');
    btn25.classList.remove('hidden');
    btn50.classList.remove('hidden');

    if (status.reason === 'snooze') {
      dotEl.classList.add('snooze');
      textEl.textContent = 'Break Snooze';
      timerBadge.classList.remove('hidden');
      tickCountdown(status.until);
    } else if (status.active) {
      dotEl.classList.add('active');
      textEl.textContent = status.reason === 'schedule' ? 'In The Zone' : 'Deep Focus';
      btnStop.classList.remove('hidden');
      btn25.classList.add('hidden');
      btn50.classList.add('hidden');

      if (status.until) {
        timerBadge.classList.remove('hidden');
        tickCountdown(status.until);
      }
    } else {
      textEl.textContent = 'Focus Idle';
      if (popupTimerInterval) clearInterval(popupTimerInterval);
    }
  }

  function tickCountdown(targetMs) {
    if (popupTimerInterval) clearInterval(popupTimerInterval);

    function tick() {
      const now = Date.now();
      const diff = targetMs - now;
      if (diff <= 0) {
        timerBadge.textContent = '00:00';
        clearInterval(popupTimerInterval);
        refresh();
        return;
      }
      const totalSec = Math.floor(diff / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      timerBadge.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    tick();
    popupTimerInterval = setInterval(tick, 1000);
  }

  btn25.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'START_FOCUS_SESSION', durationMinutes: 25 }, refresh);
    } else {
      appSettings.focusSession = { active: true, endTime: Date.now() + 25 * 60 * 1000, durationMinutes: 25 };
      updateSettings(appSettings).then(refresh);
    }
  });

  btn50.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'START_FOCUS_SESSION', durationMinutes: 50 }, refresh);
    } else {
      appSettings.focusSession = { active: true, endTime: Date.now() + 50 * 60 * 1000, durationMinutes: 50 };
      updateSettings(appSettings).then(refresh);
    }
  });

  btnStop.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'STOP_FOCUS_SESSION' }, refresh);
    } else {
      appSettings.focusSession = { active: false, endTime: null };
      updateSettings(appSettings).then(refresh);
    }
  });

  refresh();
}

function initTasksQuickList() {
  const form = document.getElementById('popup-task-form');
  const input = document.getElementById('popup-task-input');
  const listEl = document.getElementById('popup-task-list');
  const badgeMini = document.getElementById('popup-pending-badge');

  function renderList() {
    listEl.innerHTML = '';
    const pendingTasks = allTasks.filter(t => !t.completed);
    badgeMini.textContent = pendingTasks.length;

    if (pendingTasks.length === 0) {
      listEl.innerHTML = '<li class="empty-state-mini">No pending tasks 🎉</li>';
      return;
    }

    // Show top 4 pending tasks
    pendingTasks.slice(0, 4).forEach(task => {
      const li = document.createElement('li');
      li.className = `popup-task-row ${task.completed ? 'done' : ''}`;
      li.innerHTML = `
        <label class="task-label-group">
          <input type="checkbox" class="task-chk" ${task.completed ? 'checked' : ''}>
          <span>${escapeHtml(task.text)}</span>
        </label>
        <span class="task-tag-badge">${escapeHtml(task.tag || '')}</span>
      `;

      const chk = li.querySelector('.task-chk');
      chk.addEventListener('change', async () => {
        task.completed = chk.checked;
        task.completedAt = chk.checked ? Date.now() : null;
        if (task.completed) {
          const stats = appSettings.stats || {};
          stats.tasksCompletedCount = (stats.tasksCompletedCount || 0) + 1;
          await updateSettings({ stats });
        }
        await saveTasks(allTasks);
        renderList();
        initStats();
      });

      listEl.appendChild(li);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const newTask = {
      id: 'task-' + Date.now(),
      text,
      completed: false,
      priority: 'p2',
      tag: '#code',
      createdAt: Date.now(),
      completedAt: null
    };

    allTasks.unshift(newTask);
    await saveTasks(allTasks);
    input.value = '';
    renderList();
    initStats();
  });

  renderList();
}

function initStats() {
  const statTasks = document.getElementById('popup-stat-tasks');
  const statStreak = document.getElementById('popup-stat-streak');
  const statBlocked = document.getElementById('popup-stat-blocked');

  const doneCount = allTasks.filter(t => t.completed).length;
  statTasks.textContent = `${doneCount}/${allTasks.length}`;

  const streak = appSettings.github?.cachedData?.currentStreak || 0;
  statStreak.textContent = `${streak}d`;

  const blocked = appSettings.stats?.blockedAttemptsCount || 0;
  statBlocked.textContent = blocked;
}

function initNavLinks() {
  const btnOptions = document.getElementById('popup-btn-options');
  const btnNewtab = document.getElementById('popup-btn-newtab');

  btnOptions.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('../options/options.html', '_blank');
    }
  });

  btnNewtab.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
    } else {
      window.open('../newtab/newtab.html', '_blank');
    }
  });
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
