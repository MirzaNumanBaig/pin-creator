'use strict';

// ── Theme ─────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('pin_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtn(saved);
})();

function updateThemeBtn(theme) {
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  icon.textContent = theme === 'dark' ? '☀' : '☾';
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pin_theme', next);
  updateThemeBtn(next);
});

// ── Mobile sidebar toggle ─────────────────────────────────
(function initMobileNav() {
  const hamburger = document.getElementById('hamburger-btn');
  const sidebar   = document.querySelector('.sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  if (!hamburger) return;
  function openSidebar()  { sidebar.classList.add('open');    overlay.classList.add('show'); }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }
  hamburger.addEventListener('click', () =>
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar()
  );
  overlay.addEventListener('click', closeSidebar);
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', closeSidebar)
  );
})();

// ── Tab routing ───────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'history')   renderHistory();
    if (btn.dataset.tab === 'scheduled') renderScheduled();
  });
});

// ── Toast ─────────────────────────────────────────────────
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Auth status helpers ────────────────────────────────────
function setAuthConnected() {
  document.getElementById('auth-dot').className = 'auth-dot connected';
  document.getElementById('auth-status-text').textContent = 'Connected';
  document.getElementById('connect-btn').style.display = 'none';
  document.getElementById('disconnect-btn').style.display = '';
}
function setAuthDisconnected() {
  document.getElementById('auth-dot').className = 'auth-dot disconnected';
  document.getElementById('auth-status-text').textContent = 'Not connected';
  document.getElementById('connect-btn').style.display = '';
  document.getElementById('disconnect-btn').style.display = 'none';
  document.getElementById('auth-profile').style.display = 'none';
}

async function loadUserProfile() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const user = await res.json();
    if (!user.username) return;
    const card = document.getElementById('auth-profile');
    document.getElementById('auth-username').textContent = '@' + user.username;
    document.getElementById('auth-account-type').textContent = (user.accountType || '').toLowerCase().replace('_', ' ');
    const avatar = document.getElementById('auth-avatar');
    if (user.profileImage) {
      avatar.src = user.profileImage;
      avatar.style.display = '';
    } else {
      avatar.style.display = 'none';
    }
    card.style.display = 'flex';
  } catch (_) { /* ignore */ }
}

// ── Disconnect ────────────────────────────────────────────
document.getElementById('disconnect-btn').addEventListener('click', async () => {
  try {
    await fetch('/auth/logout');
  } catch (_) { /* ignore network errors */ }
  localStorage.setItem('pin_disconnected', '1');
  boardsCache = [];
  setAuthDisconnected();
  document.querySelectorAll('.row-board-select').forEach(sel => {
    sel.innerHTML = '<option value="">Connect Pinterest first</option>';
  });
  const bb = document.getElementById('b-board');
  if (bb) bb.innerHTML = '<option value="">Connect Pinterest first</option>';
  toast('Disconnected from Pinterest');
});

// ── Boards ─────────────────────────────────────────────────
let boardsCache = [];

function boardOptionsHtml(selectedId) {
  if (!boardsCache.length) return '<option value="">Connect Pinterest first</option>';
  return boardsCache.map(b =>
    `<option value="${b.id}"${b.id === selectedId ? ' selected' : ''}>${b.name} · (${b.pinCount} pins)</option>`
  ).join('');
}

function updateAllBoardSelects(preselectId) {
  document.querySelectorAll('.row-board-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = boardOptionsHtml(preselectId || cur);
  });
  const bb = document.getElementById('b-board');
  if (bb) bb.innerHTML = boardOptionsHtml();
}

async function loadBoards() {
  if (localStorage.getItem('pin_disconnected') === '1') {
    setAuthDisconnected();
    boardsCache = [];
    document.querySelectorAll('.row-board-select').forEach(sel => {
      sel.innerHTML = '<option value="">Connect Pinterest first</option>';
    });
    const bb = document.getElementById('b-board');
    if (bb) bb.innerHTML = '<option value="">Connect Pinterest first</option>';
    return;
  }
  try {
    const res = await fetch('/api/boards');
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    if (!data.connected) {
      setAuthDisconnected();
      boardsCache = [];
      document.querySelectorAll('.row-board-select').forEach(sel => {
        sel.innerHTML = '<option value="">Connect Pinterest first</option>';
      });
      const bb = document.getElementById('b-board');
      if (bb) bb.innerHTML = '<option value="">Connect Pinterest first</option>';
      return;
    }
    boardsCache = data.boards;
    updateAllBoardSelects();
    setAuthConnected();
    loadUserProfile();
  } catch {
    setAuthDisconnected();
    boardsCache = [];
    document.querySelectorAll('.row-board-select').forEach(sel => {
      sel.innerHTML = '<option value="">Connect Pinterest first</option>';
    });
    const bb = document.getElementById('b-board');
    if (bb) bb.innerHTML = '<option value="">Connect Pinterest first</option>';
  }
}

// ── Create Board Modal ─────────────────────────────────────
function openCreateBoardModal() {
  document.getElementById('modal-board-name').value = '';
  document.getElementById('create-board-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-board-name').focus(), 50);
}
function closeCreateBoardModal() {
  document.getElementById('create-board-modal').style.display = 'none';
}
function handleModalOverlayClick(e) {
  if (e.target.id === 'create-board-modal') closeCreateBoardModal();
}
document.getElementById('modal-board-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') createBoardFromModal();
});

async function createBoardFromModal() {
  const name    = document.getElementById('modal-board-name').value.trim();
  const privacy = document.getElementById('modal-board-privacy').value;
  if (!name) { toast('Enter a board name', 'err'); return; }

  const btn = document.getElementById('modal-create-btn');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const res  = await fetch('/api/boards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, privacy }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    boardsCache.unshift({ id: data.board.id, name: data.board.name, description: '', pinCount: 0 });
    updateAllBoardSelects(data.board.id);
    closeCreateBoardModal();
    toast(`Board "${data.board.name}" created!`);
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Board';
  }
}

