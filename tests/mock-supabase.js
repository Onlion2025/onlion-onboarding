// Minimaler Supabase-Ersatz für den lokalen Test (In-Memory).
(function(){
  const rows = new Map(); // key collection/id -> {collection,id,data}
  window.__rows = rows;
  function q(table){
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
  window.supabase = { createClient(){ return {
    from: q,
    channel(){ return { on(){ return this; }, subscribe(){ return this; } }; },
    auth: {
      async getSession(){ return {data:{session}}; },
      async signInWithPassword({email, password}){ if (password === 'falsch') return {data:{}, error:{message:'invalid'}}; session = {user:{email}, access_token:'tok'}; return {data:{session}, error:null}; },
      async signOut(){ session = null; },
      onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; }
    }
  }; } };
})();
