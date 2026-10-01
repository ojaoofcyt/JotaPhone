const PLAYER_ID_KEY = "jotaphone_player_id";
const PLAYER_NAME_KEY = "jotaphone_player_name";

function criarIdJogador() {
  let id = localStorage.getItem(PLAYER_ID_KEY);

  if (!id) {
    if (crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id =
        "JP-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10);
    }

    localStorage.setItem(PLAYER_ID_KEY, id);
  }

  return id;
}

function salvarNomeJogador(nome) {
  nome = nome.trim();

  if (nome) {
    localStorage.setItem(PLAYER_NAME_KEY, nome);
  }

  return nome;
}

function pegarNomeJogador() {
  return localStorage.getItem(PLAYER_NAME_KEY) || "";
}

function pegarJogador() {
  return {
    id: criarIdJogador(),
    nome: pegarNomeJogador()
  };
}

window.JotaPlayer = {
  criarIdJogador,
  salvarNomeJogador,
  pegarNomeJogador,
  pegarJogador
};