// ── OAuth redirect params ──────────────────────────────────
(function handleOAuthParams() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('connected') === '1') {
    localStorage.removeItem('pin_disconnected');
    toast('Pinterest connected successfully!');
    window.history.replaceState({}, '', '/');
  } else if (p.get('auth_error')) {
    toast('Pinterest auth failed: ' + p.get('auth_error'), 'err');
    window.history.replaceState({}, '', '/');
  }
})();

// ── Timezones ──────────────────────────────────────────────
const TIMEZONES = [
  { label: 'UTC (GMT+0)',              value: 'UTC' },
  { label: 'New York (EST/EDT)',        value: 'America/New_York' },
  { label: 'Chicago (CST/CDT)',         value: 'America/Chicago' },
  { label: 'Denver (MST/MDT)',          value: 'America/Denver' },
  { label: 'Los Angeles (PST/PDT)',     value: 'America/Los_Angeles' },
  { label: 'Toronto (EST/EDT)',         value: 'America/Toronto' },
  { label: 'London (GMT/BST)',          value: 'Europe/London' },
  { label: 'Paris / Berlin (CET)',      value: 'Europe/Paris' },
  { label: 'Dubai (GST +4)',            value: 'Asia/Dubai' },
  { label: 'Karachi (PKT +5)',          value: 'Asia/Karachi' },
  { label: 'Mumbai / Delhi (IST +5:30)',value: 'Asia/Kolkata' },
  { label: 'Dhaka (BST +6)',            value: 'Asia/Dhaka' },
  { label: 'Bangkok (ICT +7)',          value: 'Asia/Bangkok' },
  { label: 'Singapore (SGT +8)',        value: 'Asia/Singapore' },
  { label: 'Tokyo (JST +9)',            value: 'Asia/Tokyo' },
  { label: 'Sydney (AEST/AEDT)',        value: 'Australia/Sydney' },
  { label: 'Auckland (NZST/NZDT)',      value: 'Pacific/Auckland' },
];

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

function timezoneOptionsHtml(selected) {
  const sel = selected || browserTz;
  let matched = TIMEZONES.some(t => t.value === sel);
  let html = TIMEZONES.map(t =>
    `<option value="${t.value}"${t.value === sel ? ' selected' : ''}>${t.label}</option>`
  ).join('');
  if (!matched) html = `<option value="${sel}" selected>${sel}</option>` + html;
  return html;
}

// Convert datetime-local string + timezone name → UTC Date
function parseDateInTimezone(dtStr, tzName) {
  // Treat dtStr as UTC to get its numeric value, then adjust for tz offset
  const asUtc = new Date(dtStr + ':00.000Z');
  // Find what asUtc looks like in tzName
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(asUtc).forEach(p => { parts[p.type] = p.value; });
  const h = parts.hour === '24' ? '00' : parts.hour;
  const tzMs = new Date(`${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:00Z`).getTime();
  // diff = asUtc - tzMs is the tz offset in ms (asUtc > tzMs when tz is behind UTC)
  return new Date(asUtc.getTime() + (asUtc.getTime() - tzMs));
}

// ── Pin Rows ──────────────────────────────────────────────
let rowCounter = 0;

function addRow() {
  rowCounter++;
  const id  = rowCounter;
  document.getElementById('pin-rows').insertAdjacentHTML('beforeend', buildRowHtml(id));
  document.getElementById(`r${id}-board`).innerHTML = boardOptionsHtml();
  updateRowNumbers();
}

function removeRow(id) {
  const el = document.getElementById(`pin-row-${id}`);
  if (el) el.remove();
  updateRowNumbers();
  if (!document.querySelector('.pin-row')) addRow();
}

function updateRowNumbers() {
  document.querySelectorAll('.pin-row').forEach((row, i) => {
    const el = row.querySelector('.row-num-val');
    if (el) el.textContent = i + 1;
  });
}

function toggleSchedule(id) {
  const chk    = document.getElementById(`r${id}-sched-chk`);
  const panel  = document.getElementById(`r${id}-sched-panel`);
  const postBtn= document.getElementById(`r${id}-post-btn`);
  if (chk.checked) {
    panel.style.display = '';
    postBtn.textContent = 'Schedule Pin';
    // Default datetime to 1 hour from now
    const dt = new Date(Date.now() + 3600000);
    dt.setSeconds(0, 0);
    const pad = n => String(n).padStart(2, '0');
    const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const dtInput = document.getElementById(`r${id}-datetime`);
    if (!dtInput.value) dtInput.value = local;
    dtInput.min = local;
  } else {
    panel.style.display = 'none';
    postBtn.textContent = 'Post to Pinterest';
  }
}

function toggleAiOptions(id) {
  const on = document.getElementById(`r${id}-ai`).checked;
  document.getElementById(`r${id}-ai-opts`).style.display = on ? '' : 'none';
}

