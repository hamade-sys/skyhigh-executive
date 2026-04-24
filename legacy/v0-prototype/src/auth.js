// ============================================================
// SkyHigh Executive — Auth & Cloud Save Module
// Firebase Authentication + Firestore
// Falls back gracefully to localStorage when Firebase is off.
// ============================================================
window.SkyHigh = window.SkyHigh || {};

window.SkyHigh.Auth = (() => {
  'use strict';

  let _app = null, _auth = null, _db = null;
  let _currentUser = null;  // { uid, username, email }

  // ── ROLE METADATA ────────────────────────────────────────
  const ROLES = {
    CEO:  { label: 'Chief Executive Officer',  icon: '👔', color: '#C8933A', desc: 'Sets strategy, makes final decisions on crises and board events.' },
    CMO:  { label: 'Chief Marketing Officer',  icon: '📣', color: '#3498DB', desc: 'Manages campaigns, brand prestige, and customer loyalty.' },
    CFO:  { label: 'Chief Financial Officer',  icon: '💰', color: '#27AE60', desc: 'Controls loans, fuel hedging, and quarterly financial planning.' },
    CHRO: { label: 'Chief HR Officer',          icon: '👥', color: '#9B59B6', desc: 'Handles crew training, hiring, and employee relations crises.' },
  };

  // ── FIREBASE INIT ─────────────────────────────────────────
  function _init() {
    if (!window.SkyHigh.FIREBASE_ENABLED) return false;
    if (_app) return true;
    try {
      if (!firebase.apps.length) {
        _app  = firebase.initializeApp(window.SkyHigh.FIREBASE_CONFIG);
      } else {
        _app = firebase.apps[0];
      }
      _auth = firebase.auth();
      _db   = firebase.firestore();
      return true;
    } catch(e) {
      console.warn('[Auth] Firebase init failed:', e);
      return false;
    }
  }

  // ── PUBLIC API ────────────────────────────────────────────
  const API = {

    isEnabled() { return !!window.SkyHigh.FIREBASE_ENABLED; },
    isLoggedIn() { return !!_currentUser; },
    getUser()    { return _currentUser; },
    getRoles()   { return ROLES; },

    // ── REGISTER ───────────────────────────────────────────
    async register(email, password, username) {
      if (!_init()) return { ok: false, reason: 'Firebase not configured' };
      if (!email || !password || !username) return { ok: false, reason: 'All fields required' };
      if (username.length < 3) return { ok: false, reason: 'Username must be 3+ characters' };
      if (password.length < 6) return { ok: false, reason: 'Password must be 6+ characters' };

      try {
        // Check username is unique
        const usernameSnap = await _db.collection('usernames').doc(username.toLowerCase()).get();
        if (usernameSnap.exists) return { ok: false, reason: 'Username already taken' };

        const cred = await _auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: username });

        // Store username mapping + user profile
        await _db.collection('usernames').doc(username.toLowerCase()).set({ uid: cred.user.uid });
        await _db.collection('users').doc(cred.user.uid).set({
          uid:       cred.user.uid,
          username,
          email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        _currentUser = { uid: cred.user.uid, username, email };
        return { ok: true, user: _currentUser };
      } catch(e) {
        return { ok: false, reason: _friendlyError(e) };
      }
    },

    // ── LOGIN ──────────────────────────────────────────────
    async login(emailOrUsername, password) {
      if (!_init()) return { ok: false, reason: 'Firebase not configured' };

      let email = emailOrUsername;
      // If no @, treat as username → look up email
      if (!emailOrUsername.includes('@')) {
        try {
          const snap = await _db.collection('usernames').doc(emailOrUsername.toLowerCase()).get();
          if (!snap.exists) return { ok: false, reason: 'Username not found' };
          const userData = await _db.collection('users').doc(snap.data().uid).get();
          email = userData.data()?.email;
          if (!email) return { ok: false, reason: 'Account error — try logging in with email' };
        } catch(e) {
          return { ok: false, reason: 'Username lookup failed' };
        }
      }

      try {
        const cred = await _auth.signInWithEmailAndPassword(email, password);
        const userDoc = await _db.collection('users').doc(cred.user.uid).get();
        const data = userDoc.data() || {};
        _currentUser = {
          uid:      cred.user.uid,
          username: cred.user.displayName || data.username || email,
          email:    cred.user.email,
        };
        return { ok: true, user: _currentUser };
      } catch(e) {
        return { ok: false, reason: _friendlyError(e) };
      }
    },

    // ── LOGOUT ─────────────────────────────────────────────
    async logout() {
      if (_auth) await _auth.signOut();
      _currentUser = null;
    },

    // ── RESTORE SESSION ────────────────────────────────────
    async restoreSession() {
      if (!_init()) return null;
      return new Promise(resolve => {
        _auth.onAuthStateChanged(async user => {
          if (user) {
            const doc = await _db.collection('users').doc(user.uid).get();
            const data = doc.data() || {};
            _currentUser = {
              uid:      user.uid,
              username: user.displayName || data.username || user.email,
              email:    user.email,
            };
            resolve(_currentUser);
          } else {
            resolve(null);
          }
        });
      });
    },


    // ── CLOUD SAVE ─────────────────────────────────────────
    async cloudSave(gameState) {
      if (!_currentUser) return { ok: false, reason: 'Not logged in' };
      if (!_db) return { ok: false, reason: 'Firebase not available' };

      try {
        const saveData = {
          savedAt:   firebase.firestore.FieldValue.serverTimestamp(),
          savedBy:   _currentUser.username,
          round:     gameState.round,
          cash:      gameState.cash,
          routes:    gameState.routes?.length || 0,
          gameState: JSON.stringify(gameState), // stored as string to avoid Firestore nested limit
        };

        // Save to user's personal save
        await _db.collection('users').doc(_currentUser.uid)
          .collection('saves').doc('latest').set(saveData);

        return { ok: true };
      } catch(e) {
        return { ok: false, reason: e.message };
      }
    },

    // ── CLOUD LOAD ─────────────────────────────────────────
    async cloudLoad() {
      if (!_currentUser || !_db) return null;
      try {
        const saveDoc = await _db.collection('users').doc(_currentUser.uid)
          .collection('saves').doc('latest').get();
        if (saveDoc.exists && saveDoc.data()?.gameState) {
          return JSON.parse(saveDoc.data().gameState);
        }
      } catch(e) {
        console.warn('[Auth] cloudLoad error:', e);
      }
      return null;
    },

    // ── SEARCH USERS ──────────────────────────────────────
    async searchUsername(query) {
      if (!_db || !query) return [];
      const q = query.toLowerCase();
      const snap = await _db.collection('users')
        .where('username', '>=', q)
        .where('username', '<=', q + '\uf8ff')
        .limit(8).get();
      return snap.docs.map(d => ({ uid: d.id, username: d.data().username }));
    },

    // ── ADMIN API ────────────────────────────────────────────
    async checkIsAdmin() {
      if (!_currentUser || !_db) return false;
      try {
        const doc = await _db.collection('users').doc(_currentUser.uid).get();
        return doc.data()?.isAdmin === true;
      } catch(e) { return false; }
    },

    async adminGetStats() {
      if (!_db) return {};
      try {
        const usersSnap = await _db.collection('users').get();
        const users = usersSnap.docs.map(d => d.data());
        return {
          totalUsers:   usersSnap.size,
          activeGames:  users.filter(u => !u.banned).length,
          bannedUsers:  users.filter(u => u.banned).length,
        };
      } catch(e) { return {}; }
    },

    async adminListUsers(query = '', lim = 200) {
      if (!_db) return [];
      try {
        let ref = _db.collection('users').limit(lim);
        const snap = await ref.get();
        let docs = snap.docs.map(d => d.data());
        if (query) {
          const q = query.toLowerCase();
          docs = docs.filter(u =>
            u.username?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q) ||
            u.uid?.includes(q)
          );
        }
        return docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      } catch(e) { console.warn(e); return []; }
    },


    async adminUpdateUser(uid, data) {
      if (!_db) return { ok: false };
      try {
        await _db.collection('users').doc(uid).update(data);
        return { ok: true };
      } catch(e) { return { ok: false, reason: e.message }; }
    },

    async adminDeleteUser(uid) {
      if (!_db) return { ok: false };
      try {
        await _db.collection('users').doc(uid).delete();
        return { ok: true };
      } catch(e) { return { ok: false, reason: e.message }; }
    },

  };

  // ── HELPERS ───────────────────────────────────────────────
  function _friendlyError(e) {
    const map = {
      'auth/email-already-in-use': 'Email already registered',
      'auth/invalid-email':        'Invalid email address',
      'auth/wrong-password':       'Incorrect password',
      'auth/user-not-found':       'Account not found',
      'auth/weak-password':        'Password too weak (min 6 chars)',
      'auth/too-many-requests':    'Too many attempts — try later',
    };
    return map[e.code] || e.message || 'Unknown error';
  }

  return API;
})();
