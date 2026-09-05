// background/service_worker.js
import { getSettings, updateSettings, evaluateFocusStatus, isUrlBlocked, storage } from '../shared/storage.js';

const ALARM_NAME = 'gitinthezone-focus-tick';

// Setup periodic alarm and initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[GitInTheZone] Extension installed/updated.');
  await getSettings(); // Initializes defaults if missing
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  await updateBadgeAndRules();
});

// Periodic alarm handler (every 30 seconds)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await updateBadgeAndRules();
  }
});

/**
 * Updates extension action badge and dynamic state
 */
async function updateBadgeAndRules() {
  const settings = await getSettings();
  const status = evaluateFocusStatus(settings);

  if (status.reason === 'snooze') {
    const remainingMin = Math.max(1, Math.ceil(status.remainingMs / 60000));
    chrome.action.setBadgeText({ text: `${remainingMin}m` });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Amber warning
    chrome.action.setTitle({ title: `GitInTheZone: Snooze Active (${remainingMin}m remaining)` });
    return status;
  }

  if (status.active) {
    if (status.remainingMs) {
      const remainingMin = Math.ceil(status.remainingMs / 60000);
      const badgeText = remainingMin > 99 ? '99+' : `${remainingMin}m`;
      chrome.action.setBadgeText({ text: badgeText });
    } else {
      chrome.action.setBadgeText({ text: 'ZONE' });
    }
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Emerald green
    chrome.action.setTitle({
      title: `GitInTheZone: In The Zone (${status.reason.toUpperCase()})`
    });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({ title: 'GitInTheZone: Dev Focus & Tasks (Idle)' });
  }

  return status;
}

/**
 * Navigation interceptor: Intercepts visits to blocked domains when Focus Mode is active
 */
chrome.webNavigation?.onBeforeNavigate.addListener(async (details) => {
  // Only intercept top-level frame navigations (frameId 0)
  if (details.frameId !== 0) return;

  const settings = await getSettings();
  const status = evaluateFocusStatus(settings);

  if (!status.active) return;
  if (!settings.blockRedirectEnabled) return;

  if (isUrlBlocked(details.url, settings.blocklist)) {
    console.log(`[GitInTheZone] Blocked navigation to: ${details.url}`);

    // Update stats in storage
    const currentStats = settings.stats || { blockedAttemptsCount: 0 };
    currentStats.blockedAttemptsCount = (currentStats.blockedAttemptsCount || 0) + 1;
    await updateSettings({ stats: currentStats });

    const blockedUrl = chrome.runtime.getURL(`blocked/blocked.html?url=${encodeURIComponent(details.url)}&reason=${encodeURIComponent(status.reason)}`);
    chrome.tabs.update(details.tabId, { url: blockedUrl });
  }
});

// Message listener for popup, options, and new tab dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'GET_STATUS') {
      const settings = await getSettings();
      const status = evaluateFocusStatus(settings);
      sendResponse({ status, settings });
      return;
    }

    if (message.type === 'START_FOCUS_SESSION') {
      const duration = message.durationMinutes || 25;
      const endTime = Date.now() + duration * 60 * 1000;
      await updateSettings({
        focusSession: {
          active: true,
          endTime,
          durationMinutes: duration,
          mode: message.mode || 'pomodoro'
        },
        snooze: { active: false, until: null }
      });
      const status = await updateBadgeAndRules();
      sendResponse({ success: true, status });
      return;
    }

    if (message.type === 'STOP_FOCUS_SESSION') {
      await updateSettings({
        focusSession: {
          active: false,
          endTime: null,
          durationMinutes: 25,
          mode: 'pomodoro'
        }
      });
      const status = await updateBadgeAndRules();
      sendResponse({ success: true, status });
      return;
    }

    if (message.type === 'REQUEST_SNOOZE') {
      const snoozeMinutes = message.minutes || 5;
      const until = Date.now() + snoozeMinutes * 60 * 1000;
      await updateSettings({
        snooze: {
          active: true,
          until
        }
      });
      const status = await updateBadgeAndRules();
      sendResponse({ success: true, until, status });
      return;
    }

    if (message.type === 'CANCEL_SNOOZE') {
      await updateSettings({
        snooze: {
          active: false,
          until: null
        }
      });
      const status = await updateBadgeAndRules();
      sendResponse({ success: true, status });
      return;
    }

    if (message.type === 'SYNC_RULES') {
      const status = await updateBadgeAndRules();
      sendResponse({ success: true, status });
      return;
    }
  })();

  return true; // Keep message channel open for async response
});