function cloneRow(srcId) {
  rowCounter++;
  const newId = rowCounter;
  const srcUrl     = document.getElementById(`r${srcId}-url`)?.value    || '';
  const srcTags    = document.getElementById(`r${srcId}-tags`)?.value   || '';
  const srcBoard   = document.getElementById(`r${srcId}-board`)?.value  || '';
  const srcAi      = document.getElementById(`r${srcId}-ai`)?.checked   || false;
  const srcAiTitle = document.getElementById(`r${srcId}-ai-title`)?.checked ?? true;
  const srcAiDesc  = document.getElementById(`r${srcId}-ai-desc`)?.checked  ?? true;

  document.getElementById('pin-rows').insertAdjacentHTML('beforeend', buildRowHtml(newId));
  document.getElementById(`r${newId}-board`).innerHTML = boardOptionsHtml(srcBoard);
  document.getElementById(`r${newId}-url`).value  = srcUrl;
  document.getElementById(`r${newId}-tags`).value = srcTags;
  if (srcAi) {
    document.getElementById(`r${newId}-ai`).checked = true;
    toggleAiOptions(newId);
    document.getElementById(`r${newId}-ai-title`).checked = srcAiTitle;
    document.getElementById(`r${newId}-ai-desc`).checked  = srcAiDesc;
  }
  updateRowNumbers();
}

function buildRowHtml(id) {
  return `
<div class="pin-row" id="pin-row-${id}">
  <div class="pin-row-header">
    <span class="row-num">URL # <span class="row-num-val">${rowCounter}</span></span>
    <div class="row-header-btns">
      <button class="btn--xs" onclick="cloneRow(${id})" title="Clone row">⧉ Clone</button>
      <button class="row-remove-btn" onclick="removeRow(${id})" title="Remove row">✕</button>
    </div>
  </div>
  <div class="pin-row-body">
    <div class="row-form">
      <div class="form-group">
        <label>Product URL <span class="req">*</span> <span class="hint">(with your affiliate tag — also used as pin destination)</span></label>
        <input type="url" id="r${id}-url" placeholder="https://www.amazon.com/dp/ASIN?tag=your-tag" />
      </div>
      <div class="row-two-col">
        <div class="form-group">
          <label>Board</label>
          <select id="r${id}-board" class="row-board-select"></select>
        </div>
        <div class="form-group">
          <label>Hashtags <span class="hint">(comma-separated)</span></label>
          <input type="text" id="r${id}-tags" placeholder="deals, amazon, tech" />
        </div>
      </div>
      <div class="row-toggles">
        <span class="toggle-label">
          <label class="toggle"><input type="checkbox" id="r${id}-ai" onchange="toggleAiOptions(${id})" /><span class="slider"></span></label>
          AI Polish <span class="hint">(GPT-4o-mini)</span>
        </span>
        <span class="toggle-label">
          <label class="toggle"><input type="checkbox" id="r${id}-sched-chk" onchange="toggleSchedule(${id})" /><span class="slider"></span></label>
          Schedule for later
        </span>
      </div>
      <div class="ai-subopts" id="r${id}-ai-opts" style="display:none">
        <label class="ai-subopt-label">
          <input type="checkbox" id="r${id}-ai-title" checked /> Improve Title
        </label>
        <label class="ai-subopt-label">
          <input type="checkbox" id="r${id}-ai-desc" checked /> Improve Description
        </label>
      </div>
      <div class="schedule-panel" id="r${id}-sched-panel" style="display:none">
        <div class="schedule-grid">
          <div class="form-group">
            <label>Timezone</label>
            <select id="r${id}-tz">${timezoneOptionsHtml()}</select>
          </div>
          <div class="form-group">
            <label>Date &amp; Time</label>
            <input type="datetime-local" id="r${id}-datetime" />
          </div>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn btn--secondary btn--sm" onclick="previewRow(${id})">Preview</button>
        <button class="btn btn--primary btn--sm" id="r${id}-post-btn" onclick="postRow(${id})">Post to Pinterest</button>
      </div>
      <div class="row-result" id="r${id}-result" style="display:none"></div>
    </div>
    <div class="row-preview-panel" id="r${id}-prev-panel" style="display:none">
      <h3>Preview</h3>
      <img id="r${id}-prev-img" src="" alt="" onerror="this.style.display='none'" />
      <div class="pin-title" id="r${id}-prev-title"></div>
      <div class="pin-desc"  id="r${id}-prev-desc"></div>
      <a class="pin-link"    id="r${id}-prev-link" href="#" target="_blank"></a>
      <div class="char-counts">
        <span id="r${id}-prev-tlen">0</span>/100 title &nbsp;·&nbsp;
        <span id="r${id}-prev-dlen">0</span>/500 desc
      </div>
    </div>
  </div>
</div>`;
}

