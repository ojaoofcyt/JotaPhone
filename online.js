// JotaPhone - modo ONLINE via Firebase Realtime Database
// Arquivo completo para substituir o online.js no GitHub.

const JOTA_FIREBASE_VERSION = "12.19.0";
let jotaDb = null;

const jotaOnlinePronto = (async () => {
  if (typeof firebaseConfig === "undefined") {
    throw new Error("firebase-config.js não foi carregado.");
  }

  const appSdk = await import(`https://www.gstatic.com/firebasejs/${JOTA_FIREBASE_VERSION}/firebase-app.js`);
  const dbSdk = await import(`https://www.gstatic.com/firebasejs/${JOTA_FIREBASE_VERSION}/firebase-database.js`);

  const { initializeApp, getApps, getApp } = appSdk;
  const {
    getDatabase, ref, set, get, remove, onValue, onChildAdded,
    push, runTransaction, onDisconnect, serverTimestamp
  } = dbSdk;

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const databaseURL = firebaseConfig.databaseURL ||
    `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`;

  jotaDb = getDatabase(app, databaseURL);

  return {
    ref, set, get, remove, onValue, onChildAdded,
    push, runTransaction, onDisconnect, serverTimestamp
  };
})();

function limparCodigoSalaOnline(codigo) {
  return String(codigo || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function normalizarJogadorOnline(jogador) {
  return {
    id: String((jogador && jogador.id) || ""),
    name: String((jogador && jogador.name) || "Jogador").slice(0, 14),
    av: Math.max(0, Number((jogador && jogador.av) || 0) | 0)
  };
}

function normalizarSalaPublicaOnline(valor, codigo) {
  const v = valor || {};
  const host = v.host || {};
  return {
    code: limparCodigoSalaOnline(v.code || codigo),
    name: String(v.name || "Sala").slice(0, 22),
    max: Number(v.max || 12),
    n: Number(v.n || 0),
    host: {
      name: String(host.name || "Jogador").slice(0, 14),
      av: Math.max(0, Number(host.av || 0) | 0)
    }
  };
}

async function atualizarResumoSalaOnline(room) {
  const f = await jotaOnlinePronto;
  if (!room || !room.code) return;

  const code = limparCodigoSalaOnline(room.code);
  if (code.length !== 5) return;

  const publicRef = f.ref(jotaDb, `salasPublicas/${code}`);

  if (!room.pub || room.phase !== "lobby") {
    await f.remove(publicRef);
    return;
  }

  const players = Array.isArray(room.players) ? room.players.filter(Boolean) : [];
  const host = players.find(p => p && p.id === room.host) || players[0] || {
    name: "Jogador",
    av: 0
  };

  await f.set(publicRef, {
    code,
    name: String(room.name || "Sala").slice(0, 22),
    max: Number(room.max || 12),
    n: players.length,
    host: {
      name: String(host.name || "Jogador").slice(0, 14),
      av: Math.max(0, Number(host.av || 0) | 0)
    },
    atualizadaEm: f.serverTimestamp()
  });
}

async function marcarPresencaOnline(code, playerId) {
  const f = await jotaOnlinePronto;
  code = limparCodigoSalaOnline(code);
  playerId = String(playerId || "");
  if (code.length !== 5 || !playerId) return;

  const presenceRef = f.ref(jotaDb, `salasOnline/${code}/presence/${playerId}`);
  await f.set(presenceRef, {
    online: true,
    at: f.serverTimestamp()
  });

  try {
    await f.onDisconnect(presenceRef).remove();
  } catch (_) {}
}

async function criarSalaOnline(room) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(room && room.code);

  if (code.length !== 5) throw new Error("Código da sala inválido.");
  if (!room) throw new Error("Dados da sala inválidos.");

  const roomRef = f.ref(jotaDb, `salasOnline/${code}`);
  const existente = await f.get(roomRef);

  if (existente.exists()) {
    throw new Error("Esse código já está em uso. Tente criar outra sala.");
  }

  room.code = code;
  await f.set(roomRef, {
    state: room,
    criadaEm: f.serverTimestamp()
  });

  const jogador = (room.players || []).find(p => p && p.id === room.host);
  if (jogador) await marcarPresencaOnline(code, jogador.id);

  await atualizarResumoSalaOnline(room);
  return code;
}

async function entrarSalaOnline(codigo, jogador) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(codigo);

  if (code.length !== 5) throw new Error("Código da sala inválido.");

  const player = normalizarJogadorOnline(jogador);
  if (!player.id) throw new Error("Jogador inválido.");

  let motivo = "Não foi possível entrar nessa sala.";
  const stateRef = f.ref(jotaDb, `salasOnline/${code}/state`);

  const resultado = await f.runTransaction(
    stateRef,
    state => {
      if (!state) {
        motivo = "Essa sala online não existe.";
        return;
      }

      if (state.phase !== "lobby") {
        motivo = "Essa partida já começou.";
        return;
      }

      const players = Array.isArray(state.players) ? state.players.filter(Boolean) : [];
      const pos = players.findIndex(p => p && p.id === player.id);

      if (pos < 0 && players.length >= Number(state.max || 12)) {
        motivo = "Essa sala já está cheia.";
        return;
      }

      if (pos >= 0) players[pos] = player;
      else players.push(player);

      state.players = players;
      return state;
    },
    { applyLocally: false }
  );

  if (!resultado.committed) throw new Error(motivo);

  const room = resultado.snapshot.val();
  if (!room) throw new Error("Essa sala online não existe.");

  room.code = code;
  await marcarPresencaOnline(code, player.id);
  await atualizarResumoSalaOnline(room);
  return room;
}

