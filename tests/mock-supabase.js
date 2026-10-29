// Minimaler Supabase-Ersatz für den lokalen Test (In-Memory).
(function(){
  const rows = new Map(); // key collection/id -> {collection,id,data}
  window.__rows = rows;
  window.__team = window.__teamInit || [{email:'adam@test.de', role:'owner'}, {email:'a@b.de', role:'member'}];
  for (const r of (window.__seedRows || [])) rows.set(r.collection + '/' + r.id, r);
  window.__pw = 'richtig';
  function q(table){
    if (table === 'team') {
      // RLS nachgebaut: ONLION sieht alle, Partner nur sich, Fremde nichts
      const tf = {}; let patch = null;
      const api = { select(){ return api; }, eq(k, v){ tf[k] = v; return api; }, update(p){ patch = p; return api; }, then(res, rej){
        if (window.__teamBroken) return Promise.resolve({data: null, error: {message: 'relation "public.team" does not exist'}}).then(res, rej);
        const me = session && String(session.user.email).toLowerCase();
        const mine = window.__team.find(m => m.email === me);
        const admin = mine && mine.role !== 'partner';
        if (patch) { if (!admin) return Promise.resolve({data: null, error: {message: 'denied'}}).then(res, rej); for (const m of window.__team) if (Object.keys(tf).every(k => m[k] === tf[k])) Object.assign(m, JSON.parse(JSON.stringify(patch))); return Promise.resolve({data: null, error: null}).then(res, rej); }
        const vis = !mine ? [] : admin ? window.__team : window.__team.filter(m => m.email === me);
        return Promise.resolve({data: JSON.parse(JSON.stringify(vis)), error: null}).then(res, rej);
      } };
      return api;
    }
    const f = {}; let mode = 'select', payload = null;
    const api = {
      select(){ mode = (mode === 'delete' || mode === 'update') ? mode : 'select'; return api; },
      eq(k, v){ f[k] = v; return api; },
      is(k, v){ f[k] = v; return api; },
      update(r){ mode = 'update'; payload = r; return api; },
      maybeSingle(){ return run(true); },
      upsert(r){ mode = 'upsert'; payload = r; return run(false); },
      delete(){ mode = 'delete'; return api; },
      then(res, rej){ return run(false).then(res, rej); }
    };
    function match(r){ return Object.keys(f).every(k => r[k] === f[k]); }
    async function run(single){
      await new Promise(r => setTimeout(r, 5));
      if (mode === 'update'){ if (window.__raceOnce){ const fn = window.__raceOnce; window.__raceOnce = null; fn(); } const hit = [...rows.values()].filter(r => Object.keys(f).every(k => (r[k] ?? null) === (f[k] ?? null))); for (const r of hit) Object.assign(r, JSON.parse(JSON.stringify(payload))); return {data: hit.map(r => ({id: r.id})), error: null}; }
      if (mode === 'upsert'){ for (const p of [].concat(payload)) rows.set(p.collection + '/' + p.id, JSON.parse(JSON.stringify(p))); return {error:null}; }
      if (mode === 'delete'){ for (const [k, r] of rows) if (match(r)) rows.delete(k); return {error:null}; }
      const me = session && String(session.user.email).toLowerCase();
      const mine = (window.__team || []).find(m => m.email === me);
      const partnerView = r => !mine || mine.role !== 'partner' ? true :
        ['templates','legal','config'].includes(r.collection) ? true :
        ['customers','provisionen','gutschriften'].includes(r.collection) ? (r.data && r.data.partner === me) :
        r.collection === 'vorschlaege' ? (r.data && r.data.von === me) : false;
      const list = [...rows.values()].filter(match).filter(partnerView).map(r => JSON.parse(JSON.stringify(r)));
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
    storage: { from(bucket){ return {
      async upload(path, blob, opts){ (window.__files = window.__files || {})[bucket + '/' + path] = {size: blob.size, type: (opts||{}).contentType}; return {data:{path}, error:null}; },
      async createSignedUrl(path){ return {data:{signedUrl:'data:audio/webm;base64,GkXfo0AgQoaBAULygQRC84EIQoKEd2VibUKHgQRChYEC'}, error:null}; },
      async remove(paths){ for (const p of paths) delete (window.__files||{})[bucket + '/' + p]; return {data:null, error:null}; }
    }; } },
    from: q,
    rpc(name){ return Promise.resolve({data: name === 'my_structure' ? (window.__struct || []) : null, error: null}); },
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