// ── Preview row ───────────────────────────────────────────
async function previewRow(id) {
  const url     = document.getElementById(`r${id}-url`).value.trim();
  const board   = document.getElementById(`r${id}-board`).value;
  const tags    = document.getElementById(`r${id}-tags`).value;
  const ai      = document.getElementById(`r${id}-ai`).checked;
  const aiTitle = ai ? (document.getElementById(`r${id}-ai-title`)?.checked ?? true) : false;
  const aiDesc  = ai ? (document.getElementById(`r${id}-ai-desc`)?.checked  ?? true) : false;
  if (!url) { toast('Product URL is required', 'err'); return; }

  const btn = document.querySelector(`#pin-row-${id} .btn--secondary`);
  btn.disabled = true; btn.textContent = 'Scraping…';
  try {
    const res  = await fetch('/api/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, board, hashtags: tags, ai, aiTitle, aiDesc }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const { pin, meta } = data;
    const imgEl = document.getElementById(`r${id}-prev-img`);
    imgEl.style.display = '';
    imgEl.src = pin.imageUrl || '';
    document.getElementById(`r${id}-prev-title`).textContent = pin.title;
    document.getElementById(`r${id}-prev-desc`).textContent  = pin.description;
    const lnk = document.getElementById(`r${id}-prev-link`);
    lnk.href = pin.link;
    lnk.textContent = pin.link.length > 50 ? pin.link.slice(0, 47) + '…' : pin.link;
    document.getElementById(`r${id}-prev-tlen`).textContent = meta.titleLen;
    document.getElementById(`r${id}-prev-dlen`).textContent = meta.descLen;
    document.getElementById(`r${id}-prev-panel`).style.display = '';
    toast('Preview ready');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Preview';
  }
}

// ── Post / Schedule row ───────────────────────────────────
async function postRow(id) {
  const url      = document.getElementById(`r${id}-url`).value.trim();
  const board    = document.getElementById(`r${id}-board`).value;
  const tags     = document.getElementById(`r${id}-tags`).value;
  const ai       = document.getElementById(`r${id}-ai`).checked;
  const aiTitle  = ai ? (document.getElementById(`r${id}-ai-title`)?.checked ?? true) : false;
  const aiDesc   = ai ? (document.getElementById(`r${id}-ai-desc`)?.checked  ?? true) : false;
  const schedule = document.getElementById(`r${id}-sched-chk`).checked;

  if (!url)   { toast('Product URL is required', 'err'); return; }
  if (!board) { toast('Select a board first', 'err');    return; }

  if (schedule) { scheduleRow(id, url, board, tags, ai, aiTitle, aiDesc); return; }

  await doPostNow(id, url, board, tags, ai, aiTitle, aiDesc);
}

async function doPostNow(id, url, board, tags, ai, aiTitle = true, aiDesc = true) {
  const btn      = document.getElementById(`r${id}-post-btn`);
  const resultEl = document.getElementById(`r${id}-result`);
  btn.disabled = true; btn.textContent = 'Posting…';
  resultEl.style.display = 'none';
  try {
    const res  = await fetch('/api/post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, board, hashtags: tags, ai, aiTitle, aiDesc }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    resultEl.className = 'row-result success';
    resultEl.innerHTML = `Posted! <a href="${data.pinUrl}" target="_blank" style="color:inherit">${data.pinUrl}</a>`;
    resultEl.style.display = '';
    toast('Pin posted successfully!');

    const boardName = boardsCache.find(b => b.id === board)?.name || board;
    saveHistory({
      url, board: boardName,
      title:    document.getElementById(`r${id}-prev-title`)?.textContent || url,
      imageUrl: document.getElementById(`r${id}-prev-img`)?.src || '',
      pinUrl:   data.pinUrl, status: 'success',
    });
  } catch (err) {
    resultEl.className = 'row-result error';
    resultEl.textContent = err.message;
    resultEl.style.display = '';
    toast(err.message, 'err');
    saveHistory({ url, board, title: url, imageUrl: '', pinUrl: '', status: 'failed', error: err.message });
  } finally {
    btn.disabled = false;
    btn.textContent = document.getElementById(`r${id}-sched-chk`)?.checked ? 'Schedule Pin' : 'Post to Pinterest';
  }
}

// ── Scheduling ────────────────────────────────────────────
let scheduledPins = [];

function loadScheduled() {
  try {
    const saved = localStorage.getItem('pin_scheduled');
    if (saved) scheduledPins = JSON.parse(saved);
  } catch { scheduledPins = []; }

  // Re-arm timers for pending items
  scheduledPins.forEach(item => {
    if (item.status !== 'pending') return;
    const delay = new Date(item.fireAt).getTime() - Date.now();
    const handler = item.type === 'batch' ? fireBatchScheduled : fireScheduled;
    item._timerId = setTimeout(() => handler(item.id), Math.max(delay, 500));
  });
  updateScheduledBadge();
}

function saveScheduledStorage() {
  localStorage.setItem('pin_scheduled',
    JSON.stringify(scheduledPins.map(({ _timerId, ...rest }) => rest))
  );
}

function scheduleRow(id, url, board, tags, ai, aiTitle = true, aiDesc = true) {
  const tz      = document.getElementById(`r${id}-tz`).value;
  const dtVal   = document.getElementById(`r${id}-datetime`).value;
  if (!dtVal) { toast('Select a date and time', 'err'); return; }

  const fireAt = parseDateInTimezone(dtVal, tz);
  if (fireAt <= new Date()) { toast('Scheduled time must be in the future', 'err'); return; }

  const boardName = boardsCache.find(b => b.id === board)?.name || board;
  const item = {
    id: `sch-${Date.now()}`,
    url, board, boardName, tags, ai, aiTitle, aiDesc, tz,
    fireAt: fireAt.toISOString(),
    title:    document.getElementById(`r${id}-prev-title`)?.textContent || url,
    imageUrl: document.getElementById(`r${id}-prev-img`)?.src || '',
    status: 'pending',
  };

  item._timerId = setTimeout(() => fireScheduled(item.id), fireAt.getTime() - Date.now());
  scheduledPins.push(item);
  saveScheduledStorage();
  updateScheduledBadge();

  const resultEl = document.getElementById(`r${id}-result`);
  resultEl.className = 'row-result success';
  resultEl.innerHTML = `Scheduled for ${fireAt.toLocaleString()} <span class="hint">(${tz})</span>`;
  resultEl.style.display = '';
  toast(`Pin scheduled for ${fireAt.toLocaleString()}!`);
}

async function fireScheduled(scheduledId) {
  const item = scheduledPins.find(p => p.id === scheduledId);
  if (!item || item.status !== 'pending') return;
  item.status = 'firing';
  renderScheduled();
  try {
    const res  = await fetch('/api/post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: item.url, board: item.board, hashtags: item.tags, ai: item.ai, aiTitle: item.aiTitle ?? true, aiDesc: item.aiDesc ?? true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    item.status = 'done'; item.pinUrl = data.pinUrl;
    saveHistory({ url: item.url, board: item.boardName, title: item.title, imageUrl: item.imageUrl, pinUrl: data.pinUrl, status: 'success' });
    toast(`Scheduled pin posted!`);
  } catch (err) {
    item.status = 'failed'; item.error = err.message;
    saveHistory({ url: item.url, board: item.boardName, title: item.title, imageUrl: item.imageUrl, pinUrl: '', status: 'failed', error: err.message });
    toast(`Scheduled pin failed: ${err.message}`, 'err');
  }
  saveScheduledStorage();
  updateScheduledBadge();
  renderScheduled();
}

function cancelScheduled(scheduledId) {
  const idx = scheduledPins.findIndex(p => p.id === scheduledId);
  if (idx === -1) return;
  clearTimeout(scheduledPins[idx]._timerId);
  scheduledPins.splice(idx, 1);
  saveScheduledStorage();
  updateScheduledBadge();
  renderScheduled();
  toast('Scheduled pin cancelled');
}

function updateScheduledBadge() {
  const n     = scheduledPins.filter(p => p.status === 'pending').length;
  const badge = document.getElementById('scheduled-count');
  badge.textContent = n;
  badge.style.display = n ? '' : 'none';
  // Also update notification bell badge
  const notifBadge = document.getElementById('notif-badge');
  notifBadge.textContent = n;
  notifBadge.style.display = n ? '' : 'none';
}

function renderScheduled() {
  const listEl  = document.getElementById('scheduled-list');
  const emptyEl = document.getElementById('scheduled-empty');
  if (!listEl) return;
  if (!scheduledPins.length) { emptyEl.style.display = ''; listEl.innerHTML = ''; return; }
  emptyEl.style.display = 'none';

  listEl.innerHTML = scheduledPins.map(item => {
    const d = new Date(item.fireAt);
    const statusMap = { pending: 'badge--yellow', firing: 'badge--yellow', done: 'badge--green', failed: 'badge--red' };
    const labelMap  = { pending: 'Pending', firing: 'Posting…', done: 'Posted', failed: 'Failed' };
    const isBatch = item.type === 'batch';
    const displayTitle = isBatch ? item.title : (item.title || item.url);
    const typeLabel = isBatch ? '<span class="badge badge--gray" style="font-size:10px;padding:2px 6px;margin-left:6px">BATCH</span>' : '';
    return `
<div class="scheduled-item ${item.status}">
  ${!isBatch && item.imageUrl
    ? `<img class="scheduled-thumb" src="${item.imageUrl}" alt="" onerror="this.style.display='none'" />`
    : isBatch
      ? '<div class="scheduled-thumb-placeholder" style="display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>'
      : '<div class="scheduled-thumb-placeholder"></div>'}
  <div class="scheduled-body">
    <div class="scheduled-title">${escHtml(displayTitle)}${typeLabel}</div>
    <div class="scheduled-meta">Board: ${escHtml(item.boardName)} &nbsp;·&nbsp; ${escHtml(item.tz)}${isBatch ? ` &nbsp;·&nbsp; Delay: ${item.delay || 15}s` : ''}</div>
    <div class="scheduled-time">${d.toLocaleString()}${item.status === 'pending' ? `&nbsp;<span class="countdown" data-fire="${item.fireAt}"></span>` : ''}</div>
    ${item.status === 'failed' ? `<div class="scheduled-error">${escHtml(item.error || '')}</div>` : ''}
    ${item.status === 'done' && !isBatch ? `<a class="pin-link" href="${item.pinUrl}" target="_blank">View pin →</a>` : ''}
    ${item.status === 'done' && isBatch ? `<div class="muted" style="font-size:12px;margin-top:2px">${escHtml(item.result || '')}</div>` : ''}
  </div>
  <div class="scheduled-right">
    <span class="badge ${statusMap[item.status]}">${labelMap[item.status]}</span>
    ${item.status === 'pending' ? `<button class="btn--xs" onclick="cancelScheduled('${item.id}')">Cancel</button>` : ''}
  </div>
</div>`;
  }).join('');
  updateCountdowns();
}

function updateCountdowns() {
  document.querySelectorAll('.countdown[data-fire]').forEach(el => {
    const diff = new Date(el.dataset.fire) - Date.now();
    if (diff <= 0) { el.textContent = ''; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = h > 0 ? `· in ${h}h ${m}m` : m > 0 ? `· in ${m}m ${s}s` : `· in ${s}s`;
  });
}
setInterval(updateCountdowns, 1000);

// ── Batch Scheduled Fire ─────────────────────────────────
async function fireBatchScheduled(scheduledId) {
  const item = scheduledPins.find(p => p.id === scheduledId);
  if (!item || item.status !== 'pending') return;
  item.status = 'firing';
  saveScheduledStorage();
  updateScheduledBadge();
  updateNotifPanel();
  renderScheduled();

  // Build CSV file from stored data
  let csvBlob;
  if (item.urls) {
    const csv = 'product_url\n' + item.urls.join('\n');
    csvBlob = new Blob([csv], { type: 'text/csv' });
  } else if (item.csvText) {
    csvBlob = new Blob([item.csvText], { type: 'text/csv' });
  }

  if (!csvBlob) {
    item.status = 'failed';
    item.error = 'No URLs found for this batch';
    saveScheduledStorage();
    updateScheduledBadge();
    updateNotifPanel();
    renderScheduled();
    toast('Scheduled batch failed: no URLs', 'err');
    return;
  }

  const form = new FormData();
  form.append('file', csvBlob, 'batch.csv');
  form.append('board', item.board);
  form.append('delay', (item.delay || 15) * 1000);
  form.append('ai', item.ai || false);
  form.append('aiTitle', item.aiTitle ?? true);
  form.append('aiDesc', item.aiDesc ?? true);

  let success = 0, failed = 0;
  try {
    const res     = await fetch('/api/batch', { method: 'POST', body: form });
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim();
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'progress') {
          if (ev.status === 'ok') {
            success++;
            saveHistory({ url: ev.url, board: item.boardName, title: ev.title || ev.url, imageUrl: '', pinUrl: ev.pinUrl, status: 'success' });
          } else {
            failed++;
            saveHistory({ url: ev.url, board: item.boardName, title: ev.url, imageUrl: '', pinUrl: '', status: 'failed', error: ev.error });
          }
        }
      }
    }

    item.status = 'done';
    item.result = `${success} posted, ${failed} failed`;
    toast(`Scheduled batch done: ${success} posted, ${failed} failed`, failed > 0 ? 'warn' : 'ok');
  } catch (err) {
    item.status = 'failed';
    item.error = err.message;
    toast(`Scheduled batch failed: ${err.message}`, 'err');
  }
  saveScheduledStorage();
  updateScheduledBadge();
  updateNotifPanel();
  renderScheduled();
}

// ── Notification Panel ───────────────────────────────────
function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) updateNotifPanel();
}

