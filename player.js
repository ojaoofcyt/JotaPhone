const PLAYER_ID_KEY = "jotaphone_player_id";
const PLAYER_NAME_KEY = "jotaphone_player_name";
const PLAYER_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function novoIdJogador() {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  let codigo = "JP-";
  for (const b of bytes) codigo += PLAYER_ID_CHARS[b % PLAYER_ID_CHARS.length];
  return codigo;
}

function criarIdJogador() {
  let id = "";
  try { id = localStorage.getItem(PLAYER_ID_KEY) || ""; } catch (e) {}

  if (!id) {
    id = novoIdJogador();
    try { localStorage.setItem(PLAYER_ID_KEY, id); } catch (e) {}
  }
  return id;
}

function salvarNomeJogador(nome) {
  nome = String(nome || "").trim();
  if (nome) {
    try { localStorage.setItem(PLAYER_NAME_KEY, nome); } catch (e) {}
  }
  return nome;
}

function pegarNomeJogador() {
  try { return localStorage.getItem(PLAYER_NAME_KEY) || ""; }
  catch (e) { return ""; }
}

function pegarJogador() {
  return { id: criarIdJogador(), nome: pegarNomeJogador() };
}

window.JotaPlayer = {
  criarIdJogador,
  salvarNomeJogador,
  pegarNomeJogador,
  pegarJogador
};
