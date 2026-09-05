// blocked/blocked.js
import { getSettings, getTasks, evaluateFocusStatus } from '../shared/storage.js';
import { DEV_QUOTES } from '../shared/constants.js';

let countdownTimer = null;
let destinationUrl = '';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Parse query params
  const params = new URLSearchParams(window.location.search);
  destinationUrl = params.get('url') || '';
  const reasonParam = params.get('reason') || '';

  const urlDisplay = document.getElementById('blocked-url');
  if (destinationUrl) {
    try {
      const parsed = new URL(destinationUrl);
      urlDisplay.textContent = parsed.hostname + parsed.pathname;
    } catch {
      urlDisplay.textContent = destinationUrl;
    }
  } else {
    urlDisplay.textContent = 'Distracting Site';
  }

  // 2. Load Status & Schedule
  await updateStatusDisplay(reasonParam);

  // 3. Load Pending Tasks Reminder
  await loadPendingTasks();

  // 4. Random Quote
  loadRandomQuote();

  // 5. Setup Action Buttons
  setupActions();
});

async function updateStatusDisplay(fallbackReason = '') {
  const settings = await getSettings();
  const status = evaluateFocusStatus(settings);

  const reasonEl = document.getElementById('focus-reason');
  const timeRemainingEl = document.getElementById('time-remaining');

  const reasonText = (status.reason || fallbackReason || 'focus').toUpperCase();
  if (reasonText === 'POMODORO') {
    reasonEl.textContent = 'Pomodoro Deep Work';
  } else if (reasonText === 'SCHEDULE') {
    const start = settings.focusSchedule?.startTime || '09:00';
    const end = settings.focusSchedule?.endTime || '17:00';
    reasonEl.textContent = `Scheduled Hours (${start} - ${end})`;
  } else {
    reasonEl.textContent = 'Focus Session Active';
  }

  function tick() {
    const now = Date.now();
    if (status.until && status.until > now) {
      const diffMs = status.until - now;
      const totalSec = Math.floor(diffMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      timeRemainingEl.textContent = `${min}m ${sec < 10 ? '0' : ''}${sec}s remaining`;
    } else {
      timeRemainingEl.textContent = 'Focus session concluding...';
      if (destinationUrl) {
        // If session naturally finished, offer or auto-redirect
        setTimeout(() => {
          window.location.href = destinationUrl;
        }, 1500);
      }
    }
  }

  tick();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 1000);
}

async function loadPendingTasks() {
  const tasks = await getTasks();
  const pendingTasks = tasks.filter(t => !t.completed);

  const countBadge = document.getElementById('pending-count');
  const listEl = document.getElementById('reminder-task-list');

  countBadge.textContent = `${pendingTasks.length} pending`;
  listEl.innerHTML = '';

  if (pendingTasks.length === 0) {
    listEl.innerHTML = '<li class="empty-item">All caught up! Great job. Add more tasks in your dashboard.</li>';
    return;
  }

  // Sort by priority (p1 -> p2 -> p3)
  const priorityWeight = { p1: 1, p2: 2, p3: 3 };
  pendingTasks.sort((a, b) => (priorityWeight[a.priority] || 2) - (priorityWeight[b.priority] || 2));

  // Display top 3 tasks
  const topTasks = pendingTasks.slice(0, 3);
  topTasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'reminder-task-item';

    const pClass = task.priority || 'p2';
    const pLabel = (task.priority || 'p2').toUpperCase();

    li.innerHTML = `
      <div class="reminder-task-text">
        <span class="priority-chip ${pClass}">${pLabel}</span>
        <span>${escapeHtml(task.text)}</span>
      </div>
      ${task.tag ? `<span class="tag-chip">${escapeHtml(task.tag)}</span>` : ''}
    `;
    listEl.appendChild(li);
  });
}

function loadRandomQuote() {
  const quoteText = document.getElementById('quote-text');
  const quoteAuthor = document.getElementById('quote-author');
  const random = DEV_QUOTES[Math.floor(Math.random() * DEV_QUOTES.length)];
  quoteText.textContent = `"${random.text}"`;
  quoteAuthor.textContent = `— ${random.author}`;
}

function setupActions() {
  const btnDashboard = document.getElementById('btn-back-dashboard');
  const btnEmergency = document.getElementById('btn-emergency-pass');
  const modal = document.getElementById('snooze-modal');
  const btnConfirmSnooze = document.getElementById('btn-confirm-snooze');
  const btnCancelSnooze = document.getElementById('btn-cancel-snooze');

  btnDashboard.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
    } else {
      window.location.href = '../newtab/newtab.html';
    }
  });

  btnEmergency.addEventListener('click', () => {
    modal.classList.remove('hidden');
  });

  btnCancelSnooze.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  btnConfirmSnooze.addEventListener('click', () => {
    btnConfirmSnooze.disabled = true;
    btnConfirmSnooze.textContent = 'Activating pass...';

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'REQUEST_SNOOZE', minutes: 5 }, (response) => {
        if (destinationUrl) {
          window.location.href = destinationUrl;
        } else {
          modal.classList.add('hidden');
          alert('5-minute pass activated!');
        }
      });
    } else {
      alert('5-minute pass activated (test mode).');
      if (destinationUrl) window.location.href = destinationUrl;
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
