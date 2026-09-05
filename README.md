# GitInTheZone 🎯

> Keep your head in the code. A browser extension that locks down distraction sites during your actual focus hours, replaces your empty new tab with your daily sprint backlog, and keeps your GitHub streak front and center.

Built for **Chrome**, **Brave**, **Edge**, and **Firefox** (Manifest V3).

---

## Why I Built This

Every developer knows the cycle: your build takes 45 seconds, a test suite is running, or you hit a tricky bug and open a new tab to check MDN or StackOverflow. Muscle memory takes over. Two keystrokes later you're on Reddit, Twitter, or YouTube. Half an hour evaporates, your flow state is shattered, and you have to rebuild your mental model from scratch.

Existing site blockers felt heavy-handed, naggy, or like corporate spyware that required recurring subscriptions. I wanted something built specifically for how programmers work:

1. **Scheduled focus periods** so it activates automatically during my work day and gets out of the way on evenings and weekends.
2. **A real new tab dashboard** that shows what I actually set out to ship today instead of generic stock photos or sponsored news articles.
3. **My GitHub contribution graph** right in my face as a visual nudge to keep shipping clean commits and maintain consistency.
4. **An emergency pass** because sometimes someone drops an urgent link in Slack and you don't want to fight your own browser to open it.

---

## Features

### 🛡️ Smart Focus Guard (Site Blocker)
- **Automatic Schedule**: Define your working hours (e.g. Monday–Friday from 9:00 AM to 5:00 PM). During those hours, distractions are intercepted.
- **On-Demand Sessions**: Not on schedule? Hit the **25m Focus** or **50m Deep** button whenever you need to sit down and tackle a hard problem.
- **Terminal Blocker Screen**: If you drift toward a blocked site, you get redirected to a clean terminal-style screen showing your current focus countdown and your top pending tasks to remind you what you were doing.
- **5-Minute Emergency Pass**: Need to look something up quickly on a blocked site? Click the emergency pass for 5 minutes of access without disabling your whole schedule.
- **Zero Spyware / Zero Telemetry**: Whitelists `localhost`, `127.0.0.1`, and private developer ports automatically. Everything is stored locally in your browser.

### 📋 Daily Sprint Backlog
- **Quick-add with Enter**: Type what you need to do and hit enter.
- **Priority Pills**: Tag tasks as **P1 Urgent**, **P2 Normal**, or **P3 Low** with high-contrast color coding.
- **Dev Tags**: Categorize with `#code`, `#bug`, `#review`, `#feature`, `#docs`, `#infra`, or `#learning`.
- **Live Progress Bar**: Visual feedback on how much of today's backlog you've knocked out.
- **Filters**: Quickly toggle between **All**, **Today**, **Active**, and **Done**.

### 🐙 Live GitHub Contribution Graph
- **Real Heatmap**: Generates a 52-week SVG grid that looks and feels just like your GitHub profile calendar.
- **Streak Tracker**: Calculates your current commit streak and your all-time longest streak.
- **Hover Tooltips**: Inspect exact commit counts for any day of the year.
- **Multiple Color Themes**: Choose from **GitHub Classic**, **Emerald Matrix**, **Cyberpunk Amber**, **Dracula Purple**, or **Nordic Cyan**.
- **No Token Required**: Works out of the box with just your public username. If you want private repo contributions included, you can optionally supply a personal access token (which never leaves your machine).

### ⚡ Quick Launchpad & Daily Insights
- Fast one-click bookmarks for GitHub Pull Requests, StackOverflow, MDN Docs, DevDocs, and localhost (3000 & 8080).
- Hand-picked quotes on clean architecture, refactoring, and focus from Linus Torvalds, Martin Fowler, Kent Beck, and Dijkstra.

---

## Installation Guide

You can load the extension directly in developer mode in under 60 seconds.

### Google Chrome, Brave, & Microsoft Edge

1. Clone or download this repo:
   ```bash
   git clone git@github.com:LeTrollologist/GitInTheZone.git
   ```
