// JotaPhone - Sistema ONLINE
// Este arquivo é separado do modo LAN/local.

const JOTA_FIREBASE_VERSION = "12.19.0";
const MAX_JOGADORES_ONLINE = 12;

let jotaDb = null;
let codigoSalaOnlineAtual = null;

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
    update,
    remove,
    onValue,
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
    update,
    remove,
    onValue,
    onDisconnect,
    serverTimestamp
  };
})();

function limparCodigoSalaOnline(codigo) {
  return String(codigo || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function gerarCodigoSalaOnline() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";

  for (let i = 0; i < 5; i++) {
    codigo += caracteres[
      Math.floor(Math.random() * caracteres.length)
    ];
  }

  return codigo;
}

async function criarSalaOnline() {
  const firebase = await jotaOnlinePronto;

  if (!window.JotaPlayer) {
    throw new Error("player.js não foi carregado.");
  }

  const jogador = window.JotaPlayer.pegarJogador();

  if (!jogador.nome) {
    throw new Error("O jogador precisa escolher um nome primeiro.");
  }

  let codigo;
  let existe;

  do {
    codigo = gerarCodigoSalaOnline();

    const snapshot = await firebase.get(
      firebase.ref(jotaDb, `salasOnline/${codigo}`)
    );

    existe = snapshot.exists();
  } while (existe);

  const sala = {
    codigo,
    status: "esperando",
    hostId: jogador.id,
    criadaEm: firebase.serverTimestamp()
  };

  await firebase.set(
    firebase.ref(jotaDb, `salasOnline/${codigo}/info`),
    sala
  );

  await adicionarJogadorNaSalaOnline(codigo, jogador);

  codigoSalaOnlineAtual = codigo;

  return codigo;
}

async function entrarSalaOnline(codigo) {
  const firebase = await jotaOnlinePronto;

  if (!window.JotaPlayer) {
    throw new Error("player.js não foi carregado.");
  }

  codigo = limparCodigoSalaOnline(codigo);

  if (codigo.length !== 5) {
    throw new Error("Código da sala inválido.");
  }

  const salaRef = firebase.ref(
    jotaDb,
    `salasOnline/${codigo}`
  );

  const snapshot = await firebase.get(salaRef);

  if (!snapshot.exists()) {
    throw new Error("Essa sala online não existe.");
  }

  const dadosSala = snapshot.val();

  if (
    dadosSala.info &&
    dadosSala.info.status === "iniciada"
  ) {
    throw new Error("Essa partida já começou.");
  }

  const jogadores = dadosSala.jogadores || {};

  if (
    Object.keys(jogadores).length >=
    MAX_JOGADORES_ONLINE
  ) {
    throw new Error("Essa sala já está cheia.");
  }

  const jogador = window.JotaPlayer.pegarJogador();

  if (!jogador.nome) {
    throw new Error("O jogador precisa escolher um nome primeiro.");
  }

  await adicionarJogadorNaSalaOnline(codigo, jogador);

  codigoSalaOnlineAtual = codigo;

  return codigo;
}

async function adicionarJogadorNaSalaOnline(
  codigo,
  jogador
) {
  const firebase = await jotaOnlinePronto;

  const jogadorRef = firebase.ref(
    jotaDb,
    `salasOnline/${codigo}/jogadores/${jogador.id}`
  );

  await firebase.set(jogadorRef, {
    id: jogador.id,
    nome: jogador.nome,
    entrouEm: firebase.serverTimestamp()
  });

  try {
    await firebase
      .onDisconnect(jogadorRef)
      .remove();
  } catch (erro) {
    console.warn(
      "Não foi possível configurar onDisconnect:",
      erro
    );
  }
}

async function atualizarNomeJogadorOnline(nome) {
  const firebase = await jotaOnlinePronto;

  if (!codigoSalaOnlineAtual) return;

  const jogador = window.JotaPlayer.pegarJogador();

  await firebase.update(
    firebase.ref(
      jotaDb,
      `salasOnline/${codigoSalaOnlineAtual}/jogadores/${jogador.id}`
    ),
    {
      nome
    }
  );
}

async function observarJogadoresOnline(callback) {
  const firebase = await jotaOnlinePronto;

  if (!codigoSalaOnlineAtual) {
    throw new Error(
      "Você ainda não entrou em uma sala online."
    );
  }

  const jogadoresRef = firebase.ref(
    jotaDb,
    `salasOnline/${codigoSalaOnlineAtual}/jogadores`
  );

  return firebase.onValue(
    jogadoresRef,
    snapshot => {
      const jogadores = snapshot.val() || {};
      callback(Object.values(jogadores));
    }
  );
}

async function observarSalaOnline(callback) {
  const firebase = await jotaOnlinePronto;

  if (!codigoSalaOnlineAtual) {
    throw new Error(
      "Você ainda não entrou em uma sala online."
    );
  }

  return firebase.onValue(
    firebase.ref(
      jotaDb,
      `salasOnline/${codigoSalaOnlineAtual}`
    ),
    snapshot => {
      callback(snapshot.val());
    }
  );
}

async function iniciarPartidaOnline() {
  const firebase = await jotaOnlinePronto;

  if (!codigoSalaOnlineAtual) {
    throw new Error(
      "Nenhuma sala online aberta."
    );
  }

  const jogador = window.JotaPlayer.pegarJogador();

  const infoSnapshot = await firebase.get(
    firebase.ref(
      jotaDb,
      `salasOnline/${codigoSalaOnlineAtual}/info`
    )
  );

  const info = infoSnapshot.val();

  if (!info || info.hostId !== jogador.id) {
    throw new Error(
      "Só quem criou a sala pode iniciar a partida."
    );
  }

  await firebase.update(
    firebase.ref(
      jotaDb,
      `salasOnline/${codigoSalaOnlineAtual}/info`
    ),
    {
      status: "iniciada",
      iniciadaEm: firebase.serverTimestamp()
    }
  );
}

async function sairSalaOnline() {
  const firebase = await jotaOnlinePronto;

  if (!codigoSalaOnlineAtual) return;

  const jogador = window.JotaPlayer.pegarJogador();

  await firebase.remove(
    firebase.ref(
      jotaDb,
      `salasOnline/${codigoSalaOnlineAtual}/jogadores/${jogador.id}`
    )
  );

  codigoSalaOnlineAtual = null;
}

function pegarCodigoSalaOnlineAtual() {
  return codigoSalaOnlineAtual;
}

window.JotaOnline = {
  pronto: jotaOnlinePronto,
  criarSalaOnline,
  entrarSalaOnline,
  iniciarPartidaOnline,
  sairSalaOnline,
  observarJogadoresOnline,
  observarSalaOnline,
  atualizarNomeJogadorOnline,
  pegarCodigoSalaOnlineAtual
};
