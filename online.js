// JotaPhone - modo ONLINE via Firebase Realtime Database
const JOTA_FIREBASE_VERSION = "12.19.0";
let jotaDb = null;

const jotaOnlinePronto = (async () => {
  const appSdk = await import(`https://www.gstatic.com/firebasejs/${JOTA_FIREBASE_VERSION}/firebase-app.js`);
  const dbSdk = await import(`https://www.gstatic.com/firebasejs/${JOTA_FIREBASE_VERSION}/firebase-database.js`);

  const { initializeApp, getApps, getApp } = appSdk;
  const {
    getDatabase, ref, set, get, remove, onValue,
    onChildAdded, push, runTransaction, onDisconnect, serverTimestamp
  } = dbSdk;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const databaseURL = firebaseConfig.databaseURL ||
    `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`;

  jotaDb = getDatabase(app, databaseURL);

  return {
    ref, set, get, remove, onValue,
    onChildAdded, push, runTransaction, onDisconnect, serverTimestamp
  };
})();

const limparCodigoSalaOnline = codigo =>
  String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

async function atualizarResumoSalaOnline(room) {
  const f = await jotaOnlinePronto;
  if (!room || !room.code) return;

  const p = f.ref(jotaDb, `salasPublicas/${room.code}`);
  if (!room.pub || room.phase !== "lobby") {
    await f.remove(p);
    return;
  }

  const host = (room.players || []).find(x => x.id === room.host) || { name: "Jogador", av: 0 };
  await f.set(p, {
    code: room.code,
    name: room.name || "Sala",
    max: room.max || 12,
    n: (room.players || []).length,
    host: { name: host.name || "Jogador", av: host.av || 0 },
    atualizadaEm: f.serverTimestamp()
  });
}

async function marcarPresencaOnline(code, playerId) {
  const f = await jotaOnlinePronto;
  const p = f.ref(jotaDb, `salasOnline/${code}/presence/${playerId}`);
  await f.set(p, { online: true, at: f.serverTimestamp() });
  try { await f.onDisconnect(p).remove(); } catch (e) {}
}

async function criarSalaOnline(room) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(room && room.code);
  if (code.length !== 5) throw new Error("Código da sala inválido.");

  const raiz = f.ref(jotaDb, `salasOnline/${code}`);
  const existe = await f.get(raiz);
  if (existe.exists()) throw new Error("Esse código já está em uso. Tente criar outra sala.");

  room.code = code;
  await f.set(raiz, {
    state: room,
    criadaEm: f.serverTimestamp()
  });

  const jogador = (room.players || []).find(p => p.id === room.host);
  if (jogador) await marcarPresencaOnline(code, jogador.id);
  await atualizarResumoSalaOnline(room);
  return code;
}

async function entrarSalaOnline(codigo, jogador) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(codigo);
  if (code.length !== 5) throw new Error("Código da sala inválido.");

  let motivo = "Não foi possível entrar nessa sala.";
  const stateRef = f.ref(jotaDb, `salasOnline/${code}/state`);

  const resultado = await f.runTransaction(stateRef, state => {
    if (!state) {
      motivo = "Essa sala online não existe.";
      return;
    }
    if (state.phase !== "lobby") {
      motivo = "Essa partida já começou.";
      return;
    }

    const players = Array.isArray(state.players) ? state.players.filter(Boolean) : [];
    const pos = players.findIndex(p => p && p.id === jogador.id);

    if (pos < 0 && players.length >= (+state.max || 12)) {
      motivo = "Essa sala já está cheia.";
      return;
    }

    if (pos >= 0) players[pos] = jogador;
    else players.push(jogador);

    state.players = players;
    return state;
  });

  if (!resultado.committed) throw new Error(motivo);

  const room = resultado.snapshot.val();
  await marcarPresencaOnline(code, jogador.id);
  await atualizarResumoSalaOnline(room);
  return room;
}

async function definirEstadoSalaOnline(code, room) {
  const f = await jotaOnlinePronto;
  code = limparCodigoSalaOnline(code);
  await f.set(f.ref(jotaDb, `salasOnline/${code}/state`), room);
  await atualizarResumoSalaOnline(room);
}

async function observarEstadoSalaOnline(code, callback) {
  const f = await jotaOnlinePronto;
  code = limparCodigoSalaOnline(code);
  return f.onValue(f.ref(jotaDb, `salasOnline/${code}/state`), snap => {
    callback(snap.exists() ? snap.val() : null);
  });
}

async function enviarAcaoOnline(code, from, k, d) {
  const f = await jotaOnlinePronto;
  code = limparCodigoSalaOnline(code);
  const p = f.push(f.ref(jotaDb, `salasOnline/${code}/actions`));
  await f.set(p, {
    from,
    k,
    d: d === undefined ? null : d,
    at: Date.now()
  });
}

async function observarAcoesOnline(code, callback) {
  const f = await jotaOnlinePronto;
  code = limparCodigoSalaOnline(code);
  return f.onChildAdded(f.ref(jotaDb, `salasOnline/${code}/actions`), snap => {
    const a = snap.val();
    if (a) callback(a, snap.key);
  });
}

async function removerAcaoOnline(code, key) {
  const f = await jotaOnlinePronto;
  if (!key) return;
  await f.remove(f.ref(jotaDb, `salasOnline/${limparCodigoSalaOnline(code)}/actions/${key}`));
}

async function apagarSalaOnline(code) {
  const f = await jotaOnlinePronto;
  code = limparCodigoSalaOnline(code);
  await Promise.all([
    f.remove(f.ref(jotaDb, `salasOnline/${code}`)),
    f.remove(f.ref(jotaDb, `salasPublicas/${code}`))
  ]);
}

async function observarSalasPublicasOnline(callback) {
  const f = await jotaOnlinePronto;
  return f.onValue(f.ref(jotaDb, "salasPublicas"), snap => {
    const o = snap.val() || {};
    const list = Object.values(o)
      .filter(Boolean)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    callback(list);
  });
}

window.JotaOnline = {
  pronto: jotaOnlinePronto,
  criarSalaOnline,
  entrarSalaOnline,
  definirEstadoSalaOnline,
  observarEstadoSalaOnline,
  enviarAcaoOnline,
  observarAcoesOnline,
  removerAcaoOnline,
  apagarSalaOnline,
  observarSalasPublicasOnline
};