// Close notif panel when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const bell  = document.getElementById('notif-toggle');
  if (panel.style.display !== 'none' && !panel.contains(e.target) && !bell.contains(e.target)) {
    panel.style.display = 'none';
  }
});

function updateNotifPanel() {
  const body = document.getElementById('notif-panel-body');
  if (!body) return;
  const items = scheduledPins.filter(p => p.status === 'pending' || p.status === 'firing');
  if (!items.length) {
    body.innerHTML = '<p class="muted" style="padding:20px;text-align:center">No scheduled items</p>';
    return;
  }
  body.innerHTML = items.map(item => {
    const d = new Date(item.fireAt);
    const isBatch = item.type === 'batch';
    const label = isBatch ? item.title : (item.title || item.url);
    const statusDot = item.status === 'firing' ? 'firing' : 'pending';
    const timeStr = item.status === 'firing' ? 'Posting now...' : d.toLocaleString();
    return `
<div class="notif-item">
  <span class="notif-dot ${statusDot}"></span>
  <div class="notif-info">
    <div class="notif-title">${escHtml(label)}</div>
    <div class="notif-meta">${escHtml(item.boardName || '')} &middot; ${timeStr}</div>
  </div>
  ${item.status === 'pending' ? `<button class="btn--xs notif-cancel" onclick="cancelScheduled('${item.id}')">Cancel</button>` : ''}
</div>`;
  }).join('');
}

