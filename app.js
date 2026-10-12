/* ============================================================
   Reunited Airlines — SPA (HTML real + JS só de interatividade)
   ============================================================ */

const SUPABASE_URL = 'https://mjqwiqjojkzobuysziyv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1qcXdpcWpvamt6b2J1eXN6aXl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3Nzc4MzMsImV4cCI6MjEwNjM1MzgzM30.w4zDJdmAOmZBnvfXHZ3YDu2qfiUs_gSOnccY0S2ahG8';
const BUCKET = 'releases';

let sb = null;
try {
  if (window.supabase) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (e) { console.warn('Supabase indisponível', e); }

const STORAGE = {
  users: 'reunited_usuarios',
  sessao: 'reunited_sessao',
  carrinho: 'reunited_carrinho',
  tema: 'reunited_tema'
};

const state = {
  usuario: null,
  tema: 'branco',
  carrinho: [],
  rota: 'landing'
};

const PASSAGENS = [
  {
    id: '52791',
    origem: 'New York (Larnaca)',
    destino: 'Rio de Janeiro (Tokyo)',
    dia: '13/10/2026',
    horario: '18:00',
    aeronave: 'Boeing 787',
    assentosOcupados: []
  }
];

/* ============ Helpers ============ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function toast(msg, tipo = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (tipo ? ' ' + tipo : '');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function formatarConta(seg) {
  return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
}

/* ============ LocalStorage ============ */
const carregarUsuarios = () => { try { return JSON.parse(localStorage.getItem(STORAGE.users)) || {}; } catch { return {}; } };
const salvarUsuarios = (u) => localStorage.setItem(STORAGE.users, JSON.stringify(u));
const salvarSessao = (u) => localStorage.setItem(STORAGE.sessao, u);
const limparSessao = () => localStorage.removeItem(STORAGE.sessao);
const carregarSessao = () => localStorage.getItem(STORAGE.sessao);
const salvarCarrinho = () => localStorage.setItem(STORAGE.carrinho, JSON.stringify(state.carrinho));
const carregarCarrinho = () => {
  try { state.carrinho = JSON.parse(localStorage.getItem(STORAGE.carrinho)) || []; }
  catch { state.carrinho = []; }
};

/* ============ Tema ============ */
function aplicarTema(t) {
  state.tema = (t === 'preto') ? 'preto' : 'branco';
  localStorage.setItem(STORAGE.tema, state.tema);
  document.documentElement.setAttribute('data-tema', state.tema);
  $$('.theme-swatch').forEach(el => {
    el.classList.toggle('ativo', el.dataset.temaOp === state.tema);
  });
}

/* ============ Supabase TXT ============ */
async function enviarTxt(nomeArquivo, conteudo) {
  if (!sb) { console.warn('Supabase indisponível. Conteúdo:', nomeArquivo, conteudo); return { ok: false }; }
  try {
    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
    const caminho = `${Date.now()}_${nomeArquivo}`;
    const { error } = await sb.storage.from(BUCKET).upload(caminho, blob, {
      cacheControl: '3600', upsert: false, contentType: 'text/plain;charset=utf-8'
    });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error('Erro TXT:', err);
    return { ok: false };
  }
}

/* ============ Roteamento ============ */
function irPara(rota) {
  // rotas que exigem login
  const precisaLogin = ['inicio', 'passagens', 'carrinho', 'config', 'conta-info',
    'conta-editar', 'suporte', 'candidatura', 'termos', 'privacidade', 'contrato'];
  if (precisaLogin.includes(rota) && !state.usuario) {
    toast('Faça login primeiro.', 'erro');
    rota = 'login';
  }
  // rotas públicas de auth
  const publicas = ['landing', 'login', 'cadastro', 'recuperar'];
  if (!publicas.includes(rota) && !state.usuario) {
    rota = 'login';
  }

  state.rota = rota;

  // esconder todas as telas
  $$('.tela').forEach(t => t.hidden = true);
  const alvo = $(`#tela-${rota}`);
  if (!alvo) { console.warn('Rota não encontrada:', rota); return; }
  alvo.hidden = false;

  // header só aparece para rotas logadas (não landing/login/cadastro/recuperar)
  const mostrarHeader = !['landing', 'login', 'cadastro', 'recuperar'].includes(rota);
  const header = $('#header');
  header.hidden = !mostrarHeader;

  // atualizar dados dinâmicos
  if (mostrarHeader) {
    atualizarHeader();
    atualizarDrawer();
  }

  if (rota === 'inicio') renderInicio();
  if (rota === 'passagens') renderPassagens();
  if (rota === 'carrinho') renderCarrinho();
  if (rota === 'conta-info') renderInfoConta();
  if (rota === 'conta-editar') preencherEditar();
  if (rota === 'config') aplicarTema(state.tema);

  // marcar item ativo no drawer
  $$('.drawer__item').forEach(el => {
    el.classList.toggle('ativo', el.dataset.nav === rota);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============ Header / Drawer ============ */
function atualizarHeader() {
  const badge = $('#badge-carrinho');
  if (state.carrinho.length > 0) {
    badge.textContent = state.carrinho.length;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function atualizarDrawer() {
  if (!state.usuario) return;
  $('#drawer-avatar').textContent = (state.usuario.usuario || 'U').charAt(0).toUpperCase();
  $('#drawer-nome').textContent = state.usuario.usuario;
  $('#drawer-email').textContent = state.usuario.email;
}

function abrirDrawer() {
  $('#drawer').classList.add('aberto');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#drawer-overlay').classList.add('aberto');
}
function fecharDrawer() {
  $('#drawer').classList.remove('aberto');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#drawer-overlay').classList.remove('aberto');
}

/* ============ Render dinâmico (só listas) ============ */
function cardPassagem(p) {
  const orig = esc(p.origem.split(' (')[0]);
  const dest = esc(p.destino.split(' (')[0]);
  return `
  <article class="flight">
    <div class="flight__top">
      <div class="flight__id">VÔO #${esc(p.id)}</div>
      <div class="flight__route">
        <span>${orig}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></svg>
        <span>${dest}</span>
      </div>
    </div>
    <div class="flight__body">
      <div class="flight__info">
        <div class="flight__info-item"><span class="flight__info-label">Data</span><span class="flight__info-value">${esc(p.dia)}</span></div>
        <div class="flight__info-item"><span class="flight__info-label">Horário</span><span class="flight__info-value">${esc(p.horario)}</span></div>
        <div class="flight__info-item"><span class="flight__info-label">Aeronave</span><span class="flight__info-value">${esc(p.aeronave)}</span></div>
        <div class="flight__info-item"><span class="flight__info-label">Origem</span><span class="flight__info-value" style="font-size:.8rem">${esc(p.origem)}</span></div>
      </div>
      <span class="flight__price-tag">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
        Gratuito
      </span>
      <div class="flight__actions">
        <button class="btn btn--outline btn--sm btn--full" data-add-carrinho="${esc(p.id)}">Adicionar ao carrinho</button>
      </div>
    </div>
  </article>`;
}

function renderInicio() {
  $('#inicio-saudacao').textContent = `Olá, ${state.usuario.usuario}!`;
  $('#inicio-flights').innerHTML = PASSAGENS.map(cardPassagem).join('');
}

function renderPassagens() {
  $('#passagens-lista').innerHTML = PASSAGENS.map(cardPassagem).join('');
}

function renderCarrinho() {
  const lista = $('#carrinho-lista');
  const vazio = $('#carrinho-vazio');
  const resumo = $('#carrinho-resumo');
  const sub = $('#carrinho-sub');

  if (!state.carrinho.length) {
    lista.innerHTML = '';
    lista.hidden = true;
    vazio.hidden = false;
    resumo.hidden = true;
    sub.textContent = '';
    return;
  }

  lista.hidden = false;
  vazio.hidden = true;
  resumo.hidden = false;
  sub.textContent = `${state.carrinho.length} passagem(ns) no carrinho.`;

  lista.innerHTML = state.carrinho.map(item => `
    <div class="cart-item">
      <div class="cart-item__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
      </div>
      <div class="cart-item__info">
        <div class="cart-item__route">${esc(item.origem.split(' (')[0])} → ${esc(item.destino.split(' (')[0])}</div>
        <div class="cart-item__meta">Vôo #${esc(item.id)} • ${esc(item.dia)} às ${esc(item.horario)} • ${esc(item.aeronave)}</div>
      </div>
      <button class="icon-btn" style="background:var(--bg-alt);color:var(--vermelho)" data-remover-carrinho="${esc(item.id)}" aria-label="Remover">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6 18 20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
    </div>
  `).join('');

  $('#carrinho-total').textContent = state.carrinho.length;
  atualizarHeader();
}

function renderInfoConta() {
  if (!state.usuario) return;
  $('#info-nome').textContent = state.usuario.nome || '—';
  $('#info-user').textContent = state.usuario.usuario || '—';
  $('#info-email').textContent = state.usuario.email || '—';
}

function preencherEditar() {
  if (!state.usuario) return;
  $('#ed-nome').value = state.usuario.nome || '';
  $('#ed-user').value = state.usuario.usuario || '';
  $('#ed-email').value = state.usuario.email || '';
}

/* ============ Modal ============ */
function abrirModal({ titulo, sub = '', corpo = '', acoes = [] }) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-sub').textContent = sub;
  $('#modal-corpo').innerHTML = corpo;
  const box = $('#modal-acoes');
  box.innerHTML = '';
  acoes.forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.classe || 'btn--primary');
    b.textContent = a.texto;
    if (a.autoFechar) b.addEventListener('click', fecharModal);
    if (a.onClick) b.addEventListener('click', a.onClick);
    box.appendChild(b);
  });
  $('#modal-overlay').hidden = false;
}
function fecharModal() { $('#modal-overlay').hidden = true; }

/* ============ Seleção de assento ============ */
function escolherAssento(passagem) {
  return new Promise((resolve) => {
    const fileiras = 10, cols = ['A', 'B', 'C', 'D', 'E', 'F'];
    const todos = [];
    for (let f = 1; f <= fileiras; f++) cols.forEach(c => todos.push(f + c));

    const corpo = `
      <p style="margin-bottom:12px;font-size:.9rem;color:var(--texto-sec)">Vôo #${esc(passagem.id)} — ${esc(passagem.origem.split(' (')[0])} → ${esc(passagem.destino.split(' (')[0])}</p>
      <p style="margin-bottom:8px;font-weight:600">Escolha a classe:</p>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button type="button" class="btn btn--outline btn--sm" data-classe="Economica">Econômica</button>
        <button type="button" class="btn btn--outline btn--sm" data-classe="Primeira">Primeira classe</button>
      </div>
      <p style="font-weight:600;margin-top:14px;margin-bottom:6px">Escolha o assento:</p>
      <div class="seats-map" id="seats-map">
        ${todos.map(s => `<button type="button" class="seat" data-assento="${s}" ${passagem.assentosOcupados.includes(s) ? 'disabled' : ''}>${s}</button>`).join('')}
      </div>
    `;

    let classe = 'Economica';
    let assento = '';

    abrirModal({
      titulo: 'Escolher assento',
      sub: 'Clique em uma classe e depois no assento.',
      corpo,
      acoes: [
        { texto: 'Cancelar', classe: 'btn--outline', onClick: () => { fecharModal(); resolve(null); } },
        { texto: 'Confirmar', classe: 'btn--primary', onClick: () => {
            if (!assento) { toast('Escolha um assento.', 'erro'); return; }
            fecharModal();
            resolve({ classe, assento });
          } }
      ]
    });

    const modal = $('#modal');
    modal.addEventListener('click', function handler(e) {
      const btnClasse = e.target.closest('[data-classe]');
      if (btnClasse) {
        classe = btnClasse.dataset.classe;
        $$('[data-classe]', modal).forEach(b => {
          b.classList.toggle('btn--primary', b === btnClasse);
          b.classList.toggle('btn--outline', b !== btnClasse);
        });
      }
      const btnAssento = e.target.closest('.seat');
      if (btnAssento && !btnAssento.disabled) {
        assento = btnAssento.dataset.assento;
        $$('.seat', modal).forEach(s => s.classList.toggle('selecionado', s === btnAssento));
      }
    });
  });
}

/* ============ Ações de auth ============ */
function entrar(usuario) {
  state.usuario = usuario;
  salvarSessao(usuario.usuario);
  toast(`Bem-vindo, ${usuario.usuario}!`, 'sucesso');
  irPara('inicio');
}

function fazerLogin(e) {
  e.preventDefault();
  const usuario = $('#login-user').value.trim();
  const senha = $('#login-pass').value;
  let ok = true;

  $('#err-login-user').classList.toggle('show', !usuario);
  $('#err-login-pass').classList.toggle('show', !senha);
  if (!usuario || !senha) return;

  const users = carregarUsuarios();
  const u = users[usuario];
  if (!u || u.senha !== senha) { toast('Usuário ou senha inválidos.', 'erro'); return; }

  entrar(u);
}

function fazerCadastro(e) {
  e.preventDefault();
  const nome = $('#cad-nome').value.trim();
  const usuario = $('#cad-user').value.trim();
  const email = $('#cad-email').value.trim();
  const senha = $('#cad-senha').value;
  const conf = $('#cad-conf').value;
  const termos = $('#cad-termos').checked;
  let ok = true;

  const setErr = (id, cond) => { $(id).classList.toggle('show', cond); if (cond) ok = false; };
  setErr('#err-cad-nome', !nome);
  setErr('#err-cad-user', !usuario);
  setErr('#err-cad-email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  setErr('#err-cad-senha', senha.length < 6);
  setErr('#err-cad-conf', senha !== conf);
  setErr('#err-cad-termos', !termos);
  if (!ok) return;

  const users = carregarUsuarios();
  if (users[usuario]) { toast('Esse nome de usuário já existe.', 'erro'); return; }

  const novo = { nome, usuario, email, senha };
  users[usuario] = novo;
  salvarUsuarios(users);
  entrar(novo);
}

function fazerRecuperar(e) {
  e.preventDefault();
  const usuario = $('#rec-user').value.trim();
  const nova = $('#rec-nova').value;
  const conf = $('#rec-conf').value;
  let ok = true;

  const setErr = (id, cond) => { $(id).classList.toggle('show', cond); if (cond) ok = false; };
  setErr('#err-rec-user', !usuario);
  setErr('#err-rec-nova', nova.length < 6);
  setErr('#err-rec-conf', nova !== conf);
  if (!ok) return;

  const users = carregarUsuarios();
  if (!users[usuario]) { toast('Usuário não encontrado.', 'erro'); return; }

  users[usuario].senha = nova;
  salvarUsuarios(users);
  toast('Senha atualizada com sucesso!', 'sucesso');
  irPara('login');
}

/* ============ Editar conta ============ */
function salvarEdicao(e) {
  e.preventDefault();
  if (!state.usuario) return;
  const antigo = { ...state.usuario };
  const novo = {
    nome: $('#ed-nome').value.trim(),
    usuario: $('#ed-user').value.trim(),
    email: $('#ed-email').value.trim(),
    senha: state.usuario.senha
  };
  if (!novo.nome || !novo.usuario || !novo.email) { toast('Preencha todos os campos.', 'erro'); return; }

  const users = carregarUsuarios();
  if (novo.usuario !== antigo.usuario) {
    if (users[novo.usuario]) { toast('Nome de usuário já existe.', 'erro'); return; }
    delete users[antigo.usuario];
  }
  users[novo.usuario] = novo;
  salvarUsuarios(users);

  // TXT editado.txt
  const txt = [
    '=== INFORMAÇÕES ANTIGAS ===',
    `Nome: ${antigo.nome}`,
    `Usuário: ${antigo.usuario}`,
    `E-mail: ${antigo.email}`,
    '',
    '=== INFORMAÇÕES NOVAS ===',
    `Nome: ${novo.nome}`,
    `Usuário: ${novo.usuario}`,
    `E-mail: ${novo.email}`
  ].join('\n');
  enviarTxt('editado.txt', txt);

  state.usuario = novo;
  salvarSessao(novo.usuario);
  atualizarDrawer();
  toast('Informações salvas!', 'sucesso');
  irPara('conta-info');
}

/* ============ Suporte ============ */
async function enviarSuporte(e) {
  e.preventDefault();
  const assunto = $('#sup-assunto').value.trim();
  const mensagem = $('#sup-mensagem').value.trim();
  const imagem = $('#sup-imagem').files[0];
  if (!assunto || !mensagem) { toast('Preencha assunto e mensagem.', 'erro'); return; }

  const txt = [
    `E-mail: ${state.usuario.email}`,
    `Usuário: ${state.usuario.usuario}`,
    `Assunto: ${assunto}`,
    `Mensagem: ${mensagem}`,
    `Imagem: ${imagem ? imagem.name : 'sem imagem'}`
  ].join('\n');

  const r = await enviarTxt('suporte.txt', txt);
  if (r.ok) toast('Suporte enviado!', 'sucesso');
  else toast('Enviado localmente (Supabase indisponível).', '');
  e.target.reset();
}

/* ============ Candidatura ============ */
async function enviarCandidatura(e) {
  e.preventDefault();
  const d = {
    nome: $('#cd-nome').value.trim(),
    nomecompleto: $('#cd-nomecompleto').value.trim(),
    discord: $('#cd-discord').value.trim(),
    roblox: $('#cd-roblox').value.trim(),
    motivo: $('#cd-motivo').value.trim(),
    normas: $('#cd-normas').checked,
    atc: $('#cd-atc').checked,
    profissao: $('#cd-profissao').value
  };
  if (!d.nome || !d.nomecompleto || !d.discord || !d.roblox || !d.motivo || !d.normas || !d.atc || !d.profissao) {
    toast('Preencha todos os campos obrigatórios.', 'erro'); return;
  }

  const txt = [
    `E-mail: ${state.usuario.email}`,
    `Nome: ${d.nome}`,
    `Nome completo: ${d.nomecompleto}`,
    `Discord: ${d.discord}`,
    `Roblox: ${d.roblox}`,
    `Por que quer trabalhar na Reunited: ${d.motivo}`,
    `Reconhece normas de segurança: ${d.normas ? 'Sim' : 'Não'}`,
    `Reconhece instruções do ATC: ${d.atc ? 'Sim' : 'Não'}`,
    `Profissão: ${d.profissao}`
  ].join('\n');

  const r = await enviarTxt('reunited.txt', txt);
  if (r.ok) toast('Candidatura enviada!', 'sucesso');
  else toast('Enviada localmente (Supabase indisponível).', '');
  e.target.reset();
}

/* ============ Compra de passagem ============ */
async function confirmarCompra(passagem, dados) {
  const txt = [
    `E-mail: ${state.usuario.email}`,
    `Nome de usuário: ${state.usuario.usuario}`,
    `ID da passagem: ${passagem.id}`,
    `Assento: ${dados.assento}`,
    `Classe: ${dados.classe}`,
    `Rota: ${passagem.origem} → ${passagem.destino}`,
    `Data/Hora: ${passagem.dia} às ${passagem.horario}`
  ].join('\n');

  const r = await enviarTxt('passagem.txt', txt);
  if (r.ok) toast('Passagem comprada!', 'sucesso');
  else toast('Passagem registrada localmente.', '');

  // pergunta canal
  perguntarCanal(passagem);
}

function perguntarCanal(passagem) {
  abrirModal({
    titulo: 'Como quer receber o link do servidor?',
    sub: 'Escolha o canal de entrega.',
    corpo: `
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button type="button" class="btn btn--outline btn--sm" data-canal="email" style="flex:1">E-mail</button>
        <button type="button" class="btn btn--outline btn--sm" data-canal="discord" style="flex:1">Discord</button>
      </div>
      <div class="field" id="canal-campo" hidden>
        <label class="field__label" for="canal-input">Destino</label>
        <input class="field__input" type="text" id="canal-input">
      </div>
    `,
    acoes: [
      { texto: 'Agora não', classe: 'btn--outline', onClick: fecharModal },
      { texto: 'Enviar', classe: 'btn--primary', onClick: async () => {
          const canalAtivo = $('[data-canal].btn--primary');
          const canal = canalAtivo ? canalAtivo.dataset.canal : '';
          const destino = $('#canal-input').value.trim();
          if (!canal) { toast('Escolha e-mail ou Discord.', 'erro'); return; }
          if (!destino) { toast('Informe o destino.', 'erro'); return; }
          fecharModal();
          const txt = `Canal: ${canal}\nDestino: ${destino}\nPassagem: ${passagem.id}\nUsuário: ${state.usuario.usuario}\nE-mail: ${state.usuario.email}`;
          await enviarTxt('entrega_passagem.txt', txt);
          toast(`Link será enviado por ${canal}.`, 'sucesso');
        } }
    ]
  });

  const modal = $('#modal');
  modal.addEventListener('click', function handler(e) {
    const b = e.target.closest('[data-canal]');
    if (!b) return;
    $$('[data-canal]', modal).forEach(x => {
      x.classList.toggle('btn--primary', x === b);
      x.classList.toggle('btn--outline', x !== b);
    });
    const campo = $('#canal-campo', modal);
    campo.hidden = false;
    const lbl = $('#canal-input', modal);
    lbl.placeholder = b.dataset.canal === 'email' ? 'seu@email.com' : '@usuario';
    lbl.type = b.dataset.canal === 'email' ? 'email' : 'text';
  });
}

/* ============ Excluir conta ============ */
function excluirConta() {
  abrirModal({
    titulo: 'Excluir conta',
    sub: 'Todos os seus dados serão apagados. Esta ação não pode ser desfeita.',
    corpo: '',
    acoes: [
      { texto: 'Cancelar', classe: 'btn--outline', onClick: fecharModal },
      { texto: 'Excluir', classe: 'btn--danger', onClick: () => {
          const users = carregarUsuarios();
          delete users[state.usuario.usuario];
          salvarUsuarios(users);
          localStorage.removeItem(STORAGE.sessao);
          localStorage.removeItem(STORAGE.carrinho);
          localStorage.removeItem(STORAGE.tema);
          state.usuario = null;
          state.carrinho = [];
          fecharModal();
          toast('Conta excluída.', 'sucesso');
          irPara('landing');
        } }
    ]
  });
}

/* ============ Eventos globais ============ */
function ligarEventos() {
  // Header / drawer
  $('#btn-menu').addEventListener('click', abrirDrawer);
  $('#drawer-overlay').addEventListener('click', fecharDrawer);
  $('#btn-carrinho').addEventListener('click', () => { fecharDrawer(); irPara('carrinho'); });

  $$('.drawer__item').forEach(el => {
    el.addEventListener('click', () => { fecharDrawer(); irPara(el.dataset.nav); });
  });

  // Botões [data-ir]
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir]');
    if (b) { e.preventDefault(); irPara(b.dataset.ir); return; }

    const add = e.target.closest('[data-add-carrinho]');
    if (add) {
      const p = PASSAGENS.find(x => x.id === add.dataset.addCarrinho);
      if (!p) return;
      if (state.carrinho.some(x => x.id === p.id)) { toast('Já está no carrinho.', 'erro'); return; }
      state.carrinho.push(p);
      salvarCarrinho();
      atualizarHeader();
      toast('Adicionado ao carrinho!', 'sucesso');
      return;
    }

    const rem = e.target.closest('[data-remover-carrinho]');
    if (rem) {
      state.carrinho = state.carrinho.filter(x => x.id !== rem.dataset.removerCarrinho);
      salvarCarrinho();
      renderCarrinho();
      return;
    }
  });

  // Formulários
  $('#form-login').addEventListener('submit', fazerLogin);
  $('#form-cadastro').addEventListener('submit', fazerCadastro);
  $('#form-recuperar').addEventListener('submit', fazerRecuperar);
  $('#form-editar').addEventListener('submit', salvarEdicao);
  $('#form-suporte').addEventListener('submit', enviarSuporte);
  $('#form-candidatura').addEventListener('submit', enviarCandidatura);

  // Config
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tema-op]');
    if (t) { aplicarTema(t.dataset.temaOp); }
  });

  $('#btn-logout').addEventListener('click', () => {
    limparSessao();
    state.usuario = null;
    state.carrinho = [];
    toast('Log-out feito.', 'sucesso');
    irPara('landing');
  });

  $('#btn-excluir').addEventListener('click', excluirConta);

  $('#btn-finalizar').addEventListener('click', async () => {
    if (!state.carrinho.length) { toast('Carrinho vazio.', 'erro'); return; }
    // Escolher assento do primeiro item (simplificado: um por vez)
    const p = state.carrinho[0];
    const dados = await escolherAssento(p);
    if (!dados) return;
    await confirmarCompra(p, dados);
    state.carrinho = state.carrinho.filter(x => x.id !== p.id);
    salvarCarrinho();
    atualizarHeader();
    if (state.carrinho.length === 0) irPara('passagens');
    else renderCarrinho();
  });

  // Fechar modal clicando no overlay
  $('#modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('#modal-overlay')) fecharModal();
  });
}

/* ============ Init ============ */
function init() {
  // Tema salvo
  const temaSalvo = localStorage.getItem(STORAGE.tema) || 'branco';
  aplicarTema(temaSalvo);

  // Carrinho salvo
  carregarCarrinho();

  // Sessão salva
  const sessao = carregarSessao();
  if (sessao) {
    const users = carregarUsuarios();
    if (users[sessao]) {
      state.usuario = users[sessao];
      ligarEventos();
      irPara('inicio');
      return;
    } else {
      limparSessao();
    }
  }

  ligarEventos();
  irPara('landing');
}

document.addEventListener('DOMContentLoaded', init);
