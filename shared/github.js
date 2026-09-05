// shared/github.js
import { GRAPH_THEMES } from './constants.js';

/**
 * Generate synthetic realistic contribution data for demo / offline mode
 */
export function generateSyntheticContributions() {
  const days = [];
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setDate(now.getDate() - 364);

  let cur = new Date(oneYearAgo);
  let total = 0;

  // Generate realistic commit distribution (higher on weekdays, clusters of activity)
  let streakActivity = 0.65;

  while (cur <= now) {
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
    const baseChance = isWeekend ? 0.3 : streakActivity;
    let count = 0;
    let level = 0;

    if (Math.random() < baseChance) {
      // Skewed commit counts: 1 to 12
      const roll = Math.random();
      if (roll > 0.85) count = Math.floor(Math.random() * 8) + 5;
      else if (roll > 0.5) count = Math.floor(Math.random() * 4) + 2;
      else count = 1;

      if (count === 0) level = 0;
      else if (count <= 2) level = 1;
      else if (count <= 4) level = 2;
      else if (count <= 7) level = 3;
      else level = 4;
    }

    const dateStr = cur.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      count,
      level
    });
    total += count;

    cur.setDate(cur.getDate() + 1);
  }

  return {
    isMock: true,
    total,
    contributions: days
  };
}

/**
 * Calculate current and longest streaks from sequential contribution days
 */
export function calculateStreaks(contributions = []) {
  if (!contributions.length) {
    return { currentStreak: 0, longestStreak: 0, total: 0 };
  }

  let total = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  for (let i = 0; i < contributions.length; i++) {
    const day = contributions[i];
    total += day.count || 0;

    if (day.count > 0) {
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
    } else {
      tempStreak = 0;
    }
  }

  // Calculate current streak backwards from today or yesterday
  const sorted = [...contributions].reverse();
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let startIndex = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].date === todayStr) {
      if (sorted[i].count > 0) {
        startIndex = i;
      } else {
        // If today has 0 commits, check if yesterday had commits
        if (sorted[i + 1] && sorted[i + 1].date === yesterdayStr && sorted[i + 1].count > 0) {
          startIndex = i + 1;
        }
      }
      break;
    }
  }

  if (startIndex !== -1) {
    for (let i = startIndex; i < sorted.length; i++) {
      if (sorted[i].count > 0) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    total,
    currentStreak,
    longestStreak
  };
}

/**
 * Fetches contributions using public endpoint, GraphQL, or fallback mock
 */
export async function fetchGitHubContributions(username, token = '') {
  const cleanUser = (username || '').trim();
  if (!cleanUser) {
    const mock = generateSyntheticContributions();
    const streaks = calculateStreaks(mock.contributions);
    return { ...mock, ...streaks };
  }

  // 1. Try public endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(cleanUser)}?y=last`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      if (data && Array.isArray(data.contributions) && data.contributions.length > 0) {
        const streaks = calculateStreaks(data.contributions);
        return {
          isMock: false,
          username: cleanUser,
          total: data.total?.lastYear || streaks.total,
          contributions: data.contributions,
          ...streaks
        };
      }
    }
  } catch (err) {
    console.warn("Public contributions API failed, trying fallback:", err);
  }

  // 2. Try GraphQL if token is available
  if (token) {
    try {
      const query = `
        query($login: String!) {
          user(login: $login) {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    date
                    weekday
                  }
                }
              }
            }
          }
        }
      `;
      const gqlResp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, variables: { login: cleanUser } })
      });

      if (gqlResp.ok) {
        const gqlData = await gqlResp.json();
        const calendar = gqlData?.data?.user?.contributionsCollection?.contributionCalendar;
        if (calendar && calendar.weeks) {
          const days = [];
          calendar.weeks.forEach(w => {
            w.contributionDays.forEach(d => {
              let level = 0;
              const count = d.contributionCount;
              if (count > 0 && count <= 2) level = 1;
              else if (count <= 4) level = 2;
              else if (count <= 7) level = 3;
              else if (count > 7) level = 4;
              days.push({ date: d.date, count, level });
            });
          });
          const streaks = calculateStreaks(days);
          return {
            isMock: false,
            username: cleanUser,
            total: calendar.totalContributions || streaks.total,
            contributions: days,
            ...streaks
          };
        }
      }
    } catch (err) {
      console.warn("GitHub GraphQL query failed:", err);
    }
  }

  // Fallback: realistic synthetic data with indicator
  const mock = generateSyntheticContributions();
  const streaks = calculateStreaks(mock.contributions);
  return {
    isMock: true,
    username: cleanUser,
    ...mock,
    ...streaks
  };
}

/**
 * Render interactive SVG GitHub Heatmap into container
 */