2. Open your browser's extension management page:
   - **Chrome**: Visit `chrome://extensions`
   - **Brave**: Visit `brave://extensions`
   - **Edge**: Visit `edge://extensions`
3. Flip the **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** in the top-left toolbar.
5. Select the folder where you cloned this repository (the folder containing `manifest.json`).
6. Open a new tab — your developer dashboard is live!
7. *(Recommended)* Click the puzzle piece icon in your toolbar and **pin GitInTheZone** so you have quick access to the focus timer and task list.

### Mozilla Firefox

1. In Firefox, navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select the `manifest.json` file inside the repository directory.
4. Open a new tab to start using it.

---

## How to Use It

### Setting your focus hours
1. Click the **gear icon** on the dashboard (or right-click the toolbar icon and select **Options**).
2. Set your normal work hours (e.g. `09:00` to `17:00`) and choose which days of the week you want active.
3. Add any specific domains you tend to open habitually (like `news.ycombinator.com`, `reddit.com`, `x.com`, etc.).
4. Enter your GitHub username to hook up your contribution graph.
5. Hit **Save Changes**.

### Starting an ad-hoc session
- Opening a new tab has a control bar at the top: click **25m Focus** or **50m Deep**.
- Alternatively, click the GitInTheZone icon in your browser toolbar to start a timer from any page.
- While active, the extension badge will show your remaining minutes in green.

### Backing up your data
In the Options page, click **Export Data (JSON)** to download a complete backup of your tasks, completed history, and settings. You can restore this backup on another computer anytime.

---

## Project Structure

```
GitInTheZone/
├── manifest.json            # WebExtension Manifest V3
├── package.json             # Test runner configuration
├── shared/
│   ├── constants.js         # Default blocklists, themes, and quotes
│   ├── storage.js           # chrome.storage adapter & focus state evaluator
│   └── github.js            # Heatmap SVG renderer & streak math
├── background/
│   └── service_worker.js    # Alarm scheduler, navigation interceptor, badge
├── newtab/
│   ├── newtab.html          # Dashboard layout
│   ├── newtab.css           # Dark developer theme styling
│   └── newtab.js            # Dashboard controller
├── blocked/
│   ├── blocked.html         # Terminal blocked screen
│   ├── blocked.css          # Terminal UI styles
│   └── blocked.js           # Snooze pass & pending task display
├── popup/
│   ├── popup.html           # Toolbar quick-action popup
│   ├── popup.css            # Popup styling
│   └── popup.js             # Timer & quick task handlers
├── options/
│   ├── options.html         # Settings & configuration center
│   ├── options.css          # Settings styling
│   └── options.js           # Settings persistence & import/export
├── icons/                   # Extension icons (16, 48, 128, SVG)
└── tests/
    └── unit_tests.js        # Node.js automated test suite
```

---

## Running Tests

The repository has zero external production dependencies. The test suite runs directly via Node.js:

```bash
npm test
```

This verifies URL pattern matching (handling subdomains and ports), standard and overnight schedule evaluations, Emergency Snooze precedence, and GitHub streak calculation algorithms.

---

## Privacy & Security

- **No Remote Telemetry**: GitInTheZone does not send any analytics, tracking data, or logs to any third-party servers.
- **No Browsing History Recording**: URLs are only checked against your local blocklist while Focus Mode is active.
- **Local Storage**: All tasks, settings, and stats remain entirely inside your browser's local storage.
- **GitHub API**: The public contributions graph uses public endpoints. If you provide a personal token, it is saved exclusively in `chrome.storage.local` on your device.

---

## Contributing & Feedback

Have ideas for useful developer widgets, shortcuts, or themes? Pull requests and issues are welcome!

1. Fork the repo.
2. Create your feature branch (`git checkout -b feature/cool-widget`).
3. Commit your changes (`git commit -m 'Add pomodoro sound alerts'`).
4. Push to the branch (`git push origin feature/cool-widget`).
5. Open a Pull Request.

---

## License

[MIT](LICENSE) © 2026 LeTrollologist
