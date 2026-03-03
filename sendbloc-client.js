// ═══════════════════════════════════════════
// SENDBLOC — Frontend API Client
// Connects the UI to the backend API + Socket.IO
// Load AFTER socket.io.js, BEFORE sendbloc-reactive.js
// ═══════════════════════════════════════════

window.SB = (() => {
  const API = '/api/v1';

  // ── State ──
  let accessToken = localStorage.getItem('sb_access_token');
  let refreshToken = localStorage.getItem('sb_refresh_token');
  let currentUser = JSON.parse(localStorage.getItem('sb_user') || 'null');
  let socket = null;
  const listeners = {};

  // ── HTTP Client ──
  async function request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API}${path}`, opts);
    const data = await res.json().catch(() => null);

    // Auto-refresh on 401
    if (res.status === 401 && refreshToken && !path.includes('/auth/')) {
      const refreshed = await tryRefresh();
      if (refreshed) return request(method, path, body);
    }

    return { status: res.status, data, ok: res.status >= 200 && res.status < 300 };
  }

  async function tryRefresh() {
    try {
      const res = await fetch(`${API}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        setTokens(data.accessToken, data.refreshToken);
        return true;
      }
    } catch {}
    clearSession();
    return false;
  }

  function setTokens(access, refresh) {
    accessToken = access;
    refreshToken = refresh;
    localStorage.setItem('sb_access_token', access);
    localStorage.setItem('sb_refresh_token', refresh);
  }

  function setUser(user) {
    currentUser = user;
    localStorage.setItem('sb_user', JSON.stringify(user));
  }

  function clearSession() {
    accessToken = null;
    refreshToken = null;
    currentUser = null;
    localStorage.removeItem('sb_access_token');
    localStorage.removeItem('sb_refresh_token');
    localStorage.removeItem('sb_user');
    if (socket) { socket.disconnect(); socket = null; }
  }

  // ── Auth ──
  async function devLogin(wallet) {
    const res = await request('POST', '/auth/dev-login', { wallet });
    if (res.ok) {
      setTokens(res.data.accessToken, res.data.refreshToken);
      setUser(res.data.user);
      connectSocket();
    }
    return res;
  }

  async function logout() {
    await request('POST', '/auth/logout').catch(() => {});
    clearSession();
    emit('logout');
  }

  // ── Socket.IO ──
  function connectSocket() {
    if (!accessToken) return;
    if (socket?.connected) return;
    if (typeof io === 'undefined') { console.warn('[SB] Socket.IO client not loaded'); return; }

    socket = io({ auth: { token: accessToken } });

    socket.on('connect', () => {
      console.log('[SB] WebSocket connected');
      emit('ws:connected');
    });

    socket.on('disconnect', reason => {
      console.log('[SB] WebSocket disconnected:', reason);
      emit('ws:disconnected', reason);
    });

    socket.on('connect_error', err => {
      console.warn('[SB] WebSocket error:', err.message);
    });

    // Forward real-time events
    [
      'message:new', 'message:read', 'message:reaction', 'message:deleted',
      'typing:start', 'typing:stop',
      'presence:online', 'presence:offline', 'presence:status',
      'group:created', 'group:member_added', 'group:member_online',
    ].forEach(evt => {
      socket.on(evt, data => emit(evt, data));
    });
  }

  // ── API Methods ──

  // Users
  const getMe = () => request('GET', '/users/me');
  const updateMe = (data) => request('PATCH', '/users/me', data);
  const searchUsers = (q) => request('GET', `/users/search?q=${encodeURIComponent(q)}`);

  // Contacts
  const getContacts = () => request('GET', '/contacts');
  const addContact = (contactId, alias) => request('POST', '/contacts', { contactId, alias });
  const removeContact = (contactId) => request('DELETE', `/contacts/${contactId}`);

  // Messages
  const sendMessage = (recipientId, content, opts = {}) =>
    request('POST', '/messages/send', { recipientId, type: opts.type || 'text', content, ...opts });
  const sendGroupMessage = (groupId, content, opts = {}) =>
    request('POST', '/messages/send', { groupId, type: opts.type || 'text', content, ...opts });
  const getConversations = () => request('GET', '/messages/conversations');
  const getMessages = (convId, opts = {}) =>
    request('GET', `/messages/${convId}${opts.before ? `?before=${opts.before}` : ''}`);

  // Groups
  const getGroups = () => request('GET', '/groups');
  const createGroup = (name, members, description) =>
    request('POST', '/groups', { name, members, description });
  const getGroup = (id) => request('GET', `/groups/${id}`);

  // Networks
  const getNetworks = () => request('GET', '/networks');
  const getNetworkStatus = () => request('GET', '/networks/status');

  // Settings
  const getSettings = () => request('GET', '/settings');
  const updateSettings = (settings) => request('PUT', '/settings', settings);

  // Health
  const getHealth = async () => {
    const res = await fetch('/api/health');
    return res.json();
  };

  // ── Event System ──
  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== fn);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error('[SB] Event handler error:', e); }
    });
  }

  // ── Socket Helpers ──
  function typingStart(data) { socket?.emit('typing:start', data); }
  function typingStop(data) { socket?.emit('typing:stop', data); }

  // ── Auto-restore Session ──
  if (accessToken) {
    getMe().then(res => {
      if (res.ok) {
        setUser(res.data);
        connectSocket();
        emit('session:restored', res.data);
      } else {
        clearSession();
        emit('session:expired');
      }
    });
  }

  return {
    devLogin, logout,
    getMe, updateMe, searchUsers,
    getContacts, addContact, removeContact,
    sendMessage, sendGroupMessage, getConversations, getMessages,
    getGroups, createGroup, getGroup,
    getNetworks, getNetworkStatus,
    getSettings, updateSettings,
    getHealth,
    on, off,
    typingStart, typingStop,
    get token() { return accessToken; },
    get user() { return currentUser; },
    get isLoggedIn() { return !!accessToken; },
    get socket() { return socket; },
  };
})();