export function renderContributionGraph(container, days = [], themeName = 'github-dark') {
  if (!container) return;
  container.innerHTML = '';

  const theme = GRAPH_THEMES[themeName] || GRAPH_THEMES['github-dark'];
  const cellWidth = 11;
  const cellHeight = 11;
  const cellPadding = 3;
  const step = cellWidth + cellPadding; // 14px

  // Organize days into weeks (columns) of 7 days (rows, Sun=0 to Sat=6)
  const weeks = [];
  let currentWeek = [];

  // Align start date to Sunday
  if (days.length > 0) {
    const firstDate = new Date(days[0].date + 'T00:00:00');
    const firstDay = firstDate.getDay();
    for (let p = 0; p < firstDay; p++) {
      currentWeek.push(null);
    }
  }

  days.forEach((day) => {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  const leftMargin = 30;
  const topMargin = 20;
  const width = leftMargin + weeks.length * step + 20;
  const height = topMargin + 7 * step + 10;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'github-heatmap-svg');
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.display = 'block';

  // Month Labels along top
  const monthLabelsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  monthLabelsG.setAttribute('class', 'month-labels');
  monthLabelsG.setAttribute('fill', theme.subtext);
  monthLabelsG.setAttribute('font-size', '10');
  monthLabelsG.setAttribute('font-family', 'ui-sans-serif, system-ui, -apple-system, sans-serif');

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let lastRenderedMonth = -1;

  weeks.forEach((week, wIndex) => {
    // Check first non-null day in week
    const firstDayInWeek = week.find(d => d !== null);
    if (firstDayInWeek) {
      const d = new Date(firstDayInWeek.date + 'T00:00:00');
      const m = d.getMonth();
      if (m !== lastRenderedMonth && wIndex < weeks.length - 2) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', `${leftMargin + wIndex * step}`);
        text.setAttribute('y', '12');
        text.textContent = monthNames[m];
        monthLabelsG.appendChild(text);
        lastRenderedMonth = m;
      }
    }
  });
  svg.appendChild(monthLabelsG);

  // Day Labels along left (Mon, Wed, Fri)
  const dayLabelsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  dayLabelsG.setAttribute('class', 'weekday-labels');
  dayLabelsG.setAttribute('fill', theme.subtext);
  dayLabelsG.setAttribute('font-size', '9');
  dayLabelsG.setAttribute('font-family', 'ui-sans-serif, system-ui, -apple-system, sans-serif');

  const weekdayMap = [
    { row: 1, text: 'Mon' },
    { row: 3, text: 'Wed' },
    { row: 5, text: 'Fri' }
  ];

  weekdayMap.forEach(({ row, text }) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', '6');
    t.setAttribute('y', `${topMargin + row * step + 9}`);
    t.textContent = text;
    dayLabelsG.appendChild(t);
  });
  svg.appendChild(dayLabelsG);

  // Create Cell Grid
  const cellsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  cellsG.setAttribute('class', 'heatmap-cells');

  // Tooltip element container inside document
  let tooltip = document.getElementById('heatmap-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'heatmap-tooltip';
    tooltip.className = 'heatmap-tooltip';
    document.body.appendChild(tooltip);
  }

  weeks.forEach((week, colIndex) => {
    week.forEach((day, rowIndex) => {
      if (!day) return;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const x = leftMargin + colIndex * step;
      const y = topMargin + rowIndex * step;

      const level = Math.min(Math.max(day.level || 0, 0), 4);
      const color = theme.levels[level];

      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', cellWidth);
      rect.setAttribute('height', cellHeight);
      rect.setAttribute('rx', '2.5');
      rect.setAttribute('ry', '2.5');
      rect.setAttribute('fill', color);
      rect.setAttribute('class', 'heatmap-cell');
      rect.setAttribute('data-date', day.date);
      rect.setAttribute('data-count', day.count);

      rect.addEventListener('mouseenter', (e) => {
        rect.style.stroke = '#fff';
        rect.style.strokeWidth = '1.5px';
        const dateObj = new Date(day.date + 'T00:00:00');
        const formattedDate = dateObj.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        const countText = day.count === 0 ? 'No contributions' : `${day.count} contribution${day.count === 1 ? '' : 's'}`;
        tooltip.innerHTML = `<strong>${countText}</strong> on ${formattedDate}`;
        tooltip.style.display = 'block';

        const rectBox = rect.getBoundingClientRect();
        tooltip.style.left = `${window.scrollX + rectBox.left + rectBox.width / 2 - tooltip.offsetWidth / 2}px`;
        tooltip.style.top = `${window.scrollY + rectBox.top - tooltip.offsetHeight - 8}px`;
      });

      rect.addEventListener('mouseleave', () => {
        rect.style.stroke = 'none';
        tooltip.style.display = 'none';
      });

      cellsG.appendChild(rect);
    });
  });

  svg.appendChild(cellsG);
  container.appendChild(svg);
}
