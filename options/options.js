// options/options.js
import { getSettings, updateSettings, getTasks, saveTasks } from '../shared/storage.js';
import { DEFAULT_BLOCKLIST } from '../shared/constants.js';
import { fetchGitHubContributions } from '../shared/github.js';

let currentSettings = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentSettings = await getSettings();
  populateForm(currentSettings);
  setupEventListeners();
});

function populateForm(s) {
  // Focus Schedule
  document.getElementById('schedule-enabled').checked = !!s.focusSchedule?.enabled;
  document.getElementById('schedule-start').value = s.focusSchedule?.startTime || '09:00';
  document.getElementById('schedule-end').value = s.focusSchedule?.endTime || '17:00';

  const activeDays = s.focusSchedule?.days || [1, 2, 3, 4, 5];
  document.querySelectorAll('#days-selector input').forEach(chk => {
    chk.checked = activeDays.includes(Number(chk.value));
  });

  // Blocklist
  document.getElementById('block-redirect-enabled').checked = s.blockRedirectEnabled !== false;
  renderBlocklist(s.blocklist || []);

  // GitHub
  document.getElementById('github-username').value = s.github?.username || '';
  document.getElementById('github-token').value = s.github?.token || '';
  document.getElementById('github-theme-select').value = s.github?.theme || 'github-dark';

  // Preferences
  document.getElementById('clock-format-select').value = s.clockFormat || '24h';
  document.getElementById('daily-goal-input').value = s.dailyGoal || 5;
}

function renderBlocklist(list) {
  const container = document.getElementById('blocklist-items');
  const countEl = document.getElementById('blocklist-count');
  container.innerHTML = '';
  countEl.textContent = `${list.length} domain${list.length === 1 ? '' : 's'} blocked`;

  list.forEach((domain, idx) => {
    const li = document.createElement('li');
    li.className = 'blocklist-item';
    li.innerHTML = `
      <span>${escapeHtml(domain)}</span>
      <button class="btn-remove-domain" data-index="${idx}" title="Remove domain">&times;</button>
    `;

    li.querySelector('.btn-remove-domain').addEventListener('click', () => {
      currentSettings.blocklist.splice(idx, 1);
      renderBlocklist(currentSettings.blocklist);
    });

    container.appendChild(li);
  });
}

function setupEventListeners() {
  // Save Settings
  document.getElementById('btn-save-settings').addEventListener('click', saveAll);

  // Add Domain
  const addDomainInput = document.getElementById('input-new-domain');
  const btnAddDomain = document.getElementById('btn-add-domain');

  function addDomain() {
    let val = addDomainInput.value.trim().toLowerCase();
    if (!val) return;
    val = val.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    if (!currentSettings.blocklist) currentSettings.blocklist = [];
    if (!currentSettings.blocklist.includes(val)) {
      currentSettings.blocklist.push(val);
      renderBlocklist(currentSettings.blocklist);
      addDomainInput.value = '';
    }
  }

  btnAddDomain.addEventListener('click', addDomain);
  addDomainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDomain();
    }
  });

  // Reset Blocklist
  document.getElementById('btn-reset-blocklist').addEventListener('click', () => {
    if (confirm('Reset blocklist to defaults?')) {
      currentSettings.blocklist = [...DEFAULT_BLOCKLIST];
      renderBlocklist(currentSettings.blocklist);
    }
  });

  // Test GitHub Connection
  const btnTestGithub = document.getElementById('btn-test-github');
  const testFeedback = document.getElementById('github-test-result');

  btnTestGithub.addEventListener('click', async () => {
    const user = document.getElementById('github-username').value.trim();
    const token = document.getElementById('github-token').value.trim();

    testFeedback.textContent = 'Testing connection...';
    testFeedback.className = 'test-feedback';

    const res = await fetchGitHubContributions(user, token);
    if (res && res.contributions && res.contributions.length > 0) {
      if (res.isMock) {
        testFeedback.textContent = `Connected (Offline demo active, ${res.total} sample commits)`;
        testFeedback.className = 'test-feedback success';
      } else {
        testFeedback.textContent = `Connected to @${user}! ${res.total} contributions found. Current streak: ${res.currentStreak}d.`;
        testFeedback.className = 'test-feedback success';
      }
    } else {
      testFeedback.textContent = 'Could not fetch GitHub activity. Check username.';
      testFeedback.className = 'test-feedback error';
    }
  });

  // Open Dashboard
  document.getElementById('btn-open-dashboard').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
    } else {
      window.location.href = '../newtab/newtab.html';
    }
  });

  // Export JSON
  document.getElementById('btn-export-json').addEventListener('click', async () => {
    const s = await getSettings();
    const t = await getTasks();
    const backup = { settings: s, tasks: t, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `gitinthezone-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import Backup
  const fileInput = document.getElementById('import-file-input');
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.settings) await updateSettings(data.settings);
        if (data.tasks) await saveTasks(data.tasks);
        currentSettings = await getSettings();
        populateForm(currentSettings);
        showToast('Backup restored successfully!');
      } catch (err) {
        alert('Invalid backup JSON file.');
      }
    };
    reader.readAsText(file);
  });

  // Clear Tasks
  document.getElementById('btn-clear-tasks').addEventListener('click', async () => {
    if (confirm('Remove all completed tasks?')) {
      const tasks = await getTasks();
      const active = tasks.filter(t => !t.completed);
      await saveTasks(active);
      showToast('Cleared completed tasks.');
    }
  });
}

async function saveAll() {
  const days = [];
  document.querySelectorAll('#days-selector input:checked').forEach(chk => {
    days.push(Number(chk.value));
  });

  const updated = {
    focusSchedule: {
      enabled: document.getElementById('schedule-enabled').checked,
      startTime: document.getElementById('schedule-start').value || '09:00',
      endTime: document.getElementById('schedule-end').value || '17:00',
      days
    },
    blockRedirectEnabled: document.getElementById('block-redirect-enabled').checked,
    blocklist: currentSettings.blocklist || [],
    github: {
      username: document.getElementById('github-username').value.trim() || 'torvalds',
      token: document.getElementById('github-token').value.trim(),
      theme: document.getElementById('github-theme-select').value,
      cachedData: null, // Invalidate cache so graph updates immediately
      cacheTimestamp: null
    },
    clockFormat: document.getElementById('clock-format-select').value,
    dailyGoal: Number(document.getElementById('daily-goal-input').value) || 5
  };

  await updateSettings(updated);
  currentSettings = await getSettings();

  // Notify background service worker to update alarms & rules immediately
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
  }

  showToast('Settings saved successfully!');
}

function showToast(msg) {
  const toast = document.getElementById('save-toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
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
