// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, filters, a per-protocol detail view with
// the model's own maths and the protocol's farm plan, the live-token comparables,
// and a model sandbox. No network: every byte it shows is in data.js.
//
// The farm plan and the implied value are the same derivation main.ts writes to
// board.json (category, chains, TVL and age decide the action, the capital, the
// hold and every cost and time). No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;

  var state = { q: '', category: 'all', chain: 'all', tab: 'pre', sort: 'implied', watchonly: false, page: 0, selected: null };
  var PAGE = 50;
  var watch = {};
  DATA.watchlist.forEach(function (s) { watch[s] = true; });

  function $(id) { return document.getElementById(id); }

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- the model, recomputed in the page from the snapshot figures ----
  function impliedOf(row, m) {
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var chainMult = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_max_bonus) * m.chain_step;
    var catMult = row.category_multiple * (m.cat_scale === undefined ? 1 : m.cat_scale);
    return { implied: Math.max(1, Math.round(row.tvl_usd * catMult * growthMult * maturity * chainMult)),
      catMult: catMult, growth: growth, growthMult: growthMult, maturity: maturity, chainMult: chainMult, age: age };
  }
  function sandboxModel() {
    return {
      growth_weight: parseFloat($('sb-growth').value),
      growth_floor: MODEL.growth_floor, growth_cap: MODEL.growth_cap,
      maturity_floor: parseFloat($('sb-mat').value),
      maturity_range: 1 - parseFloat($('sb-mat').value),
      maturity_days: MODEL.maturity_days, unknown_age_days: MODEL.unknown_age_days,
      chain_step: MODEL.chain_step, chain_max_bonus: MODEL.chain_max_bonus,
      cat_scale: parseFloat($('sb-cat').value)
    };
  }

  // ---- the farm plan, same derivation as main.ts ----
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(); var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow $10 against it, then repay the borrow.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and make one swap through it.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + " into " + name + "'s main yield position on " + chain + ' and keep it open.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' to the chain ' + name + ' runs and use two of its apps.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote once on its governance page.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $5 more against the supply, then repay it the same day.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Swap $10 through the pool and add the proceeds back to the position.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $10 across once more and use the funds in the destination app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim any staking rewards and restake them into the same position.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0) return 'Open and close one small trade so the week shows trading activity.';
    if (c.indexOf('prediction') >= 0) return 'Place one small market position and settle it before the week ends.';
    if (c.indexOf('governance') >= 0) return 'Vote on one open proposal, or delegate the vote if none is open.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield accrued and mint $10 more of the yield asset.';
    return 'Make one qualifying action, such as a deposit, a swap or a vote.';
  }
  function farmSteps(p) {
    var chain = chainOf(p); var capital = capitalFor(p); var hold = holdDaysFor(p.age_days);
    var weekly = weeklyFor(p); var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Once a week, ' + weekly.charAt(0).toLowerCase() + weekly.slice(1), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
  }

  // ---- header, stats, multiples ----
  $('meta').innerHTML = 'Snapshot ' + esc(DATA.as_of) + '<br>' + esc(DATA.source) + '<br>Model ' + esc(DATA.model_version);
  var maxTvl = Math.max.apply(null, DATA.rows.map(function (r) { return r.tvl_usd; }));
  $('stats').innerHTML =
    '<div class="stat"><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b><span>watchlist covered</span></div>' +
    '<div class="stat"><b>' + DATA.board_size + '</b><span>pre-token protocols ranked</span></div>' +
    '<div class="stat"><b>' + fmtUsd(DATA.rows[0].implied_value_usd) + '</b><span>top implied value — ' + esc(DATA.rows[0].name) + '</span></div>' +
    '<div class="stat"><b>' + DATA.live_size + '</b><span>live tokens shown as comparables</span></div>';
  var multRows = DATA.multiples.map(function (m) {
    return '<tr><td>' + esc(m.category) + '</td><td class="num">' + m.median.toFixed(3) + '</td><td class="num">' + m.live_count + '</td><td>' + (m.fallback ? '<span class="fb">global median</span>' : 'live median') + '</td></tr>';
  }).join('');
  $('mults').innerHTML = '<tr><th>Category</th><th class="num">mcap / TVL</th><th class="num">live n</th><th>Source</th></tr>' + multRows;

  // ---- filter controls ----
  var cats = [], chains = [];
  DATA.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; $('cat').appendChild(o); });
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o); });

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchonly && !watch[r.slug]) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (state.sort === 'tvl') rows.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (state.sort === 'growth') rows.sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); });
    else if (state.sort === 'age') rows.sort(function (a, b) { return (b.age_days || 0) - (a.age_days || 0); });
    else rows.sort(function (a, b) { return a.rank - b.rank; });
    return rows;
  }

  function renderBoard() {
    var rows = filteredRows();
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
    var maxImp = rows.length ? Math.max.apply(null, rows.map(function (r) { return r.implied_value_usd; })) : 1;
    var html = '<thead><tr><th>#</th><th>Protocol</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">Implied value</th></tr></thead><tbody>';
    if (slice.length === 0) html += '<tr><td colspan="6"><div class="empty">No protocols match these filters.</div></td></tr>';
    slice.forEach(function (r) {
      var g = r.change_7d; var gcls = g === null ? 'flat' : g > 0 ? 'up' : g < 0 ? 'down' : 'flat';
      var w = Math.max(2, Math.round(100 * r.implied_value_usd / maxImp));
      html += '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><span class="sub">' + esc(r.category || 'uncategorised') + (watch[r.slug] ? ' · watchlist' : '') + '</span>' +
        (r.chains || []).slice(0, 3).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + gcls + '">' + fmtPct(g) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num">' + fmtUsd(r.implied_value_usd) + '<div class="bar"><i style="width:' + w + '%"></i></div></td></tr>';
    });
    html += '</tbody>';
    $('board').innerHTML = html;
    $('count').textContent = rows.length + ' of ' + DATA.board_size + ' rows';
    $('board-title').textContent = 'Pre-token board';
    $('pager').innerHTML = '<button id="pg-prev"' + (state.page === 0 ? ' disabled' : '') + '>← Prev</button>' +
      '<span>page ' + (state.page + 1) + ' of ' + pages + '</span>' +
      '<button id="pg-next"' + (state.page >= pages - 1 ? ' disabled' : '') + '>Next →</button>';
    var prev = $('pg-prev'), next = $('pg-next');
    if (prev) prev.onclick = function () { if (state.page > 0) { state.page--; renderBoard(); } };
    if (next) next.onclick = function () { if (state.page < pages - 1) { state.page++; renderBoard(); } };
    Array.prototype.forEach.call($('board').querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.onclick = function () { select(tr.getAttribute('data-slug')); };
    });
  }

  function renderLive() {
    var rows = DATA.live.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); });
    var html = '<thead><tr><th>#</th><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>';
    rows.forEach(function (r, i) {
      var g = r.change_7d; var gcls = g === null ? 'flat' : g > 0 ? 'up' : g < 0 ? 'down' : 'flat';
      html += '<tr><td class="rank">' + (i + 1) + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><span class="sub">' + esc(r.category || 'uncategorised') + '</span>' +
        (r.chains || []).slice(0, 3).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.mcap_tvl === null ? 'n/a' : r.mcap_tvl.toFixed(3)) + '</td>' +
        '<td class="num ' + gcls + '">' + fmtPct(g) + '</td></tr>';
    });
    html += '</tbody>';
    $('board').innerHTML = html;
    $('count').textContent = rows.length + ' live tokens — the comparables behind the multiples';
    $('board-title').textContent = 'Live tokens · comparables';
    $('pager').innerHTML = '';
  }

  function render() {
    if (state.tab === 'live') { renderLive(); return; }
    renderBoard();
  }

  // ---- detail view ----
  function select(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    state.selected = slug;
    var panel = $('detail');
    if (!row) { panel.hidden = true; renderBoard(); return; }
    var v = impliedOf(row, MODEL);
    var base = Math.round(row.tvl_usd * v.catMult);
    var steps = farmSteps(row);
    var stepsHtml = steps.map(function (s) {
      return '<li>' + esc(s.text) + '<div class="cost"><b>Cost:</b> ' + esc(s.cost) + ' &nbsp;·&nbsp; <b>Time:</b> ' + esc(s.time) + '</div></li>';
    }).join('');
    panel.innerHTML =
      '<h2>#' + row.rank + ' — ' + esc(row.name) + ' <span class="sub">' + esc(row.category || 'uncategorised') + ' · records no token</span>' +
      '<button class="tab back" id="d-close">Close</button></h2>' +
      '<p class="note">Chains: ' + esc((row.chains || []).join(', ') || 'none listed') + ' · Listed: ' + esc(row.listed_at || 'unknown') +
      ' · Age: ' + fmtAge(row.age_days) + ' · TVL ' + fmtUsd(row.tvl_usd) + ' · 7-day change ' + fmtPct(row.change_7d) + '</p>' +
      '<div class="math">' +
      '<div class="cell"><b>' + fmtUsd(row.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div class="cell"><b>× ' + v.catMult.toFixed(3) + '</b><span>category multiple (' + esc(row.category || 'global') + ' live median)</span></div>' +
      '<div class="cell"><b>' + fmtUsd(base) + '</b><span>base value</span></div>' +
      '<div class="cell"><b>× ' + v.growthMult.toFixed(3) + '</b><span>growth (' + fmtPct(v.growth) + ' over 7d)</span></div>' +
      '<div class="cell"><b>× ' + v.maturity.toFixed(3) + '</b><span>maturity (' + fmtAge(v.age) + ' with no token)</span></div>' +
      '<div class="cell"><b>× ' + v.chainMult.toFixed(3) + '</b><span>chains (' + (row.chains || []).length + ')</span></div>' +
      '<div class="cell eq"><b>' + fmtUsd(row.implied_value_usd) + '</b><span>implied value</span></div>' +
      '</div>' +
      '<h2>Farm plan</h2><ol class="steps">' + stepsHtml + '</ol>' +
      '<p class="note">The plan is derived from this protocol’s own record — category, chain, TVL and age — ' +
      'not from a list of names. Costs are the capital plus gas; never pay anyone to claim an airdrop.</p>';
    panel.hidden = false;
    $('d-close').onclick = function () { state.selected = null; panel.hidden = true; renderBoard(); };
    if (state.tab === 'pre') renderBoard();
    panel.scrollIntoView({ block: 'nearest' });
  }

  // ---- sandbox ----
  $('sandbox').innerHTML =
    '<label>Growth weight <output id="sb-growth-v"></output><input id="sb-growth" type="range" min="0" max="1" step="0.05" value="' + MODEL.growth_weight + '"></label>' +
    '<label>Maturity floor <output id="sb-mat-v"></output><input id="sb-mat" type="range" min="0.5" max="0.9" step="0.05" value="' + MODEL.maturity_floor + '"></label>' +
    '<label>Category multiple scale <output id="sb-cat-v"></output><input id="sb-cat" type="range" min="0.5" max="2" step="0.1" value="1"></label>';
  function sandboxUpdate() {
    $('sb-growth-v').textContent = parseFloat($('sb-growth').value).toFixed(2);
    $('sb-mat-v').textContent = parseFloat($('sb-mat').value).toFixed(2);
    $('sb-cat-v').textContent = parseFloat($('sb-cat').value).toFixed(1) + '×';
    var m = sandboxModel();
    var rows = DATA.rows.map(function (r) { return { row: r, v: impliedOf(r, m) }; });
    rows.sort(function (a, b) { return b.v.implied - a.v.implied; });
    var top = rows.slice(0, 3).map(function (x, i) { return (i + 1) + '. ' + x.row.name + ' — ' + fmtUsd(x.v.implied); }).join('  ·  ');
    var note = document.getElementById('sb-top');
    if (!note) { note = document.createElement('p'); note.id = 'sb-top'; note.className = 'note'; $('sandbox').appendChild(note); }
    note.textContent = 'Sandbox top 3: ' + top;
  }
  ['sb-growth', 'sb-mat', 'sb-cat'].forEach(function (id) { $(id).addEventListener('input', sandboxUpdate); });
  sandboxUpdate();

  // ---- events ----
  $('q').addEventListener('input', function () { state.q = this.value; state.page = 0; render(); });
  $('cat').addEventListener('change', function () { state.category = this.value; state.page = 0; render(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; state.page = 0; render(); });
  $('sort').addEventListener('change', function () { state.sort = this.value; state.page = 0; render(); });
  $('watchonly').addEventListener('change', function () { state.watchonly = this.checked; state.page = 0; render(); });
  $('tab-pre').onclick = function () {
    state.tab = 'pre';
    $('tab-pre').classList.add('active'); $('tab-live').classList.remove('active');
    $('tab-pre').setAttribute('aria-selected', 'true'); $('tab-live').setAttribute('aria-selected', 'false');
    render();
  };
  $('tab-live').onclick = function () {
    state.tab = 'live';
    $('tab-live').classList.add('active'); $('tab-pre').classList.remove('active');
    $('tab-live').setAttribute('aria-selected', 'true'); $('tab-pre').setAttribute('aria-selected', 'false');
    render();
  };

  // ---- deep links: #detail=<slug>, #cat=<category>, #q=<text>, #tab=live ----
  function fromHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (part) {
      var kv = part.split('=');
      var k = decodeURIComponent(kv[0] || ''), v = decodeURIComponent(kv[1] || '');
      if (k === 'cat' && v) { state.category = v; $('cat').value = v; }
      if (k === 'q' && v) { state.q = v; $('q').value = v; }
      if (k === 'tab' && v === 'live') $('tab-live').onclick();
      if (k === 'detail' && v) state._detail = v;
    });
  }
  fromHash();
  render();
  if (state._detail) select(state._detail);
})();
