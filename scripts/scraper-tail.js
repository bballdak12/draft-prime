window.__scoring = JSON.parse(localStorage.getItem('__scoring') || '{}');

window.__scrapeOne = async function(urlKey, ourTeamRe) {
  const url = 'https://www.pro-football-reference.com/boxscores/' + urlKey.slice(0,8) + '0' + urlKey.slice(8) + '.htm';
  const r = await fetch(url);
  if (!r.ok) return { error: 'HTTP ' + r.status, url };
  const html = await r.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const t = doc.getElementById('scoring');
  if (!t) return { error: 'no scoring', url };
  let defTd = 0, safety = 0; const flagged = [];
  for (const tr of t.querySelectorAll('tbody tr')) {
    const teamCell = tr.querySelector('[data-stat="team"]');
    const descCell = tr.querySelector('[data-stat="description"]');
    if (!teamCell || !descCell) continue;
    const team = teamCell.textContent.trim();
    const detail = descCell.textContent.trim().toLowerCase();
    if (!ourTeamRe.test(team)) continue;
    const isInt = /interception\s+return/.test(detail);
    const isFumRet = /fumble\s+(return|recovery)/.test(detail);
    const isBlkRet = /blocked\s+(punt|field\s+goal|kick).*\breturn/.test(detail);
    const isSafety = /\bsafety\b/.test(detail);
    if (isInt || isFumRet || isBlkRet) { defTd++; flagged.push('TD: ' + descCell.textContent.trim()); }
    if (isSafety) { safety++; flagged.push('SFTY: ' + descCell.textContent.trim()); }
  }
  return { defTd, safety, flagged };
};

window.__scrapeCard = async function(idx) {
  const c = window.__targets[idx];
  if (!c) return 'no card at idx ' + idx;
  const re = new RegExp('\\b' + c.nick + '\\b', 'i');
  const out = { pid: c.pid, ssn: c.ssn, nick: c.nick, games: [] };
  for (const [wk, urlKey] of c.games) {
    const r = await window.__scrapeOne(urlKey, re);
    out.games.push({ wk, urlKey, ...r });
    await new Promise(rr => setTimeout(rr, 350));
  }
  window.__scoring[c.pid + '|' + c.ssn] = out;
  localStorage.setItem('__scoring', JSON.stringify(window.__scoring));
  const totDt = out.games.reduce((s,g)=>s+(g.defTd||0),0);
  const totSf = out.games.reduce((s,g)=>s+(g.safety||0),0);
  return idx + ': ' + c.ssn + ' ' + c.nick + ' ' + out.games.length + 'g defTD=' + totDt + ' safety=' + totSf;
};

window.__scrapeRange = async function(startIdx, endIdx) {
  const results = [];
  for (let i = startIdx; i < Math.min(endIdx, window.__targets.length); i++) {
    const k = window.__targets[i].pid + '|' + window.__targets[i].ssn;
    if (window.__scoring[k]) { results.push(i + ': SKIP (already done) ' + k); continue; }
    const r = await window.__scrapeCard(i);
    results.push(r);
  }
  return results.join('\n');
};

'ready: ' + window.__targets.length + ' targets';