// ── History ───────────────────────────────────────────────
let history = [];

function loadHistory() {
  try { const s = localStorage.getItem('pin_history'); if (s) history = JSON.parse(s); }
  catch { history = []; }
}

function saveHistory({ url, board, title, imageUrl, pinUrl, status, error = '' }) {
  history.unshift({ id: Date.now().toString(), timestamp: new Date().toISOString(), url, board, title, imageUrl, pinUrl, status, error });
  if (history.length > 500) history = history.slice(0, 500);
  localStorage.setItem('pin_history', JSON.stringify(history));
}

function clearHistory() {
  if (!confirm('Clear all history?')) return;
  history = [];
  localStorage.removeItem('pin_history');
  renderHistory();
  toast('History cleared');
}

function renderHistory() {
  const listEl  = document.getElementById('history-list');
  const emptyEl = document.getElementById('history-empty');
  const statsEl = document.getElementById('history-stats');
  if (!listEl) return;

  const now   = new Date();
  const total = history.length;
  const today = history.filter(h => {
    const d = new Date(h.timestamp);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const week   = history.filter(h => Date.now() - new Date(h.timestamp) < 7 * 86400000).length;
  const failed = history.filter(h => h.status === 'failed').length;

  statsEl.innerHTML = `
    <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">Total Posted</div></div>
    <div class="stat-card"><div class="stat-num">${today}</div><div class="stat-label">Today</div></div>
    <div class="stat-card"><div class="stat-num">${week}</div><div class="stat-label">This Week</div></div>
    <div class="stat-card stat-card--error"><div class="stat-num">${failed}</div><div class="stat-label">Failed</div></div>`;

  if (!history.length) { emptyEl.style.display = ''; listEl.innerHTML = ''; return; }
  emptyEl.style.display = 'none';

  listEl.innerHTML = history.map(item => {
    const date   = new Date(item.timestamp).toLocaleString();
    const badge  = item.status === 'success'
      ? '<span class="badge badge--green">Success</span>'
      : '<span class="badge badge--red">Failed</span>';
    return `
<div class="history-item">
  ${item.imageUrl
    ? `<img class="history-thumb" src="${item.imageUrl}" alt="" onerror="this.style.display='none'" />`
    : '<div class="history-thumb-placeholder"></div>'}
  <div class="history-body">
    <div class="history-title">${escHtml(item.title || item.url)}</div>
    <div class="history-url muted">${escHtml(item.url)}</div>
    <div class="history-meta">
      Board: ${escHtml(item.board)}
      ${item.pinUrl ? `&nbsp;·&nbsp; <a class="pin-link" href="${item.pinUrl}" target="_blank">View pin →</a>` : ''}
      ${item.error  ? `&nbsp;·&nbsp; <span style="color:var(--error)">${escHtml(item.error)}</span>` : ''}
    </div>
  </div>
  <div class="history-right">${badge}<div class="history-date">${date}</div></div>
</div>`;
  }).join('');
}

// ── Utilities ─────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Batch: AI & Schedule toggles ──────────────────────────
function toggleBatchAi() {
  const on = document.getElementById('b-ai').checked;
  document.getElementById('b-ai-opts').style.display = on ? '' : 'none';
}

function toggleBatchSchedule() {
  const chk   = document.getElementById('b-sched-chk');
  const panel = document.getElementById('b-sched-panel');
  const btn   = document.getElementById('b-start-btn');
  if (chk.checked) {
    panel.style.display = '';
    btn.textContent = 'Schedule Batch';
    const dt = new Date(Date.now() + 3600000);
    dt.setSeconds(0, 0);
    const pad = n => String(n).padStart(2, '0');
    const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const dtInput = document.getElementById('b-datetime');
    if (!dtInput.value) dtInput.value = local;
    dtInput.min = local;
  } else {
    panel.style.display = 'none';
    btn.textContent = 'Start Batch';
  }
}

// ── Batch: mode switcher ──────────────────────────────────
function setBatchMode(mode) {
  const isUrls = mode === 'urls';
  document.getElementById('batch-urls-section').style.display = isUrls ? '' : 'none';
  document.getElementById('batch-csv-section').style.display  = isUrls ? 'none' : '';
  document.getElementById('bmode-urls').classList.toggle('active', isUrls);
  document.getElementById('bmode-csv').classList.toggle('active', !isUrls);
}

function getUrlsFromTextarea() {
  return document.getElementById('b-urls').value
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('http'));
}

document.getElementById('b-urls').addEventListener('input', () => {
  const urls = getUrlsFromTextarea();
  document.getElementById('b-url-count').textContent = urls.length
    ? `${urls.length} URL${urls.length !== 1 ? 's' : ''}`
    : '';
});

// ── Batch: log filter ────────────────────────────────────
let _batchFilter = 'all';
function filterBatchLog(filter) {
  _batchFilter = filter;
  // Update active cell styling
  ['all', 'ok', 'err'].forEach(f => {
    const cell = document.getElementById('bstat-' + f);
    if (cell) cell.classList.toggle('batch-stat--active', f === filter);
  });
  // Show/hide log rows
  document.querySelectorAll('#batch-log .log-row').forEach(row => {
    if (filter === 'all') {
      row.style.display = '';
    } else {
      row.style.display = row.classList.contains(filter) ? '' : 'none';
    }
  });
}

// ── Batch: file label ─────────────────────────────────────
document.getElementById('b-file').addEventListener('change', e => {
  const f = e.target.files[0];
  document.getElementById('file-label').textContent = f ? f.name : 'Drop CSV here or click to browse';
});

const dropZone = document.getElementById('file-drop');
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) { document.getElementById('b-file').files = e.dataTransfer.files; document.getElementById('file-label').textContent = f.name; }
});