async function definirEstadoSalaOnline(codigo, room) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(codigo);

  if (code.length !== 5) throw new Error("Código da sala inválido.");
  if (!room) throw new Error("Estado da sala inválido.");

  room.code = code;
  await f.set(f.ref(jotaDb, `salasOnline/${code}/state`), room);
  await atualizarResumoSalaOnline(room);
  return true;
}

async function apagarSalaOnline(codigo) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(codigo);
  if (code.length !== 5) return;

  await Promise.all([
    f.remove(f.ref(jotaDb, `salasOnline/${code}`)),
    f.remove(f.ref(jotaDb, `salasPublicas/${code}`))
  ]);
}

async function enviarAcaoOnline(codigo, jogadorId, tipo, dados) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(codigo);
  const from = String(jogadorId || "");

  if (code.length !== 5) throw new Error("Código da sala inválido.");
  if (!from) throw new Error("Jogador inválido.");

  const actionRef = f.ref(jotaDb, `salasOnline/${code}/actions`);
  await f.push(actionRef, {
    from,
    k: String(tipo || ""),
    d: dados === undefined ? null : dados,
    at: f.serverTimestamp()
  });

  return true;
}

async function removerAcaoOnline(codigo, actionKey) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(codigo);
  const key = String(actionKey || "");
  if (code.length !== 5 || !key) return;

  await f.remove(f.ref(jotaDb, `salasOnline/${code}/actions/${key}`));
}

async function observarEstadoSalaOnline(codigo, callback) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(codigo);

  if (code.length !== 5) throw new Error("Código da sala inválido.");

  return f.onValue(
    f.ref(jotaDb, `salasOnline/${code}/state`),
    snapshot => {
      const room = snapshot.val();
      if (room) room.code = code;
      callback(room || null);
    },
    error => console.error("Erro ao observar estado da sala:", error)
  );
}

async function observarAcoesOnline(codigo, callback) {
  const f = await jotaOnlinePronto;
  const code = limparCodigoSalaOnline(codigo);

  if (code.length !== 5) throw new Error("Código da sala inválido.");

  return f.onChildAdded(
    f.ref(jotaDb, `salasOnline/${code}/actions`),
    snapshot => {
      const action = snapshot.val();
      if (action) callback(action, snapshot.key);
    },
    error => console.error("Erro ao observar ações online:", error)
  );
}

async function observarSalasPublicasOnline(callback) {
  const f = await jotaOnlinePronto;

  return f.onValue(
    f.ref(jotaDb, "salasPublicas"),
    snapshot => {
      const data = snapshot.val() || {};
      const rooms = Object.entries(data)
        .map(([code, value]) => normalizarSalaPublicaOnline(value, code))
        .filter(room => room.code.length === 5)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR"));

      callback(rooms);
    },
    error => {
      console.error("Erro ao observar salas públicas:", error);
      callback([]);
    }
  );
}

// API esperada pelo index.html
window.JotaOnline = {
  criarSalaOnline,
  entrarSalaOnline,
  definirEstadoSalaOnline,
  apagarSalaOnline,
  enviarAcaoOnline,
  removerAcaoOnline,
  observarEstadoSalaOnline,
  observarAcoesOnline,
  observarSalasPublicasOnline
};
