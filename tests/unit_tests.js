// tests/unit_tests.js
import assert from 'node:assert';
import { isUrlBlocked, evaluateFocusStatus } from '../shared/storage.js';
import { calculateStreaks, generateSyntheticContributions } from '../shared/github.js';
import { DEFAULT_BLOCKLIST, DEFAULT_SETTINGS } from '../shared/constants.js';
import { parseTaskInput, sortTasksForDisplay } from '../shared/tasks.js';

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`, err);
    failed++;
  }
}

console.log('\n=== Running GitInTheZone Test Suite ===\n');

console.log('--- 1. URL Domain Matching & Blocker Rules ---');

it('should block exact domain match', () => {
  assert.strictEqual(isUrlBlocked('https://twitter.com', ['twitter.com']), true);
  assert.strictEqual(isUrlBlocked('http://reddit.com', ['reddit.com']), true);
});

it('should block subdomains of blocked domains', () => {
  assert.strictEqual(isUrlBlocked('https://old.reddit.com/r/javascript', ['reddit.com']), true);
  assert.strictEqual(isUrlBlocked('https://m.youtube.com/watch?v=abc', ['youtube.com']), true);
  assert.strictEqual(isUrlBlocked('https://sub.sub.twitter.com', ['twitter.com']), true);
});

it('should block path-specific patterns', () => {
  assert.strictEqual(isUrlBlocked('https://discord.com/app', ['discord.com/app']), true);
  assert.strictEqual(isUrlBlocked('https://discord.com/app/channels/123', ['discord.com/app']), true);
  assert.strictEqual(isUrlBlocked('https://discord.com/blog', ['discord.com/app']), false);
  assert.strictEqual(isUrlBlocked('https://notdiscord.com/app', ['discord.com/app']), false);
  assert.strictEqual(isUrlBlocked('https://youtube.com/watch?v=abc123', ['https://youtube.com/watch?feature=share']), true);
  assert.strictEqual(isUrlBlocked('https://example.com:8443/social', ['example.com:8443/social']), true);
});

it('should NOT block developer, local, or allowed domains', () => {
  assert.strictEqual(isUrlBlocked('https://github.com/torvalds/linux', DEFAULT_BLOCKLIST), false);
  assert.strictEqual(isUrlBlocked('https://stackoverflow.com/questions/1234', DEFAULT_BLOCKLIST), false);
  assert.strictEqual(isUrlBlocked('http://localhost:3000', DEFAULT_BLOCKLIST), false);
  assert.strictEqual(isUrlBlocked('http://127.0.0.1:8080/api', DEFAULT_BLOCKLIST), false);
  assert.strictEqual(isUrlBlocked('http://192.168.1.10:8080/reddit.com', DEFAULT_BLOCKLIST), false);
  assert.strictEqual(isUrlBlocked('chrome-extension://abcdefg/blocked/blocked.html', DEFAULT_BLOCKLIST), false);
});

it('should support wildcard block patterns', () => {
  assert.strictEqual(isUrlBlocked('https://music.youtube.com/playlist', ['*.youtube.com']), true);
  assert.strictEqual(isUrlBlocked('https://youtube.com/playlist', ['*.youtube.com']), true);
});

console.log('\n--- 2. Focus Schedule & Pomodoro Evaluation ---');

it('should evaluate active within standard schedule hours', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    focusSchedule: {
      enabled: true,
      startTime: '09:00',
      endTime: '17:00',
      days: [1, 2, 3, 4, 5] // Mon-Fri
    },
    focusSession: { active: false },
    snooze: { active: false }
  };

  // Monday 10:30 AM (Sep 7, 2026 is Monday)
  const mondayWork = new Date('2026-09-07T10:30:00');
  const res = evaluateFocusStatus(settings, mondayWork);
  assert.strictEqual(res.active, true);
  assert.strictEqual(res.reason, 'schedule');
  assert.ok(res.remainingMs > 0);
});

it('should evaluate idle outside schedule hours or on weekends', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    focusSchedule: {
      enabled: true,
      startTime: '09:00',
      endTime: '17:00',
      days: [1, 2, 3, 4, 5]
    },
    focusSession: { active: false },
    snooze: { active: false }
  };

  // Monday 7:30 PM (19:30)
  const mondayEvening = new Date('2026-09-07T19:30:00');
  assert.strictEqual(evaluateFocusStatus(settings, mondayEvening).active, false);

  // Sunday 12:00 PM (Sep 6, 2026 is Sunday)
  const sundayNoon = new Date('2026-09-06T12:00:00');
  assert.strictEqual(evaluateFocusStatus(settings, sundayNoon).active, false);
});

it('should handle overnight schedule (e.g. 22:00 to 06:00)', () => {
  const overnightSettings = {
    focusSchedule: {
      enabled: true,
      startTime: '22:00',
      endTime: '06:00',
      days: [1] // Monday
    },
    focusSession: { active: false },
    snooze: { active: false }
  };

  // Monday 23:30 (inside)
  const night = new Date('2026-09-07T23:30:00');
  assert.strictEqual(evaluateFocusStatus(overnightSettings, night).active, true);

  // Monday 03:30 (inside)
  const earlyMorning = new Date('2026-09-07T03:30:00');
  assert.strictEqual(evaluateFocusStatus(overnightSettings, earlyMorning).active, true);

  // Monday 14:00 (outside)
  const afternoon = new Date('2026-09-07T14:00:00');
  assert.strictEqual(evaluateFocusStatus(overnightSettings, afternoon).active, false);
});

it('should prioritize on-demand Pomodoro session over idle schedule', () => {
  const now = new Date('2026-09-06T14:00:00'); // Sunday (schedule disabled)
  const settings = {
    focusSchedule: { enabled: false },
    focusSession: {
      active: true,
      endTime: now.getTime() + 25 * 60 * 1000,
      mode: 'pomodoro'
    },
    snooze: { active: false }
  };

  const res = evaluateFocusStatus(settings, now);
  assert.strictEqual(res.active, true);
  assert.strictEqual(res.reason, 'pomodoro');
});

it('should bypass focus mode when Emergency Snooze is active', () => {
  const now = new Date('2026-09-07T11:00:00'); // Monday work hours
  const settings = {
    focusSchedule: {
      enabled: true,
      startTime: '09:00',
      endTime: '17:00',
      days: [1, 2, 3, 4, 5]
    },
    focusSession: { active: true, endTime: now.getTime() + 100000 },
    snooze: {
      active: true,
      until: now.getTime() + 5 * 60 * 1000 // 5m pass
    }
  };

  const res = evaluateFocusStatus(settings, now);
  assert.strictEqual(res.active, false);
  assert.strictEqual(res.reason, 'snooze');
});

console.log('\n--- 3. GitHub Contributions & Streak Calculation ---');

it('should correctly calculate total, current streak, and longest streak', () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const d1 = new Date(); d1.setDate(d1.getDate() - 1);
  const d2 = new Date(); d2.setDate(d2.getDate() - 2);
  const d3 = new Date(); d3.setDate(d3.getDate() - 3);
  const d4 = new Date(); d4.setDate(d4.getDate() - 4);
  const d5 = new Date(); d5.setDate(d5.getDate() - 5);

  const mockData = [
    { date: d5.toISOString().split('T')[0], count: 3 },
    { date: d4.toISOString().split('T')[0], count: 5 },
    { date: d3.toISOString().split('T')[0], count: 0 }, // Break
    { date: d2.toISOString().split('T')[0], count: 2 },
    { date: d1.toISOString().split('T')[0], count: 4 },
    { date: todayStr, count: 1 } // Active today
  ];

  const stats = calculateStreaks(mockData);
  assert.strictEqual(stats.total, 15);
  assert.strictEqual(stats.currentStreak, 3); // d2, d1, today
  assert.strictEqual(stats.longestStreak, 3);
});

it('should generate valid synthetic contributions in offline/fallback mode', () => {
  const demo = generateSyntheticContributions();
  assert.strictEqual(demo.isMock, true);
  assert.strictEqual(demo.contributions.length, 365);
  assert.ok(demo.total >= 0);
  assert.ok(demo.contributions.every(c => c.level >= 0 && c.level <= 4));
});

console.log('\n--- 4. Task Input QoL Helpers ---');

it('should parse inline priority and tag syntax from quick task input', () => {
  assert.deepStrictEqual(parseTaskInput('p1 #bug Fix flaky OAuth callback'), {
    text: 'Fix flaky OAuth callback',
    priority: 'p1',
    tag: '#bug'
  });

  assert.deepStrictEqual(parseTaskInput('!! #review Check auth PR', { fallbackPriority: 'p3', fallbackTag: '#docs' }), {
    text: 'Check auth PR',
    priority: 'p1',
    tag: '#review'
  });
});

it('should sort active high-priority tasks before completed tasks', () => {
  const tasks = [
    { id: 'done', text: 'Done', completed: true, priority: 'p1', createdAt: 5, completedAt: 6 },
    { id: 'low', text: 'Low', completed: false, priority: 'p3', createdAt: 20 },
    { id: 'urgent', text: 'Urgent', completed: false, priority: 'p1', createdAt: 10 }
  ];

  assert.deepStrictEqual(sortTasksForDisplay(tasks).map(t => t.id), ['urgent', 'low', 'done']);
});

console.log(`\n=== Tests Completed: ${passed} Passed, ${failed} Failed ===\n`);
if (failed > 0) process.exit(1);
