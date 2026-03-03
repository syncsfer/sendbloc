// ═══════════════════════════════════════════════════
// sendbloc-reactive.js
// Drop-in: <script src="sendbloc-reactive.js"></script>
// Place AFTER the existing <script> block or replace it
// ═══════════════════════════════════════════════════
(() => {
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ── TOAST ──
function toast(msg, type='info') {
  document.querySelectorAll('.sb-toast').forEach(t => t.remove());
  const c = { success:'#00d68f', error:'#e74c3c', info:'#627eea' };
  const el = document.createElement('div');
  el.className = 'sb-toast';
  el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface,#fff);border:1px solid var(--border,#eee);border-radius:14px;padding:12px 20px;box-shadow:0 8px 30px rgba(0,0,0,.12);z-index:999;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;animation:fadeUp .3s ease`;
  el.innerHTML = `<div style="width:8px;height:8px;border-radius:50%;background:${c[type]||c.info};flex-shrink:0"></div>${msg}`;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(() => el.remove(), 300); }, 3000);
}
// ── 1. CONNECT WALLET ──
let connected = false;
$('#connectBtn')?.addEventListener('click', toggleConnect);
function toggleConnect() {
  if (connected) return disconnect();
  const btn = $('#connectBtn');
  btn.textContent = 'Connecting...';
  btn.style.opacity = '.6';
  setTimeout(() => {
    connected = true;
    btn.textContent = '0x7a3b...8a6b';
    btn.style.opacity = '1';
    btn.style.background = 'var(--surface)';
    btn.style.color = 'var(--text)';
    btn.style.border = '1px solid var(--border)';
    const from = $('.card-input-field[readonly]');
    if (from) { from.value = '0x7a3b...8a6b'; from.style.color = 'var(--text)'; }
    refreshCta();
    toast('Wallet connected', 'success');
  }, 1200);
}
function disconnect() {
  connected = false;
  const btn = $('#connectBtn');
  btn.textContent = 'Connect Wallet';
  btn.style.background = btn.style.border = '';
  btn.style.color = '';
  const from = $('.card-input-field[readonly]');
  if (from) { from.value = 'Your wallet'; from.style.color = 'var(--text3)'; }
  refreshCta();
  toast('Wallet disconnected', 'info');
}
// ── 2. SEARCH MODAL (nav-search + "/" key) ──
let searchOpen = false;
$('.nav-search')?.addEventListener('click', openSearch);
document.addEventListener('keydown', e => {
  if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') { closeSearch(); closeNetMenu(); closeSettings(); closeContactPicker(); closeEmojiPicker(); }
});
const contacts = [
  { n:'vitalik.eth', a:'0x1d4e...5f8a', c:'#627eea,#3b5998', on:true },
  { n:'alice.sol', a:'0x8f2a...9c3b', c:'#00d68f,#00a86e', on:true },
  { n:'satoshi.btc', a:'0x3e7d...1a6f', c:'#f7931a,#e2820e', on:false },
  { n:'bob.base', a:'0x5c2f...7d1e', c:'#0052ff,#003dcf', on:true },
];
function openSearch() {
  if (searchOpen) return;
  searchOpen = true;
  const ov = document.createElement('div');
  ov.id = 'sbSearch';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding-top:120px;animation:fadeIn .15s ease';
  ov.innerHTML = `<div style="width:480px;max-width:92vw;background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.15);overflow:hidden;animation:fadeUp .2s ease">
    <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input autofocus placeholder="Search wallets, ENS, contacts..." style="flex:1;font-size:15px;background:none;color:var(--text);border:none;outline:none;font-family:var(--font)" id="sbSearchIn"/>
      <button onclick="document.getElementById('sbSearch')?.remove();searchOpen=false" style="padding:3px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border);font-size:11px;color:var(--text3);font-family:var(--mono);cursor:pointer">ESC</button>
    </div>
    <div id="sbSearchRes" style="max-height:300px;overflow-y:auto;padding:8px"><div style="padding:24px;text-align:center;color:var(--text3);font-size:14px">Type to search wallets or ENS names</div></div>
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) closeSearch(); });
  document.body.appendChild(ov);
  setTimeout(() => $('#sbSearchIn')?.focus(), 50);
  $('#sbSearchIn')?.addEventListener('input', e => searchFilter(e.target.value));
}
function closeSearch() { searchOpen = false; $('#sbSearch')?.remove(); }
function searchFilter(q) {
  const box = $('#sbSearchRes');
  if (!box) return;
  if (!q.trim()) { box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:14px">Type to search wallets or ENS names</div>'; return; }
  const ql = q.toLowerCase();
  const hits = contacts.filter(c => c.n.includes(ql) || c.a.includes(ql));
  if (hits.length) {
    box.innerHTML = hits.map(c => `<div class="sb-sr" data-n="${c.n}" data-a="${c.a}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--bg-input)'" onmouseout="this.style.background=''">
      <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,${c.c});display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:700">${c.n.slice(0,2).toUpperCase()}</div>
      <div style="flex:1"><div style="font-size:14px;font-weight:600">${c.n}</div><div style="font-size:12px;color:var(--text3);font-family:var(--mono)">${c.a}</div></div>
      ${c.on ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--accent)"></div>' : ''}
    </div>`).join('');
    box.querySelectorAll('.sb-sr').forEach(r => r.addEventListener('click', () => { selectContact(r.dataset.n, r.dataset.a); closeSearch(); }));
  } else if (q.startsWith('0x')) {
    box.innerHTML = `<div class="sb-sr" data-n="Unknown" data-a="${q.slice(0,10)}..." style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;cursor:pointer" onmouseover="this.style.background='var(--bg-input)'" onmouseout="this.style.background=''">
      <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-dark));display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff">?</div>
      <div style="flex:1"><div style="font-size:14px;font-weight:600">New Wallet</div><div style="font-size:12px;color:var(--text3);font-family:var(--mono)">${q.length>14?q.slice(0,6)+'...'+q.slice(-4):q}</div></div>
    </div>`;
    box.querySelector('.sb-sr')?.addEventListener('click', () => { selectContact('Unknown', q.slice(0,10)+'...'); closeSearch(); });
  } else {
    box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:14px">No results found</div>';
  }
}
// ── 3. NETWORK SELECTOR ──
let netOpen = false;
$('.nav-network')?.addEventListener('click', e => { e.stopPropagation(); toggleNetMenu(); });
const networks = [
  { n:'Ethereum', c:'#627eea' }, { n:'Base', c:'#0052ff' },
  { n:'Arbitrum', c:'#28a0f0' }, { n:'Polygon', c:'#8247e5' }, { n:'Optimism', c:'#ff0420' },
];
let currentNet = 'Ethereum';
function toggleNetMenu() {
  if (netOpen) return closeNetMenu();
  netOpen = true;
  const m = document.createElement('div');
  m.id = 'sbNetMenu';
  m.style.cssText = 'position:fixed;top:64px;right:120px;width:220px;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.12);z-index:150;padding:8px;animation:fadeUp .15s ease';
  m.innerHTML = networks.map(n => `<div class="sb-net" data-n="${n.n}" data-c="${n.c}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:background .15s;${n.n===currentNet?'background:var(--bg-input)':''}" onmouseover="this.style.background='var(--bg-input)'" onmouseout="this.style.background='${n.n===currentNet?'var(--bg-input)':''}'">
    <div style="width:10px;height:10px;border-radius:50%;background:${n.c};box-shadow:0 0 6px ${n.c}44"></div>
    <span style="font-size:14px;font-weight:${n.n===currentNet?'600':'500'};flex:1">${n.n}</span>
    ${n.n===currentNet?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>':''}
  </div>`).join('');
  document.body.appendChild(m);
  m.querySelectorAll('.sb-net').forEach(el => el.addEventListener('click', () => {
    currentNet = el.dataset.n;
    const nb = $('.nav-network');
    if (nb) nb.innerHTML = `<div class="nav-network-dot" style="width:8px;height:8px;border-radius:50%;background:${el.dataset.c};box-shadow:0 0 6px ${el.dataset.c}44"></div>${el.dataset.n}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
    closeNetMenu();
    toast(`Switched to ${el.dataset.n}`, 'success');
  }));
  setTimeout(() => document.addEventListener('click', netOutside), 10);
}
function closeNetMenu() { netOpen = false; $('#sbNetMenu')?.remove(); document.removeEventListener('click', netOutside); }
function netOutside(e) { if (!e.target.closest('#sbNetMenu') && !e.target.closest('.nav-network')) closeNetMenu(); }
// ── 4. SETTINGS PANEL ──
let settingsOpen = false;
$('.card-settings')?.addEventListener('click', e => { e.stopPropagation(); toggleSettings(); });
function toggleSettings() {
  if (settingsOpen) return closeSettings();
  settingsOpen = true;
  const card = $('#appCard');
  if (!card) return;
  card.style.position = 'relative';
  const p = document.createElement('div');
  p.id = 'sbSettings';
  p.style.cssText = 'position:absolute;top:52px;right:12px;width:280px;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.15);z-index:50;padding:16px;animation:fadeUp .15s ease';
  const toggles = [
    ['Auto-encrypt messages', true], ['Read receipts', true],
    ['Typing indicators', false], ['Sound notifications', true],
  ];
  p.innerHTML = `<div style="font-size:15px;font-weight:700;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">Settings <span id="sbSettingsX" style="cursor:pointer;color:var(--text3);font-size:18px;line-height:1">&times;</span></div>
    ${toggles.map(([label, on], i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
      <span style="font-size:13px">${label}</span>
      <div class="sb-toggle" data-on="${on}" style="width:40px;height:22px;border-radius:11px;background:${on?'var(--accent)':'var(--text4)'};cursor:pointer;position:relative;transition:background .2s" data-i="${i}">
        <div style="position:absolute;top:2px;left:${on?'20px':'2px'};width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15);transition:left .2s"></div>
      </div>
    </div>`).join('')}
    <div style="border-top:1px solid var(--border);margin:12px 0;padding-top:12px">
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px;font-weight:500">Max message size</div>
      <div style="display:flex;gap:6px" id="sbMaxSize">
        ${['10 MB','50 MB','100 MB'].map((s,i) => `<button style="flex:1;padding:8px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;border:1px solid ${i===0?'var(--accent)':'var(--border)'};background:${i===0?'var(--accent-glow)':'var(--bg-input)'};color:${i===0?'var(--accent)':'var(--text2)'}">${s}</button>`).join('')}
      </div>
    </div>`;
  card.appendChild(p);
  p.querySelectorAll('.sb-toggle').forEach(t => t.addEventListener('click', () => {
    const on = t.dataset.on === 'true';
    t.dataset.on = !on;
    t.style.background = !on ? 'var(--accent)' : 'var(--text4)';
    t.querySelector('div').style.left = !on ? '20px' : '2px';
  }));
  $('#sbMaxSize')?.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    $('#sbMaxSize').querySelectorAll('button').forEach(x => { x.style.border='1px solid var(--border)'; x.style.background='var(--bg-input)'; x.style.color='var(--text2)'; });
    b.style.border='1px solid var(--accent)'; b.style.background='var(--accent-glow)'; b.style.color='var(--accent)';
  }));
  $('#sbSettingsX')?.addEventListener('click', closeSettings);
  setTimeout(() => document.addEventListener('click', settingsOutside), 10);
}
function closeSettings() { settingsOpen = false; $('#sbSettings')?.remove(); document.removeEventListener('click', settingsOutside); }
function settingsOutside(e) { if (!e.target.closest('#sbSettings') && !e.target.closest('.card-settings')) closeSettings(); }
// ── 5. CONTACT PICKER (To selector) ──
let cpOpen = false;
$$('.card-selector')[1]?.addEventListener('click', e => { e.stopPropagation(); toggleContactPicker(); });
function toggleContactPicker() {
  if (cpOpen) return closeContactPicker();
  cpOpen = true;
  const parent = $$('.card-input')[1];
  if (!parent) return;
  parent.style.position = 'relative';
  const p = document.createElement('div');
  p.id = 'sbCP';
  p.style.cssText = 'position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.12);z-index:50;padding:8px;animation:fadeUp .15s ease;max-height:220px;overflow-y:auto';
  p.innerHTML = contacts.map(c => `<div class="sb-cp-row" data-n="${c.n}" data-a="${c.a}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--bg-input)'" onmouseout="this.style.background=''">
    <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,${c.c});display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700">${c.n.slice(0,2).toUpperCase()}</div>
    <div style="flex:1"><div style="font-size:13px;font-weight:600">${c.n}</div></div>
    ${c.on?'<div style="width:6px;height:6px;border-radius:50%;background:var(--accent)"></div>':''}
  </div>`).join('');
  parent.appendChild(p);
  p.querySelectorAll('.sb-cp-row').forEach(r => r.addEventListener('click', () => { selectContact(r.dataset.n, r.dataset.a); closeContactPicker(); }));
  setTimeout(() => document.addEventListener('click', cpOutside), 10);
}
function closeContactPicker() { cpOpen = false; $('#sbCP')?.remove(); document.removeEventListener('click', cpOutside); }
function cpOutside(e) { if (!e.target.closest('#sbCP') && !e.target.closest('.card-selector')) closeContactPicker(); }
// ── 6. CARD TABS (Send / Group / QR Code) ──
$$('.card-tab').forEach(t => {
  t.removeAttribute('onclick'); // remove old inline handler
  t.addEventListener('click', () => {
    $$('.card-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.textContent.trim();
    if (tab === 'Send') showSend();
    else if (tab === 'Group') showGroup();
    else if (tab === 'QR Code') showQR();
  });
});
function showSend() {
  $$('.card-input,.card-divider,.card-message').forEach(el => el.style.display = '');
  $('#sbCustom')?.remove();
  refreshCta();
}
function showGroup() {
  hideFields();
  injectCustom(`
    <div style="padding:16px">
      <input id="sbGrpName" placeholder="Group name..." style="width:100%;font-size:15px;padding:12px 16px;background:var(--bg-input);border:1px solid var(--border);border-radius:12px;margin-bottom:12px;font-family:var(--font);color:var(--text);outline:none"/>
      <div style="font-size:13px;color:var(--text3);margin-bottom:8px;font-weight:500">Select members</div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto">
        ${contacts.map(c => `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          <input type="checkbox" class="sb-gc" style="accent-color:var(--accent);width:16px;height:16px"/>
          <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,${c.c});display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700">${c.n.slice(0,2).toUpperCase()}</div>
          <div style="flex:1"><div style="font-size:13px;font-weight:600">${c.n}</div><div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${c.a}</div></div>
        </label>`).join('')}
      </div>
    </div>`);
  const cta = $('#cardCta');
  cta.className = 'card-cta card-cta-send';
  cta.textContent = 'Create Encrypted Group';
  cta.onclick = async () => {
    const name = $('#sbGrpName')?.value;
    const cnt = $$('.sb-gc:checked').length;
    if (!name?.trim()) { toast('Enter a group name', 'error'); return; }
    if (cnt < 2) { toast('Select at least 2 members', 'error'); return; }
    cta.innerHTML = spinner() + ' Creating...'; cta.style.opacity = '.7';
    await sleep(1500);
    cta.innerHTML = check() + ` "${name}" created!`; cta.style.opacity = '1';
    toast(`Group "${name}" created with ${cnt} members`, 'success');
    await sleep(2000);
    $$('.card-tab')[0]?.click(); // back to Send
  };
}
function showQR() {
  hideFields();
  const addr = connected ? '0x7a3b9c4e1f2d8a6b' : '0x0000000000000000';
  const pattern = [1,1,1,0,1,0,1,0,1,1,1,1,0,1,0,0,1,0,1,1,0,1,1,1,1,0,1,1,1,0,1,1,1,0,0,0,0,1,0,1,0,0,0,0,1,0,1,1,0,1,0,1,1,0,1,0,1,0,0,1,2,1,0,0,1,0,1,0,1,1,0,1,0,1,1,0,1,0,0,0,0,1,0,1,0,0,0,0,1,1,1,0,1,1,0,0,1,1,1,1,0,1,0,0,1,1,1,1,0,1,1,1,1,0,1,0,1,0,1,1,1];
  injectCustom(`
    <div style="padding:24px;text-align:center">
      <div style="display:inline-block;width:180px;height:180px;background:var(--bg-input);border:1px solid var(--border);border-radius:16px;display:grid;grid-template-columns:repeat(11,1fr);gap:1px;padding:12px;overflow:hidden;margin-bottom:16px">
        ${pattern.map(v => `<div style="border-radius:1.5px;background:${v===2?'var(--accent)':v===1?'var(--text)':'transparent'}"></div>`).join('')}
      </div>
      <div style="font-family:var(--mono);font-size:13px;color:var(--text2);word-break:break-all;max-width:240px;margin:0 auto 16px">${addr}</div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button id="sbCopyAddr" style="padding:8px 16px;border-radius:100px;background:var(--accent-glow);color:var(--accent);font-size:13px;font-weight:600;border:none;cursor:pointer;transition:all .15s">Copy Address</button>
        <button id="sbShareQR" style="padding:8px 16px;border-radius:100px;background:var(--bg-input);color:var(--text2);font-size:13px;font-weight:600;border:1px solid var(--border);cursor:pointer;transition:all .15s">Share QR</button>
      </div>
    </div>`);
  $('#sbCopyAddr')?.addEventListener('click', () => { navigator.clipboard?.writeText(addr); toast('Address copied!', 'success'); });
  $('#sbShareQR')?.addEventListener('click', () => {
    if (navigator.share) navigator.share({ title:'SendBloc', text:`Message me on SendBloc: ${addr}` });
    else { navigator.clipboard?.writeText(addr); toast('Link copied to clipboard', 'success'); }
  });
  const cta = $('#cardCta');
  cta.className = 'card-cta card-cta-connect';
  cta.textContent = 'Scan QR Code';
  cta.onclick = async () => { cta.innerHTML = spinner()+' Opening scanner...'; await sleep(1500); toast('Camera permission required for scanning', 'info'); cta.textContent = 'Scan QR Code'; };
}
function hideFields() { $$('.card-input,.card-divider,.card-message').forEach(el => el.style.display = 'none'); }
function injectCustom(html) {
  $('#sbCustom')?.remove();
  const d = document.createElement('div'); d.id = 'sbCustom'; d.innerHTML = html;
  const cta = $('#cardCta');
  cta.parentElement.insertBefore(d, cta);
}
// ── 7. MESSAGE ACTIONS (attach · voice · emoji) ──
const msgBtns = $$('.card-msg-action');
// Attach file
msgBtns[0]?.addEventListener('click', () => {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.onchange = () => {
    const f = inp.files[0];
    if (f) toast(`"${f.name}" attached (${(f.size/1024).toFixed(1)}KB) — will be encrypted`, 'success');
  };
  inp.click();
});
// Voice message
let recording = false, recTimer;
msgBtns[1]?.addEventListener('click', () => {
  const btn = msgBtns[1];
  if (!recording) {
    recording = true;
    btn.style.color = 'var(--pink)';
    btn.style.background = 'var(--pink-glow2)';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--pink)" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    let sec = 0;
    recTimer = setInterval(() => { sec++; btn.title = sec + 's'; }, 1000);
    toast('Recording voice message...', 'info');
  } else {
    recording = false;
    clearInterval(recTimer);
    btn.style.color = ''; btn.style.background = ''; btn.title = '';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>';
    toast('Voice message recorded — encrypted on send', 'success');
  }
});
// Emoji picker
msgBtns[2]?.addEventListener('click', e => { e.stopPropagation(); toggleEmojiPicker(); });
function toggleEmojiPicker() {
  if ($('#sbEmoji')) { closeEmojiPicker(); return; }
  const emojis = ['👍','❤️','🔥','😂','🚀','💯','🎉','😍','🤝','⚡','🧠','💎','🦄','✅','👀','🙏'];
  const p = document.createElement('div');
  p.id = 'sbEmoji';
  p.style.cssText = 'position:absolute;bottom:48px;left:0;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.12);padding:8px;display:grid;grid-template-columns:repeat(8,1fr);gap:2px;z-index:20;animation:fadeUp .12s ease';
  emojis.forEach(em => {
    const b = document.createElement('button');
    b.textContent = em;
    b.style.cssText = 'font-size:20px;padding:6px;border:none;background:none;border-radius:8px;cursor:pointer;transition:background .12s';
    b.onmouseover = () => b.style.background = 'var(--bg-input)';
    b.onmouseout = () => b.style.background = '';
    b.onclick = () => { const f = $('#msgField'); if (f) f.value += em; closeEmojiPicker(); };
    p.appendChild(b);
  });
  const area = $('.card-message');
  if (area) { area.style.position = 'relative'; area.appendChild(p); }
  setTimeout(() => document.addEventListener('click', emojiOutside), 10);
}
function closeEmojiPicker() { $('#sbEmoji')?.remove(); document.removeEventListener('click', emojiOutside); }
function emojiOutside(e) { if (!e.target.closest('#sbEmoji') && !e.target.closest('.card-msg-action')) closeEmojiPicker(); }
// ── 8. NAV TABS (Message / Explore / Contacts / Groups) ──
$$('.nav-tab').forEach(t => {
  t.addEventListener('click', () => {
    $$('.nav-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.textContent.trim();
    if (tab === 'Message') { showSend(); $$('.card-tab')[0]?.click(); }
    else if (tab === 'Explore') showExplore();
    else if (tab === 'Contacts') showContacts();
    else if (tab === 'Groups') showGroups();
  });
});
function showExplore() {
  hideFields();
  injectCustom(`<div style="padding:40px 20px;text-align:center">
    <div style="font-size:40px;margin-bottom:12px">🔍</div>
    <div style="font-size:17px;font-weight:700;margin-bottom:6px">Explore</div>
    <div style="font-size:14px;color:var(--text2);line-height:1.5">Discover trending wallets, active groups, and popular channels on SendBloc.</div>
  </div>`);
  const cta = $('#cardCta'); cta.className = 'card-cta card-cta-connect'; cta.textContent = 'Coming Soon'; cta.onclick = () => {};
}
function showContacts() {
  hideFields();
  injectCustom(`<div style="padding:12px">
    <input id="sbFilterC" placeholder="Search contacts..." style="width:100%;padding:10px 14px;border-radius:10px;background:var(--bg-input);border:1px solid var(--border);font-size:14px;color:var(--text);margin-bottom:10px;font-family:var(--font);outline:none"/>
    <div id="sbCList" style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto">
      ${contacts.map(cRow).join('')}
    </div>
  </div>`);
  $('#sbFilterC')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const f = contacts.filter(c => c.n.includes(q) || c.a.includes(q));
    const el = $('#sbCList');
    el.innerHTML = f.length ? f.map(cRow).join('') : '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">No contacts found</div>';
    el.querySelectorAll('.sb-crow').forEach(r => r.addEventListener('click', () => {
      selectContact(r.dataset.n, r.dataset.a);
      $$('.nav-tab')[0]?.click();
    }));
  });
  $('#sbCList')?.querySelectorAll('.sb-crow').forEach(r => r.addEventListener('click', () => {
    selectContact(r.dataset.n, r.dataset.a);
    $$('.nav-tab')[0]?.click();
  }));
  const cta = $('#cardCta'); cta.className = 'card-cta card-cta-connect'; cta.textContent = '+ Add New Contact'; cta.onclick = () => { toast('Paste a wallet address or scan a QR code', 'info'); };
}
function cRow(c) {
  return `<div class="sb-crow" data-n="${c.n}" data-a="${c.a}" style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--bg-input)'" onmouseout="this.style.background=''">
    <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,${c.c});display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:700">${c.n.slice(0,2).toUpperCase()}</div>
    <div style="flex:1"><div style="font-size:14px;font-weight:600">${c.n}</div><div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${c.a}</div></div>
    <div style="width:8px;height:8px;border-radius:50%;background:${c.on?'var(--accent)':'var(--text4)'}"></div>
  </div>`;
}
function showGroups() {
  hideFields();
  const groups = [
    { n:'DeFi Devs', m:12, c:'#fc72ff,#ff2df1' },
    { n:'DAO Governance', m:8, c:'#627eea,#3b5998' },
    { n:'Privacy Research', m:5, c:'#00d68f,#00a86e' },
  ];
  injectCustom(`<div style="padding:12px;display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto">
    ${groups.map(g => `<div style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:12px;background:var(--bg-input);border:1px solid var(--border);cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,${g.c});display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:700">${g.n.slice(0,2).toUpperCase()}</div>
      <div style="flex:1"><div style="font-size:14px;font-weight:600">${g.n}</div><div style="font-size:12px;color:var(--text3)">${g.m} members · Encrypted</div></div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`).join('')}
  </div>`);
  const cta = $('#cardCta'); cta.className = 'card-cta card-cta-send'; cta.textContent = '+ Create New Group';
  cta.onclick = () => { $$('.nav-tab')[0]?.click(); setTimeout(() => $$('.card-tab')[1]?.click(), 50); };
}
// ── 9. "VIEW ALL" TRENDING LINK ──
$('.trending-link')?.addEventListener('click', e => { e.preventDefault(); $$('.nav-tab')[2]?.click(); });
// ── 10. TRENDING CARD CLICKS (fix group card) ──
$$('.trending-card').forEach(card => {
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    const name = card.querySelector('.trending-name')?.textContent;
    const addr = card.querySelector('.trending-addr')?.textContent;
    if (addr?.includes('members')) {
      $$('.nav-tab')[3]?.click(); // go to Groups
    } else if (name && addr) {
      $$('.nav-tab')[0]?.click();
      setTimeout(() => selectContact(name, addr), 50);
    }
  });
});
// ── 11. MOBILE HAMBURGER ──
$('.nav-mobile')?.addEventListener('click', () => {
  let drawer = $('#sbMobileNav');
  if (drawer) { drawer.remove(); return; }
  drawer = document.createElement('div');
  drawer.id = 'sbMobileNav';
  drawer.style.cssText = 'position:fixed;top:72px;left:0;right:0;background:var(--surface);border-bottom:1px solid var(--border);box-shadow:0 8px 30px rgba(0,0,0,.08);z-index:99;padding:8px 16px;animation:fadeUp .15s ease;display:flex;flex-direction:column;gap:2px';
  ['Message','Explore','Contacts','Groups'].forEach(t => {
    const a = document.createElement('div');
    a.textContent = t;
    a.style.cssText = 'padding:12px 16px;border-radius:10px;font-size:15px;font-weight:500;cursor:pointer;transition:background .15s';
    a.onmouseover = () => a.style.background = 'var(--bg-input)';
    a.onmouseout = () => a.style.background = '';
    a.onclick = () => { $$('.nav-tab').forEach((nt,i) => { if (nt.textContent.trim()===t) nt.click(); }); drawer.remove(); };
    drawer.appendChild(a);
  });
  document.body.appendChild(drawer);
});
// ── 12. REFRESH CTA HELPER ──
function refreshCta() {
  const cta = $('#cardCta');
  if (!cta) return;
  cta.onclick = handleCta;
  if (!connected) {
    cta.className = 'card-cta card-cta-connect';
    cta.textContent = 'Connect Wallet';
  } else if (!$('#toField')?.value.trim()) {
    cta.className = 'card-cta card-cta-connect';
    cta.textContent = 'Select a recipient';
  } else {
    cta.className = 'card-cta card-cta-send';
    cta.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg> Send Encrypted Message';
  }
}
// Update CTA when To field changes
$('#toField')?.addEventListener('input', refreshCta);
// ── SVG HELPERS ──
function spinner() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="animation:spin .8s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>'; }
function check() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>'; }
})();