// ── Batch: Preview first URL ──────────────────────────────
async function previewBatch() {
  const isUrlMode = document.getElementById('bmode-urls').classList.contains('active');
  const board   = document.getElementById('b-board').value || 'PREVIEW';
  const ai      = document.getElementById('b-ai').checked;
  const aiTitle = ai ? (document.getElementById('b-ai-title')?.checked ?? true) : false;
  const aiDesc  = ai ? (document.getElementById('b-ai-desc')?.checked ?? true) : false;

  let firstUrl = '';
  if (isUrlMode) {
    const urls = getUrlsFromTextarea();
    if (!urls.length) { toast('Paste at least one URL to preview', 'err'); return; }
    firstUrl = urls[0];
  } else {
    const file = document.getElementById('b-file').files[0];
    if (!file) { toast('Upload a CSV file first', 'err'); return; }
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const colIdx = header.indexOf('product_url');
      if (colIdx === -1) { toast('CSV must have a product_url column', 'err'); return; }
      const firstData = lines[1];
      if (!firstData) { toast('No data rows in CSV', 'err'); return; }
      const cols = firstData.match(/(\".*?\"|[^,]+)(?=\s*,|\s*$)/g) || [];
      firstUrl = (cols[colIdx] || '').replace(/^\"|\"$/g, '').trim();
    } catch { toast('Could not read CSV file', 'err'); return; }
  }

  if (!firstUrl) { toast('Could not find a URL to preview', 'err'); return; }

  const btn = document.getElementById('b-preview-btn');
  btn.disabled = true; btn.textContent = 'Scraping…';

  try {
    const res  = await fetch('/api/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: firstUrl, board, hashtags: [], ai, aiTitle, aiDesc }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const { pin, meta } = data;
    const imgEl = document.getElementById('b-prev-img');
    if (pin.imageUrl) { imgEl.src = pin.imageUrl; imgEl.style.display = ''; }
    else { imgEl.style.display = 'none'; }

    document.getElementById('b-prev-title').textContent = pin.title;
    document.getElementById('b-prev-desc').textContent  = pin.description;
    const lnk = document.getElementById('b-prev-link');
    lnk.href = pin.link;
    lnk.textContent = pin.link.length > 55 ? pin.link.slice(0, 52) + '…' : pin.link;
    document.getElementById('b-prev-tlen').textContent = meta.titleLen;
    document.getElementById('b-prev-dlen').textContent = meta.descLen;
    document.getElementById('b-prev-asin').textContent  = meta.asin  ? `ASIN: ${meta.asin}`   : '';
    document.getElementById('b-prev-price').textContent = meta.price ? `Price: ${meta.price}` : '';

    const card = document.getElementById('batch-preview-card');
    card.style.display = '';
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast('Preview ready');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Preview First URL';
  }
}

// ── Batch: Start ──────────────────────────────────────────
document.getElementById('b-start-btn').addEventListener('click', async () => {
  const isUrlMode = document.getElementById('bmode-urls').classList.contains('active');
  const board   = document.getElementById('b-board').value;
  const delay   = document.getElementById('b-delay').value;
  const ai      = document.getElementById('b-ai').checked;
  const aiTitle = ai ? (document.getElementById('b-ai-title')?.checked ?? true) : false;
  const aiDesc  = ai ? (document.getElementById('b-ai-desc')?.checked ?? true) : false;
  const schedule = document.getElementById('b-sched-chk').checked;

  let urls = [];
  let file;
  if (isUrlMode) {
    urls = getUrlsFromTextarea();
    if (!urls.length) { toast('Paste at least one URL', 'err'); return; }
    const csv = 'product_url\n' + urls.join('\n');
    file = new Blob([csv], { type: 'text/csv' });
  } else {
    file = document.getElementById('b-file').files[0];
    if (!file) { toast('Select a CSV file first', 'err'); return; }
  }

  if (!board) { toast('Select a board first', 'err'); return; }

  // ── Schedule batch for later ──
  if (schedule) {
    const tz    = document.getElementById('b-tz').value;
    const dtVal = document.getElementById('b-datetime').value;
    if (!dtVal) { toast('Select a date and time', 'err'); return; }
    const fireAt = parseDateInTimezone(dtVal, tz);
    if (fireAt <= new Date()) { toast('Scheduled time must be in the future', 'err'); return; }

    const boardName = boardsCache.find(b => b.id === board)?.name || board;
    const urlCount = isUrlMode ? urls.length : '?';
    const item = {
      id: `bsch-${Date.now()}`,
      type: 'batch',
      urls: isUrlMode ? urls : null,
      csvText: null,
      board, boardName, ai, aiTitle, aiDesc, tz,
      delay: parseInt(delay, 10),
      fireAt: fireAt.toISOString(),
      title: `Batch: ${urlCount} URLs → ${boardName}`,
      status: 'pending',
    };

    // If CSV file, read its text so we can store it
    if (!isUrlMode) {
      item.csvText = await file.text();
      const lines = item.csvText.split('\n').filter(l => l.trim());
      item.title = `Batch: ${Math.max(0, lines.length - 1)} URLs → ${boardName}`;
    }

    item._timerId = setTimeout(() => fireBatchScheduled(item.id), fireAt.getTime() - Date.now());
    scheduledPins.push(item);
    saveScheduledStorage();
    updateScheduledBadge();
    updateNotifPanel();
    renderScheduled();
    toast(`Batch scheduled for ${fireAt.toLocaleString()}!`);
    return;
  }

  // ── Run batch immediately ──
  const btn = document.getElementById('b-start-btn');
  btn.disabled = true; btn.textContent = 'Running…';

  const progCard    = document.getElementById('batch-progress');
  const progBar     = document.getElementById('prog-bar');
  const progLbl     = document.getElementById('prog-label');
  const progTotal   = document.getElementById('prog-total');
  const progSuccess = document.getElementById('prog-success');
  const progFailed  = document.getElementById('prog-failed');
  const batchLog    = document.getElementById('batch-log');
  progCard.style.display = '';
  batchLog.innerHTML = '';
  progBar.style.width = '0%';
  progTotal.textContent = '0';
  progSuccess.textContent = '0';
  progFailed.textContent = '0';
  filterBatchLog('all');
  progLbl.textContent = '0/0';

  const form = new FormData();
  form.append('file', file, 'batch.csv');
  form.append('board', board);
  form.append('delay', delay * 1000);
  form.append('ai', ai);
  form.append('aiTitle', aiTitle);
  form.append('aiDesc', aiDesc);

  try {
    const res     = await fetch('/api/batch', { method: 'POST', body: form });
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim();
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }

        if (ev.type === 'start') {
          total = ev.total;
          progTotal.textContent = total;
          progLbl.textContent = `0/${total}`;
        } else if (ev.type === 'progress') {
          progBar.style.width = Math.round((ev.index / total) * 100) + '%';
          progLbl.textContent = `${ev.index}/${total}`;
          const row = document.createElement('div');
          row.className = 'log-row ' + (ev.status === 'ok' ? 'ok' : 'err');
          // Show just the path portion of the URL for readability
          let shortUrl = ev.url;
          try { const u = new URL(ev.url); shortUrl = u.hostname + u.pathname.substring(0, 40); } catch (_) {}
          if (ev.status === 'ok') {
            progSuccess.textContent = parseInt(progSuccess.textContent || 0) + 1;
            row.innerHTML = `<span class="log-dot"></span><div><div class="log-title">${escHtml(ev.title || shortUrl)}</div><div class="log-url">${escHtml(shortUrl)}</div><a class="log-pin" href="${ev.pinUrl}" target="_blank">View pin →</a></div>`;
            saveHistory({ url: ev.url, board, title: ev.title || ev.url, imageUrl: '', pinUrl: ev.pinUrl, status: 'success' });
          } else {
            progFailed.textContent = parseInt(progFailed.textContent || 0) + 1;
            row.innerHTML = `<span class="log-dot"></span><div><div class="log-url">${escHtml(shortUrl)}</div><div class="log-err">${escHtml(ev.error)}</div></div>`;
            saveHistory({ url: ev.url, board, title: ev.url, imageUrl: '', pinUrl: '', status: 'failed', error: ev.error });
          }
          // Apply current filter to newly added row
          if (_batchFilter !== 'all' && !row.classList.contains(_batchFilter)) row.style.display = 'none';
          batchLog.appendChild(row);
          batchLog.scrollTop = batchLog.scrollHeight;
        } else if (ev.type === 'done') {
          toast(`Done: ${ev.success} posted, ${ev.failed} failed`, ev.failed > 0 ? 'warn' : 'ok');
        }
      }
    }
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Start Batch';
  }
});

// ── Init ─────────────────────────────────────────────────
loadHistory();
loadScheduled();
loadBoards();
addRow(); // Start with one empty row
// Populate batch timezone select
const bTzSel = document.getElementById('b-tz');
if (bTzSel) bTzSel.innerHTML = timezoneOptionsHtml();
updateNotifPanel();
