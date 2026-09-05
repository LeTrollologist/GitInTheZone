// shared/constants.js

export const APP_NAME = 'GitInTheZone';

export const DEFAULT_BLOCKLIST = [
  'twitter.com',
  'x.com',
  'reddit.com',
  'youtube.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'netflix.com',
  'twitch.tv',
  'news.ycombinator.com',
  'buzzfeed.com',
  'tumblr.com',
  'pinterest.com',
  '9gag.com',
  'threads.net'
];

export const DEFAULT_SETTINGS = {
  // Focus Hours Configuration
  focusSchedule: {
    enabled: true,
    startTime: '09:00',
    endTime: '17:00',
    days: [1, 2, 3, 4, 5] // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  },
  
  // Instant Focus / Pomodoro Session State
  focusSession: {
    active: false,
    endTime: null, // timestamp ms
    durationMinutes: 25,
    mode: 'pomodoro' // 'pomodoro' | 'manual'
  },

  // Emergency Snooze Pass (5 minutes)
  snooze: {
    active: false,
    until: null // timestamp ms
  },

  // Blocklist
  blocklist: [...DEFAULT_BLOCKLIST],
  blockRedirectEnabled: true,

  // GitHub Settings
  github: {
    username: 'torvalds',
    token: '',
    theme: 'github-dark',
    showPrivateCommits: false,
    cachedData: null,
    cacheTimestamp: null,
    cacheExpiry: 60 * 60 * 1000 // 1 hour
  },

  // General Preferences
  theme: 'dark',
  clockFormat: '24h',
  showDevQuotes: true,
  dailyGoal: 5,
  stats: {
    blockedAttemptsCount: 0,
    tasksCompletedCount: 0,
    focusSessionsCompleted: 0
  }
};

export const DEV_QUOTES = [
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Programs must be written for people to read, and only incidentally for machines to execute.", author: "Harold Abelson" },
  { text: "Simplicity is prerequisite for reliability.", author: "Edsger W. Dijkstra" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Fix the cause, not the symptom.", author: "Steve Maguire" },
  { text: "Before software can be reusable it first has to be usable.", author: "Ralph Johnson" },
  { text: "Deleted code is debugged code.", author: "Jeff Sickel" },
  { text: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", author: "Martin Fowler" },
  { text: "The best error message is the one that never shows up.", author: "Thomas Fuchs" },
  { text: "Stay focused. Every commit gets you closer to ship day.", author: "GitInTheZone" },
  { text: "One clean pull request a day keeps technical debt away.", author: "GitInTheZone" },
  { text: "Focus is a muscle. The more you protect your flow, the stronger it gets.", author: "GitInTheZone" }
];

export const GRAPH_THEMES = {
  'github-dark': {
    name: 'GitHub Classic',
    bg: '#0d1117',
    text: '#c9d1d9',
    subtext: '#8b949e',
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
  },
  'emerald': {
    name: 'Emerald Matrix',
    bg: '#04150c',
    text: '#c2f0d4',
    subtext: '#5aa376',
    levels: ['#0d2818', '#04471c', '#058c42', '#0db35a', '#16db65']
  },
  'amber': {
    name: 'Cyberpunk Amber',
    bg: '#140e04',
    text: '#fae3b4',
    subtext: '#ab8748',
    levels: ['#281e09', '#543b0c', '#8c6014', '#cca125', '#f7d046']
  },
  'dracula': {
    name: 'Dracula Purple',
    bg: '#12101c',
    text: '#e6dbff',
    subtext: '#897aa8',
    levels: ['#282245', '#4d3780', '#7447b8', '#9d5bf0', '#bd93f9']
  },
  'sky': {
    name: 'Nordic Cyan',
    bg: '#0b1622',
    text: '#c5e2f6',
    subtext: '#588da8',
    levels: ['#172a3a', '#004369', '#016fb9', '#05a5d1', '#5bc0be']
  }
};
