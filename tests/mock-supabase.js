// Minimaler Supabase-Ersatz für den lokalen Test (In-Memory).
(function(){
  const rows = new Map(); // key collection/id -> {collection,id,data}
  window.__rows = rows;
  window.__team = [{email:'adam@test.de', role:'owner'}, {email:'a@b.de', role:'member'}];
  window.__pw = 'richtig';
  function q(table){
    if (table === 'team') {
      // RLS nachgebaut: nur Team-Mitglieder sehen die Team-Liste
      const api = { select(){ return api; }, then(res, rej){
        const me = session && String(session.user.email).toLowerCase();
        const vis = window.__team.some(m => m.email === me) ? JSON.parse(JSON.stringify(window.__team)) : [];
        return Promise.resolve({data: vis, error: null}).then(res, rej);
      } };
      return api;
    }
    const f = {}; let mode = 'select', payload = null;
    const api = {
      select(){ mode = mode === 'delete' ? 'delete' : 'select'; return api; },
      eq(k, v){ f[k] = v; return api; },
      maybeSingle(){ return run(true); },
      upsert(r){ mode = 'upsert'; payload = r; return run(false); },
      delete(){ mode = 'delete'; return api; },
      then(res, rej){ return run(false).then(res, rej); }
    };
    function match(r){ return Object.keys(f).every(k => r[k] === f[k]); }
    async function run(single){
      await new Promise(r => setTimeout(r, 5));
      if (mode === 'upsert'){ rows.set(payload.collection + '/' + payload.id, JSON.parse(JSON.stringify(payload))); return {error:null}; }
      if (mode === 'delete'){ for (const [k, r] of rows) if (match(r)) rows.delete(k); return {error:null}; }
      const list = [...rows.values()].filter(match).map(r => JSON.parse(JSON.stringify(r)));
      if (single) return {data: list[0] || null, error: null};
      return {data: list, error: null};
    }
    return api;
  }
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem('mock_session')) || null; } catch (e) {}
  const keep = () => { try { session ? sessionStorage.setItem('mock_session', JSON.stringify(session)) : sessionStorage.removeItem('mock_session'); } catch (e) {} };
  // Link aus E-Mail nachgebaut: #access_token=…&type=invite&mock_email=…
  const hp = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hp.get('access_token')) { session = {user:{email: hp.get('mock_email')}, access_token: 'tok'}; keep(); }
  window.supabase = { createClient(){ return {
    from: q,
    channel(){ return { on(){ return this; }, subscribe(){ return this; } }; },
    auth: {
      async getSession(){ return {data:{session}}; },
      async updateUser({password}){ window.__pwChanges = (window.__pwChanges || 0) + 1; window.__pw = password; return {data:{}, error:null}; },
      async signInWithPassword({email, password}){ if (password !== window.__pw) return {data:{}, error:{message:'invalid'}}; session = {user:{email}, access_token:'tok'}; keep(); return {data:{session}, error:null}; },
      async signOut(){ session = null; keep(); },
      onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; }
    }
  }; } };
})();
