// JotaPhone - modo ONLINE via Firebase Realtime Database
const JOTA_FIREBASE_VERSION = "12.19.0";
let jotaDb = null;

const jotaOnlinePronto = (async () => {
  const appSdk = await import(
    `https://www.gstatic.com/firebasejs/${JOTA_FIREBASE_VERSION}/firebase-app.js`
  );

  const dbSdk = await import(
    `https://www.gstatic.com/firebasejs/${JOTA_FIREBASE_VERSION}/firebase-database.js`
  );

  const {
    initializeApp,
    getApps,
    getApp
  } = appSdk;

  const {
    getDatabase,
    ref,
    set,
    get,
    remove,
    onValue,
    onChildAdded,
    push,
    runTransaction,
    onDisconnect,
    serverTimestamp
  } = dbSdk;

  const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

  const databaseURL =
    firebaseConfig.databaseURL ||
    `https://${firebaseConfig.projectId}-default-rtdb.firebaseio.com`;

  jotaDb = getDatabase(app, databaseURL);

  return {
    ref,
    set,
    get,
    remove,
    onValue,
    onChildAdded,
    push,
    runTransaction,
    onDisconnect,
    serverTimestamp
  };
})();

const limparCodigoSalaOnline = codigo =>
  String(codigo || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);

async function atualizarResumoSalaOnline(room) {
  const f = await jotaOnlinePronto;

  if (!room || !room.code) {
    return;
  }

  const p = f.ref(
    jotaDb,
    `salasPublicas/${room.code}`
  );

  if (!room.pub || room.phase !== "lobby") {
    await f.remove(p);
    return;
  }

  const host =
    (room.players || []).find(
      x => x.id === room.host
    ) || {
      name: "Jogador",
      av: 0
    };

  await f.set(p, {
    code: room.code,
    name: room.name || "Sala",
    max: room.max || 12,
    n: (room.players || []).length,
    host: {
      name: host.name || "Jogador",
      av: host.av || 0
    },
    atualizadaEm: f.serverTimestamp()
  });
}

async function marcarPresencaOnline(
  code,
  playerId
) {
  const f = await jotaOnlinePronto;

  const p = f.ref(
    jotaDb,
    `salasOnline/${code}/presence/${playerId}`
  );

  await f.set(p, {
    online: true,
    at: f.serverTimestamp()
  });

  try {
    await f.onDisconnect(p).remove();
  } catch (e) {}
}

async function criarSalaOnline(room) {
  const f = await jotaOnlinePronto;

  const code = limparCodigoSalaOnline(
    room && room.code
  );

  if (code.length !== 5) {
    throw new Error(
      "Código da sala inválido."
    );
  }

  const raiz = f.ref(
    jotaDb,
    `salasOnline/${code}`
  );

  const existe = await f.get(raiz);

  if (existe.exists()) {
    throw new Error(
      "Esse código já está em uso. Tente criar outra sala."
    );
  }

  room.code = code;

  await f.set(raiz, {
    state: room,
    criadaEm: f.serverTimestamp()
  });

  const jogador =
    (room.players || []).find(
      p => p.id === room.host
    );

  if (jogador) {
    await marcarPresencaOnline(
      code,
      jogador.id
    );
  }

  await atualizarResumoSalaOnline(room);

  return code;
}

async function entrarSalaOnline(
  codigo,
  jogador
) {
  const f = await jotaOnlinePronto;

  const code = limparCodigoSalaOnline(
    codigo
  );

  if (code.length !== 5) {
    throw new Error(
      "Código da sala inválido."
    );
  }

  let motivo =
    "Não foi possível entrar nessa sala.";

  const stateRef = f.ref(
    jotaDb,
    `salasOnline/${code}/state`
  );

  const resultado =
    await f.runTransaction(
      stateRef,
      state => {
        if (!state) {
          motivo =
            "Essa sala online não existe.";
          return;
        }

        if (state.phase !== "lobby") {
          motivo =
            "Essa partida já começou.";
          return;
        }

        const players =
          Array.isArray(state.players)
            ? state.players.filter(Boolean)
            : [];

        const pos =
          players.findIndex(
            p =>
              p &&
              p.id === jogador.id
          );

        if (
          pos < 0 &&
          players.length >=
            (+state.max || 12)
        ) {
          motivo =
            "Essa sala já está cheia.";
          return;
        }

        if (pos >= 0) {
          players[pos] = jogador;
        } else {
          players.push(jogador);
        }

        state.players = players;

        return state;
      }
    );

  if (!resultado.committed) {
    // Remove automaticamente salas
    // antigas/fantas
