import {
  entrar, sair, aoMudarSessao, loginDoEmail, obterUsuario, obterCriterios, salvarCriterios,
  listarUsuarios, salvarUsuario, salvarMonitoria, excluirMonitoria, buscarMonitorias, salvarAgente, salvarSetor
} from './db.js';
import { LOGIN_ADMIN, DOMINIO } from './config.js';
import { CRITERIOS_PADRAO, CANAIS, MONITORES_INICIAIS } from './criterios-padrao.js';
import {
  estado, recarregarCadastros, setorPorId, agentePorId, ordenarPorNome, opcoesSetores, opcoesAgentes,
  opcoesCompetencia, opcoesCanal, seg, nomeAgente, nomeSetor, falha
} from './estado.js';
import { resumir, agruparPor, principaisFalhas } from './analise.js';
import { telaRelatorios } from './relatorio.js';
import { telaImportar } from './importar.js';
import * as U from './util.js';

const { $, esc } = U;
const telaLogin = $('#tela-login'), appEl = $('#app'), carregando = $('#carregando-inicial');
let mensagemLogin = '';

// ======================= LOGIN =======================
function mostrarLogin() {
  carregando.hidden = true;
  appEl.hidden = true;
  telaLogin.hidden = false;
  $('#l-erro').textContent = mensagemLogin;
  mensagemLogin = '';
  $('#l-senha').value = '';
  $('#l-login').focus();
}

$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#form-login button[type="submit"]');
  const login = $('#l-login').value.trim(), senha = $('#l-senha').value;
  const erro = $('#l-erro');
  if (!login || !senha) { erro.textContent = 'Preencha login e senha.'; return; }
  btn.disabled = true;
  erro.textContent = '';
  try {
    await entrar(login, senha);
  } catch (err) {
    const c = err.code || '';
    erro.textContent = c.includes('too-many') ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
      : c.includes('network') ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
      : 'Login ou senha incorretos.';
  } finally {
    btn.disabled = false;
  }
});
$('#btn-sair').addEventListener('click', () => sair());

aoMudarSessao(async user => {
  if (!user) { estado.usuario = null; mostrarLogin(); return; }
  telaLogin.hidden = true;
  carregando.hidden = false;
  carregando.textContent = 'Carregando…';
  try {
    await iniciarSessao(user);
  } catch (err) {
    console.error(err);
    mensagemLogin = (err.message === 'SEM_ACESSO' || err.code === 'permission-denied')
      ? 'Este login não está liberado no sistema. Peça à administradora para cadastrá-lo.'
      : 'Não foi possível carregar o sistema. Tente de novo em instantes.';
    await sair();
  }
});

async function iniciarSessao(user) {
  const email = String(user.email || '').toLowerCase();
  if (!email.endsWith('@' + DOMINIO)) throw new Error('SEM_ACESSO');
  const login = loginDoEmail(email);
  const admin = login === LOGIN_ADMIN;
  if (admin) await prepararBase(login);
  const perfil = await obterUsuario(login);
  if (!admin && (!perfil || perfil.ativo === false)) throw new Error('SEM_ACESSO');
  estado.usuario = { login, nome: perfil?.nome || U.nomeProprio(login.replace(/\./g, ' ')), admin };
  await recarregarCadastros();
  $('#u-nome').textContent = estado.usuario.nome;
  $('#nav-config').hidden = !admin;
  carregando.hidden = true;
  appEl.hidden = false;
  rotear();
}

// No primeiro acesso da administradora: cria monitores e critérios padrão.
async function prepararBase(login) {
  const usuarios = await listarUsuarios();
  if (!usuarios.length) {
    for (const m of MONITORES_INICIAIS) await salvarUsuario(m.login, { ...m, ativo: true });
  } else if (!usuarios.some(u => u.id === login)) {
    const m = MONITORES_INICIAIS.find(x => x.login === login);
    await salvarUsuario(login, { login, nome: m?.nome || login, papel: 'admin', ativo: true });
  }
  for (const canal of Object.keys(CRITERIOS_PADRAO)) {
    if (await obterCriterios(canal) === null) await salvarCriterios(canal, CRITERIOS_PADRAO[canal]);
  }
}

// ======================= NAVEGAÇÃO =======================
const ROTAS = { inicio: telaInicio, nova: telaNova, monitorias: telaMonitorias, relatorios: telaRelatorios, config: telaConfig };

function rotear() {
  let r = location.hash.slice(1) || 'inicio';
  if (!ROTAS[r]) r = 'inicio';
  if (r === 'config' && !estado.usuario.admin) r = 'inicio';
  if (r !== 'nova') estado.edicao = null;
  document.querySelectorAll('.trilho a[data-rota]').forEach(a => {
    if (a.dataset.rota === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const antigo = $('#conteudo');
  const main = antigo.cloneNode(false); // elemento novo, sem eventos da tela anterior
  antigo.replaceWith(main);
  ROTAS[r](main);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if (estado.usuario) rotear(); });
$('.trilho').addEventListener('click', e => {
  const a = e.target.closest('a[data-rota]');
  if (!a) return;
  if (a.dataset.rota === 'nova') estado.edicao = null;
  if (location.hash === a.getAttribute('href')) { e.preventDefault(); rotear(); }
});

const podeEditar = m => estado.usuario.admin || m.monitorLogin === estado.usuario.login;

// ======================= VISÃO GERAL =======================
function telaInicio(main) {
  const comps = U.listaCompetencias(24);
  main.innerHTML = `
    <header class="cab"><h1>Visão geral</h1><p class="sub">Nota média por competência (dia 16 ao dia 15), pela data do atendimento.</p></header>
    <div class="filtros">
      <label>Competência<select id="f-comp">${opcoesCompetencia(comps, comps[0])}</select></label>
      <label>Setor<select id="f-setor"><option value="">Todos os setores</option>${opcoesSetores('', true)}</select></label>
      <label>Canal<select id="f-canal">${opcoesCanal('Chat e ligação')}</select></label>
    </div>
    <div id="painel"><p class="sub">Carregando…</p></div>`;

  const cache = new Map();
  async function atualizar() {
    const comp = $('#f-comp', main).value, setor = $('#f-setor', main).value, canal = $('#f-canal', main).value;
    const painel = $('#painel', main);
    try {
      if (!cache.has(comp)) cache.set(comp, await buscarMonitorias({ compIni: U.deslocarCompetencia(comp, -5), compFim: comp }));
      const todas = cache.get(comp).filter(m => (!setor || m.setorId === setor) && (!canal || m.canal === canal));
      painel.innerHTML = htmlPainel(todas, comp);
    } catch (err) {
      console.error(err);
      painel.innerHTML = '<p class="erro">Não foi possível carregar as monitorias. Atualize a página e tente de novo.</p>';
    }
  }
  main.querySelectorAll('select').forEach(s => s.addEventListener('change', atualizar));
  atualizar();
}

function htmlPainel(todas, comp) {
  const atual = todas.filter(m => m.competencia === comp);
  const comps = Array.from({ length: 6 }, (_, i) => U.deslocarCompetencia(comp, i - 5));
  const evol = comps.map(c => ({ c, ...resumir(todas.filter(m => m.competencia === c)) }));
  const htmlEvol = `<section class="secao"><h2>Evolução da nota média</h2><div class="evolucao">
    ${evol.map(e => `<div><b>${U.fmtNota(e.media)}</b><i style="height:${e.media == null ? 0 : Math.max(2, e.media * 0.75)}%"></i><span>${U.MESES[+e.c.split('-')[1] - 1].slice(0, 3)}/${e.c.slice(2, 4)}</span></div>`).join('')}
  </div></section>`;

  if (!atual.length) {
    return `<div class="vazio">Nenhuma monitoria em ${U.rotuloCompetencia(comp)} com esse filtro. <a href="#nova">Registrar monitoria</a></div>${htmlEvol}`;
  }
  const r = resumir(atual), chat = resumir(atual.filter(m => m.canal === 'chat')), lig = resumir(atual.filter(m => m.canal === 'ligacao'));
  const porAgente = [...agruparPor(atual, m => m.agenteId)]
    .map(([, l]) => ({ nome: nomeAgente(l[0]), ...resumir(l) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const falhas = principaisFalhas(atual, 6);

  return `
    <div class="resumo">
      <div><strong>${r.qtd}</strong><span>Monitorias</span></div>
      <div><strong class="${U.classeNota(r.media)}">${U.fmtNota(r.media)}</strong><span>Nota média</span></div>
      <div><strong>${U.fmtNota(chat.media)}</strong><span>Média em chat (${chat.qtd})</span></div>
      <div><strong>${U.fmtNota(lig.media)}</strong><span>Média em ligação (${lig.qtd})</span></div>
    </div>
    <div class="duas-colunas">
      <section class="secao"><h2>Por agente</h2><div class="tabela-wrap"><table>
        <thead><tr><th>Agente</th><th class="num">Monitorias</th><th class="num">Nota média</th><th></th></tr></thead>
        <tbody>${porAgente.map(a => `<tr><td>${esc(a.nome)}</td><td class="num">${a.qtd}</td><td class="num ${U.classeNota(a.media)}"><strong>${U.fmtNota(a.media)}</strong></td><td><div class="barra"><span style="width:${a.media}%"></span></div></td></tr>`).join('')}</tbody>
      </table></div></section>
      <section class="secao"><h2>Critérios que mais falham</h2>${falhas.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Critério</th><th class="num">Falhas</th><th class="num">% de falha</th></tr></thead>
        <tbody>${falhas.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${c.falhas}</td><td class="num">${U.fmtPct(c.pct)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="vazio">Nenhuma falha registrada.</div>'}</section>
    </div>
    ${htmlEvol}`;
}

// ======================= NOVA / EDITAR MONITORIA =======================
function respostasNovas(canal) {
  return (estado.criterios[canal] || []).filter(c => c.ativo !== false)
    .map(c => ({ id: c.id, nome: c.nome, peso: Number(c.peso) || 0, penaliza: c.penaliza, resposta: '', obs: '' }));
}

function htmlCriterio(r, i) {
  const falhou = U.falhou(r);
  const temObs = r.resposta === 'SIM' || r.resposta === 'NÃO';
  const fatal = Number(r.peso) >= 100;
  const regra = fatal ? `Zera a nota se ${r.penaliza}` : `Desconta ${r.peso} se ${r.penaliza}`;
  const botoes = [['SIM', 'Sim'], ['NÃO', 'Não'], ['NA', 'N/A']].map(([v, t]) =>
    `<button type="button" data-r="${v}" class="${v === r.penaliza ? 'penaliza' : ''}" aria-pressed="${r.resposta === v}"${v === 'NA' ? ' title="Não se aplica"' : ''}>${t}</button>`).join('');
  return `<div class="criterio${falhou ? ' falhou' : ''}" data-i="${i}">
    <div><span class="crit-nome">${esc(r.nome)}</span><span class="crit-peso${fatal ? ' fatal' : ''}">${regra}</span></div>
    <div class="segmentado resposta" role="group" aria-label="${esc(r.nome)}">${botoes}</div>
    ${temObs ? `<textarea class="crit-obs" rows="2" placeholder="Observação sobre este item (opcional)">${esc(r.obs || '')}</textarea>` : ''}
  </div>`;
}

function telaNova(main) {
  const ed = estado.edicao;
  const lembrado = estado.ultimaEscolha || {};
  const f = ed
    ? { canal: ed.canal, setorId: ed.setorId, agenteId: ed.agenteId, data: ed.dataAtendimento || '', tipo: ed.tipo || '',
        contato: U.mascaraDigitacao(ed.contato || ''), protocolo: ed.protocolo || '', obsFinal: ed.obsFinal || '',
        respostas: structuredClone(ed.respostas || []) }
    : { canal: lembrado.canal || '', setorId: lembrado.setorId || '', agenteId: lembrado.agenteId || '', data: '', tipo: '',
        contato: '', protocolo: '', obsFinal: '', respostas: [] };
  if (!ed && f.canal) f.respostas = respostasNovas(f.canal);

  main.innerHTML = `
    <header class="cab"><h1>${ed ? 'Editar monitoria' : 'Nova monitoria'}</h1>
      ${ed ? `<p class="sub">Registrada por ${esc(ed.monitorNome || '—')}${ed.origem === 'importacao' ? ', importada da planilha' : ''}.</p>` : '<p class="sub">Os campos do atendimento e todos os critérios são obrigatórios, assim como a observação final.</p>'}
    </header>
    <div class="grade-monitoria">
      <form id="form-mon" novalidate>
        <section class="bloco"><h2>Atendimento</h2>
          <div class="campo"><span class="rotulo">Canal</span>${seg('canal', [['chat', 'Chat'], ['ligacao', 'Ligação']], f.canal)}</div>
          <div class="linha2">
            <label class="campo">Setor<select id="m-setor"><option value="">Escolha o setor</option>${opcoesSetores(f.setorId)}</select></label>
            <label class="campo">Agente<select id="m-agente"></select></label>
          </div>
          <div class="linha2">
            <label class="campo">Data do atendimento<input type="date" id="m-data" max="${U.hojeISO()}" value="${f.data}"><small id="m-comp"></small></label>
            <div class="campo"><span class="rotulo">Tipo</span>${seg('tipo', [['Ativo', 'Ativo'], ['Receptivo', 'Receptivo']], f.tipo)}</div>
          </div>
          <div class="linha2">
            <label class="campo">Contato do cliente<input id="m-contato" inputmode="tel" autocomplete="off" placeholder="(84) 99999-9999" value="${esc(f.contato)}"></label>
            <label class="campo">Protocolo<input id="m-protocolo" autocomplete="off" value="${esc(f.protocolo)}"></label>
          </div>
        </section>
        <section class="bloco"><h2>Critérios</h2><div id="m-criterios"></div></section>
        <section class="bloco"><h2><label for="m-obs">Observação final</label></h2>
          <textarea id="m-obs" rows="4" placeholder="Resumo do atendimento e orientações para o agente.">${esc(f.obsFinal)}</textarea>
        </section>
      </form>
      <aside class="placar" id="placar" aria-live="polite"></aside>
    </div>`;

  const boxCrit = $('#m-criterios', main), placar = $('#placar', main);

  function preencherAgentes() {
    const sel = $('#m-agente', main);
    if (!f.setorId) { sel.innerHTML = '<option value="">Escolha o setor primeiro</option>'; return; }
    const ops = opcoesAgentes(f.setorId, f.agenteId);
    sel.innerHTML = ops ? `<option value="">Escolha o agente</option>${ops}` : '<option value="">Nenhum agente ativo neste setor</option>';
    if (!agentePorId(f.agenteId) || agentePorId(f.agenteId).setorId !== f.setorId) { if (!ed) f.agenteId = ''; }
    sel.value = f.agenteId;
  }
  function mostrarCompetencia() {
    const c = U.competenciaDeData(f.data);
    $('#m-comp', main).textContent = c ? `Competência ${U.rotuloCompetencia(c)}` : '';
  }
  function desenharCriterios() {
    if (!f.canal) { boxCrit.innerHTML = '<p class="sub">Escolha o canal para ver os critérios.</p>'; }
    else if (!f.respostas.length) { boxCrit.innerHTML = '<p class="erro">Os critérios deste canal ainda não foram configurados. Fale com a administradora.</p>'; }
    else boxCrit.innerHTML = f.respostas.map(htmlCriterio).join('');
    desenharPlacar();
  }
  function desenharPlacar() {
    const respondidos = f.respostas.filter(r => r.resposta).length;
    const { nota } = U.calcularNota(f.respostas);
    const descontos = f.respostas.filter(U.falhou);
    placar.innerHTML = `
      <div class="placar-nota"><span class="placar-num ${f.canal ? U.classeNota(nota) : ''}">${f.canal ? U.fmtNota(nota) : '—'}</span><span class="placar-de">de 100</span></div>
      <p class="sub">${respondidos} de ${f.respostas.length} critérios respondidos</p>
      ${descontos.length
        ? `<ul class="placar-descontos">${descontos.map(r => `<li><span>${esc(r.nome)}</span><span>${Number(r.peso) >= 100 ? 'zera' : `−${r.peso}`}</span></li>`).join('')}</ul>`
        : '<p class="sub">Nenhum desconto até agora.</p>'}
      <button type="button" class="btn primario" id="m-salvar">${ed ? 'Salvar alterações' : 'Salvar monitoria'}</button>
      ${ed ? '<button type="button" class="btn" id="m-cancelar">Cancelar edição</button>' : ''}
      <p class="erro" id="m-erro" role="alert"></p>`;
  }

  preencherAgentes();
  mostrarCompetencia();
  desenharCriterios();

  main.addEventListener('click', async e => {
    const bResp = e.target.closest('.criterio button[data-r]');
    if (bResp) {
      const linha = bResp.closest('.criterio');
      const i = +linha.dataset.i;
      f.respostas[i].resposta = bResp.dataset.r;
      linha.outerHTML = htmlCriterio(f.respostas[i], i);
      if (['SIM', 'NÃO'].includes(f.respostas[i].resposta)) boxCrit.querySelector(`.criterio[data-i="${i}"] .crit-obs`)?.focus();
      desenharPlacar();
      return;
    }
    const bSeg = e.target.closest('.segmentado[data-campo] button');
    if (bSeg) {
      const grupo = bSeg.closest('.segmentado');
      const campo = grupo.dataset.campo, v = bSeg.dataset.v;
      if (campo === 'canal' && v !== f.canal) {
        if (f.respostas.some(r => r.resposta) && !confirm('Trocar o canal apaga as respostas já marcadas. Continuar?')) return;
        f.canal = v;
        f.respostas = respostasNovas(v);
        desenharCriterios();
      } else if (campo === 'tipo') f.tipo = v;
      grupo.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === bSeg));
      return;
    }
    if (e.target.closest('#m-cancelar')) { estado.edicao = null; location.hash = 'monitorias'; return; }
    if (e.target.closest('#m-salvar')) await salvar(e.target.closest('#m-salvar'));
  });

  main.addEventListener('input', e => {
    const t = e.target;
    if (t.classList.contains('crit-obs')) { f.respostas[+t.closest('.criterio').dataset.i].obs = t.value; return; }
    if (t.id === 'm-contato') { t.value = U.mascaraDigitacao(t.value); f.contato = t.value; }
    if (t.id === 'm-protocolo') f.protocolo = t.value;
    if (t.id === 'm-obs') f.obsFinal = t.value;
    if (t.id === 'm-data') { f.data = t.value; mostrarCompetencia(); }
  });
  main.addEventListener('change', e => {
    if (e.target.id === 'm-setor') { f.setorId = e.target.value; f.agenteId = ''; preencherAgentes(); }
    if (e.target.id === 'm-agente') f.agenteId = e.target.value;
    if (e.target.id === 'm-data') { f.data = e.target.value; mostrarCompetencia(); }
  });

  async function salvar(btn) {
    const erro = $('#m-erro', main);
    const faltando =
      !f.canal ? ['Escolha o canal.', null] :
      !f.setorId ? ['Escolha o setor.', '#m-setor'] :
      !f.agenteId ? ['Escolha o agente.', '#m-agente'] :
      !f.data ? ['Informe a data do atendimento.', '#m-data'] :
      f.data > U.hojeISO() ? ['A data do atendimento não pode ser futura.', '#m-data'] :
      !f.tipo ? ['Marque se o atendimento foi ativo ou receptivo.', null] :
      !f.respostas.length ? ['Não há critérios configurados para este canal.', null] :
      f.respostas.some(r => !r.resposta) ? [`Responda o critério "${f.respostas.find(r => !r.resposta).nome}".`, null] :
      !f.obsFinal.trim() ? ['Escreva a observação final.', '#m-obs'] : null;
    if (faltando) {
      erro.textContent = faltando[0];
      if (faltando[1]) $(faltando[1], main).focus();
      else if (f.respostas.some(r => !r.resposta) && f.canal) {
        boxCrit.querySelector(`.criterio[data-i="${f.respostas.findIndex(r => !r.resposta)}"]`)?.scrollIntoView({ block: 'center' });
      }
      return;
    }
    const setor = setorPorId(f.setorId), agente = agentePorId(f.agenteId);
    const respostas = f.respostas.map(r => ({ ...r, obs: ['SIM', 'NÃO'].includes(r.resposta) ? String(r.obs || '').trim() : '' }));
    const { desconto, nota } = U.calcularNota(respostas);
    const dados = {
      canal: f.canal,
      setorId: f.setorId, setorNome: setor?.nome || ed?.setorNome || '',
      agenteId: f.agenteId, agenteNome: agente?.nome || ed?.agenteNome || '',
      dataAtendimento: f.data, competencia: U.competenciaDeData(f.data), tipo: f.tipo,
      contato: U.apenasDigitos(f.contato), protocolo: f.protocolo.trim(),
      respostas, desconto, nota, obsFinal: f.obsFinal.trim()
    };
    if (!ed) Object.assign(dados, { monitorLogin: estado.usuario.login, monitorNome: estado.usuario.nome, origem: 'sistema' });

    btn.disabled = true;
    erro.textContent = '';
    try {
      await salvarMonitoria(ed?.id || null, dados);
      if (ed) {
        estado.edicao = null;
        U.aviso(`Alterações salvas. Nota ${U.fmtNota(nota)}.`);
        location.hash = 'monitorias';
      } else {
        estado.ultimaEscolha = { canal: f.canal, setorId: f.setorId, agenteId: f.agenteId };
        U.aviso(`Monitoria salva. Nota ${U.fmtNota(nota)}.`);
        rotear();
      }
    } catch (err) {
      falha(err);
      btn.disabled = false;
    }
  }
}

// ======================= LISTA DE MONITORIAS =======================
function telaMonitorias(main) {
  const comps = U.listaCompetencias(24);
  main.innerHTML = `
    <header class="cab"><h1>Monitorias</h1><p class="sub">Clique em uma linha para ver o detalhe.</p></header>
    <div class="filtros">
      <label>Competência<select id="f-comp"><option value="">Todas</option>${opcoesCompetencia(comps, comps[0])}</select></label>
      <label>Canal<select id="f-canal">${opcoesCanal('Todos')}</select></label>
      <label>Setor<select id="f-setor"><option value="">Todos</option>${opcoesSetores('', true)}</select></label>
      <label>Agente<select id="f-agente"></select></label>
      <label>Buscar<input id="f-busca" type="search" placeholder="Protocolo, contato ou agente"></label>
      <button class="btn" id="f-exportar" type="button">Exportar lista (CSV)</button>
    </div>
    <p id="contagem" class="sub"></p>
    <div id="lista"><p class="sub">Carregando…</p></div>`;

  let dados = [], visiveis = [];
  const preencherAgentes = () => {
    const s = $('#f-setor', main).value;
    $('#f-agente', main).innerHTML = `<option value="">Todos</option>${opcoesAgentes(s, '', true)}`;
  };

  async function carregar() {
    const comp = $('#f-comp', main).value;
    $('#lista', main).innerHTML = '<p class="sub">Carregando…</p>';
    try {
      dados = await buscarMonitorias(comp ? { compIni: comp, compFim: comp } : {});
      dados.sort((a, b) => (b.dataAtendimento || '').localeCompare(a.dataAtendimento || ''));
      filtrar();
    } catch (err) {
      console.error(err);
      $('#lista', main).innerHTML = '<p class="erro">Não foi possível carregar as monitorias. Atualize a página e tente de novo.</p>';
    }
  }

  function filtrar() {
    const canal = $('#f-canal', main).value, setor = $('#f-setor', main).value, agente = $('#f-agente', main).value;
    const busca = U.norm($('#f-busca', main).value), buscaDig = U.apenasDigitos(busca);
    visiveis = dados.filter(m =>
      (!canal || m.canal === canal) && (!setor || m.setorId === setor) && (!agente || m.agenteId === agente) &&
      (!busca || U.norm(m.protocolo).includes(busca) || U.norm(nomeAgente(m)).includes(busca) || (buscaDig.length >= 4 && U.apenasDigitos(m.contato).includes(buscaDig))));
    const r = resumir(visiveis);
    $('#contagem', main).textContent = visiveis.length
      ? `${visiveis.length} ${visiveis.length === 1 ? 'monitoria' : 'monitorias'}, nota média ${U.fmtNota(r.media)}.` : '';
    $('#lista', main).innerHTML = visiveis.length ? `<div class="tabela-wrap"><table>
      <thead><tr><th>Atendimento</th><th>Agente</th><th>Canal</th><th>Tipo</th><th>Protocolo</th><th class="num">Nota</th><th>Monitor</th><th></th></tr></thead>
      <tbody>${visiveis.map(m => `<tr class="clicavel" data-id="${esc(m.id)}">
        <td>${U.dataBR(m.dataAtendimento) || '—'}<br><small class="sub">${U.rotuloCompetencia(m.competencia)}</small></td>
        <td>${esc(nomeAgente(m))}<br><small class="sub">${esc(nomeSetor(m))}</small></td>
        <td>${CANAIS[m.canal] || '—'}</td><td>${esc(m.tipo || '—')}</td><td>${esc(m.protocolo || '—')}</td>
        <td class="num ${U.classeNota(m.nota)}"><strong>${U.fmtNota(m.nota)}</strong></td>
        <td>${esc(m.monitorNome || '—')}</td>
        <td class="acoes">${podeEditar(m) ? `<button class="btn pequeno" data-acao="editar" type="button">Editar</button> <button class="btn pequeno perigo" data-acao="excluir" type="button">Excluir</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>`
      : '<div class="vazio">Nenhuma monitoria encontrada com esses filtros.</div>';
  }

  main.addEventListener('change', e => {
    if (e.target.id === 'f-comp') return carregar();
    if (e.target.id === 'f-setor') preencherAgentes();
    if (e.target.matches('select')) filtrar();
  });
  main.addEventListener('input', e => { if (e.target.id === 'f-busca') filtrar(); });
  main.addEventListener('click', async e => {
    if (e.target.closest('#f-exportar')) return exportarLista(visiveis);
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const m = dados.find(x => x.id === tr.dataset.id);
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'editar') return editar(m);
    if (acao === 'excluir') {
      if (!confirm(`Excluir a monitoria de ${nomeAgente(m)} do atendimento de ${U.dataBR(m.dataAtendimento) || 'data não informada'}? Essa ação não pode ser desfeita.`)) return;
      try {
        await excluirMonitoria(m.id);
        dados = dados.filter(x => x.id !== m.id);
        filtrar();
        U.aviso('Monitoria excluída.');
      } catch (err) { falha(err); }
      return;
    }
    abrirDetalhe(m);
  });

  preencherAgentes();
  carregar();
}

function editar(m) {
  estado.edicao = m;
  if (location.hash === '#nova') rotear(); else location.hash = 'nova';
}

function abrirDetalhe(m) {
  const d = $('#dialogo');
  const textoResp = r => r.resposta === 'NA' ? 'Não se aplica' : r.resposta === 'SIM' ? 'Sim' : r.resposta === 'NÃO' ? 'Não' : '—';
  d.innerHTML = `<div class="dialogo-corpo">
      <h2>${esc(nomeAgente(m))}</h2>
      <dl class="dados">
        <div><dt>Nota</dt><dd class="${U.classeNota(m.nota)}">${U.fmtNota(m.nota)}</dd></div>
        <div><dt>Setor</dt><dd>${esc(nomeSetor(m))}</dd></div>
        <div><dt>Canal</dt><dd>${CANAIS[m.canal] || '—'}</dd></div>
        <div><dt>Data do atendimento</dt><dd>${U.dataBR(m.dataAtendimento) || '—'}</dd></div>
        <div><dt>Competência</dt><dd>${U.rotuloCompetencia(m.competencia)}</dd></div>
        <div><dt>Tipo</dt><dd>${esc(m.tipo || '—')}</dd></div>
        <div><dt>Contato</dt><dd>${U.formatarTelefone(m.contato)}</dd></div>
        <div><dt>Protocolo</dt><dd>${esc(m.protocolo || '—')}</dd></div>
        <div><dt>Monitor</dt><dd>${esc(m.monitorNome || '—')}</dd></div>
      </dl>
      ${m.linkOriginal ? `<p class="sub">Registro original da planilha: ${esc(m.linkOriginal)}</p>` : ''}
      <h3>Critérios</h3>
      <ul class="lista-respostas">${(m.respostas || []).map(r => `<li class="${U.falhou(r) ? 'falhou' : ''}">
        <span>${esc(r.nome)}</span><strong>${textoResp(r)}</strong>
        ${r.obs ? `<span class="obs">${esc(r.obs)}</span>` : ''}</li>`).join('')}</ul>
      <h3>Observação final</h3>
      <p class="texto">${esc(m.obsFinal || '—')}</p>
    </div>
    <div class="dialogo-rodape">
      ${podeEditar(m) ? '<button class="btn" data-acao="editar" type="button">Editar</button>' : ''}
      <button class="btn primario" data-acao="fechar" type="button">Fechar</button>
    </div>`;
  d.onclick = e => {
    if (e.target === d) return d.close();
    const a = e.target.closest('[data-acao]')?.dataset.acao;
    if (a === 'fechar') d.close();
    if (a === 'editar') { d.close(); editar(m); }
  };
  d.showModal();
}

function exportarLista(lista) {
  if (!lista.length) return U.aviso('Não há monitorias na lista para exportar.', 'erro');
  const admin = estado.usuario.admin;
  const linhas = [['Competência', 'Data do atendimento', 'Canal', 'Tipo', 'Setor', 'Agente', 'Contato', 'Protocolo', 'Nota', 'Itens negativos', 'Observação final', 'Monitor']];
  for (const m of lista) {
    linhas.push([
      U.rotuloCompetencia(m.competencia), U.dataBR(m.dataAtendimento), CANAIS[m.canal] || '', m.tipo || '',
      nomeSetor(m), nomeAgente(m), admin ? U.formatarTelefone(m.contato) : U.mascararTelefone(m.contato),
      m.protocolo || '', U.numBR(m.nota), (m.respostas || []).filter(U.falhou).map(r => r.nome).join(' | '),
      m.obsFinal || '', m.monitorNome || ''
    ]);
  }
  U.baixarCSV(`monitorias-${U.hojeISO()}.csv`, linhas);
}

// ======================= CONFIGURAÇÕES =======================
function telaConfig(main) {
  const abas = [['criterios', 'Critérios e pesos'], ['agentes', 'Agentes'], ['setores', 'Setores'], ['monitores', 'Monitores'], ['importar', 'Importar histórico']];
  main.innerHTML = `
    <header class="cab"><h1>Configurações</h1><p class="sub">Somente a administradora vê esta área.</p></header>
    <div class="abas" role="tablist">${abas.map(([k, t], i) => `<button role="tab" type="button" data-aba="${k}" aria-selected="${i === 0}">${t}</button>`).join('')}</div>
    <div id="aba"></div>`;
  const telas = { criterios: cfgCriterios, agentes: cfgAgentes, setores: cfgSetores, monitores: cfgMonitores, importar: telaImportar };
  const abrir = k => {
    main.querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === k));
    const antigo = $('#aba', main);
    const box = antigo.cloneNode(false);
    antigo.replaceWith(box);
    telas[k](box);
  };
  main.querySelector('.abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) abrir(b.dataset.aba); });
  abrir('criterios');
}

function cfgCriterios(box) {
  let canal = 'chat', itens = [];
  const carregar = () => { itens = structuredClone(estado.criterios[canal] || []); desenhar(); };
  function desenhar() {
    box.innerHTML = `
      <div class="form-linha">${seg('canal-cfg', [['chat', 'Chat'], ['ligacao', 'Ligação']], canal)}</div>
      <p class="dica">As alterações valem para as próximas monitorias. As já registradas mantêm os critérios e pesos com que foram feitas. Peso 100 ou mais zera a nota.</p>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Ordem</th><th>Critério</th><th>Desconta quando</th><th class="num">Peso</th><th>Ativo</th><th></th></tr></thead>
        <tbody>${itens.map((c, i) => `<tr data-i="${i}">
          <td class="ordem"><button type="button" class="btn pequeno" data-acao="subir" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button type="button" class="btn pequeno" data-acao="descer" ${i === itens.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button></td>
          <td><input data-c="nome" value="${esc(c.nome)}" aria-label="Nome do critério"></td>
          <td><select data-c="penaliza" aria-label="Desconta quando"><option value="NÃO"${c.penaliza === 'NÃO' ? ' selected' : ''}>NÃO</option><option value="SIM"${c.penaliza === 'SIM' ? ' selected' : ''}>SIM</option></select></td>
          <td class="num"><input type="number" min="0" step="1" data-c="peso" value="${c.peso}" aria-label="Peso"></td>
          <td><input type="checkbox" data-c="ativo"${c.ativo !== false ? ' checked' : ''} aria-label="Ativo"></td>
          <td><button type="button" class="btn pequeno perigo" data-acao="remover">Remover</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="form-linha espaco-topo">
        <button type="button" class="btn" data-acao="adicionar">Adicionar critério</button>
        <button type="button" class="btn primario" data-acao="salvar">Salvar critérios de ${CANAIS[canal].toLowerCase()}</button>
      </div>`;
  }
  box.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const c = itens[+tr.dataset.i], k = e.target.dataset.c;
    if (k === 'ativo') c.ativo = e.target.checked;
    else if (k === 'peso') c.peso = Number(e.target.value);
    else if (k) c[k] = e.target.value;
  });
  box.addEventListener('click', async e => {
    const bSeg = e.target.closest('[data-campo="canal-cfg"] button');
    if (bSeg) { canal = bSeg.dataset.v; carregar(); return; }
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (!acao) return;
    const tr = e.target.closest('tr[data-i]');
    const i = tr ? +tr.dataset.i : -1;
    if (acao === 'subir' && i > 0) { [itens[i - 1], itens[i]] = [itens[i], itens[i - 1]]; desenhar(); }
    if (acao === 'descer' && i < itens.length - 1) { [itens[i + 1], itens[i]] = [itens[i], itens[i + 1]]; desenhar(); }
    if (acao === 'remover' && confirm(`Remover o critério "${itens[i].nome || 'sem nome'}"? As monitorias já registradas não mudam.`)) { itens.splice(i, 1); desenhar(); }
    if (acao === 'adicionar') {
      itens.push({ id: '', nome: '', penaliza: 'NÃO', peso: 0, ativo: true });
      desenhar();
      box.querySelector(`tr[data-i="${itens.length - 1}"] input[data-c="nome"]`).focus();
    }
    if (acao === 'salvar') {
      const vazio = itens.findIndex(c => !String(c.nome).trim());
      if (vazio >= 0) return U.aviso(`O critério da linha ${vazio + 1} está sem nome.`, 'erro');
      const pesoRuim = itens.find(c => !Number.isFinite(c.peso) || c.peso < 0);
      if (pesoRuim) return U.aviso(`O peso de "${pesoRuim.nome}" precisa ser um número igual ou maior que zero.`, 'erro');
      const ids = new Set();
      for (const c of itens) {
        c.nome = String(c.nome).trim();
        if (!c.id || ids.has(c.id)) {
          const base = U.slug(c.nome);
          let id = base, n = 2;
          while (ids.has(id) || itens.some(o => o !== c && o.id === id)) id = `${base}-${n++}`;
          c.id = id;
        }
        ids.add(c.id);
      }
      try {
        await salvarCriterios(canal, itens);
        estado.criterios[canal] = structuredClone(itens);
        U.aviso('Critérios salvos.');
      } catch (err) { falha(err); }
    }
  });
  carregar();
}

function cfgAgentes(box) {
  function desenhar() {
    box.innerHTML = `
      <form class="form-linha" id="novo-agente">
        <label>Nome do agente<input name="nome" required autocomplete="off"></label>
        <label>Setor<select name="setor" required><option value="">Escolha o setor</option>${opcoesSetores()}</select></label>
        <button class="btn primario" type="submit">Adicionar agente</button>
      </form>
      <p class="dica">Agentes inativos não aparecem para novas monitorias, mas continuam no histórico e nos relatórios.</p>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Agente</th><th>Setor</th><th>Ativo</th></tr></thead>
        <tbody>${estado.agentes.map(a => `<tr data-id="${esc(a.id)}">
          <td><input data-c="nome" value="${esc(a.nome)}" aria-label="Nome do agente"></td>
          <td><select data-c="setorId" aria-label="Setor">${opcoesSetores(a.setorId, true)}</select></td>
          <td><input type="checkbox" data-c="ativo"${a.ativo !== false ? ' checked' : ''} aria-label="Ativo"></td>
        </tr>`).join('') || '<tr><td colspan="3">Nenhum agente cadastrado.</td></tr>'}</tbody>
      </table></div>`;
  }
  box.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const nome = String(fd.get('nome') || '').trim().replace(/\s+/g, ' '), setorId = String(fd.get('setor') || '');
    if (!nome || !setorId) return U.aviso('Informe o nome e o setor.', 'erro');
    const id = U.slug(nome);
    if (agentePorId(id)) return U.aviso('Já existe um agente com esse nome.', 'erro');
    try {
      await salvarAgente(id, { nome, setorId, ativo: true });
      estado.agentes = ordenarPorNome([...estado.agentes, { id, nome, setorId, ativo: true }]);
      U.aviso('Agente adicionado.');
      desenhar();
    } catch (err) { falha(err); }
  });
  box.addEventListener('change', async e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const a = agentePorId(tr.dataset.id), k = e.target.dataset.c;
    const v = k === 'ativo' ? e.target.checked : e.target.value.trim();
    if (k === 'nome' && !v) { e.target.value = a.nome; return; }
    try {
      await salvarAgente(a.id, { [k]: v });
      a[k] = v;
      if (k === 'nome') estado.agentes = ordenarPorNome(estado.agentes);
      U.aviso('Agente atualizado.');
    } catch (err) { falha(err); }
  });
  desenhar();
}

function cfgSetores(box) {
  function desenhar() {
    box.innerHTML = `
      <form class="form-linha" id="novo-setor">
        <label>Nome do setor<input name="nome" required autocomplete="off"></label>
        <button class="btn primario" type="submit">Adicionar setor</button>
      </form>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Setor</th><th>Ativo</th></tr></thead>
        <tbody>${estado.setores.map(s => `<tr data-id="${esc(s.id)}">
          <td><input data-c="nome" value="${esc(s.nome)}" aria-label="Nome do setor"></td>
          <td><input type="checkbox" data-c="ativo"${s.ativo !== false ? ' checked' : ''} aria-label="Ativo"></td>
        </tr>`).join('') || '<tr><td colspan="2">Nenhum setor cadastrado.</td></tr>'}</tbody>
      </table></div>`;
  }
  box.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = String(new FormData(e.target).get('nome') || '').trim().replace(/\s+/g, ' ');
    if (!nome) return;
    const id = U.slug(nome);
    if (setorPorId(id)) return U.aviso('Já existe um setor com esse nome.', 'erro');
    try {
      await salvarSetor(id, { nome, ativo: true });
      estado.setores = ordenarPorNome([...estado.setores, { id, nome, ativo: true }]);
      U.aviso('Setor adicionado.');
      desenhar();
    } catch (err) { falha(err); }
  });
  box.addEventListener('change', async e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const s = setorPorId(tr.dataset.id), k = e.target.dataset.c;
    const v = k === 'ativo' ? e.target.checked : e.target.value.trim();
    if (k === 'nome' && !v) { e.target.value = s.nome; return; }
    try {
      await salvarSetor(s.id, { [k]: v });
      s[k] = v;
      if (k === 'nome') estado.setores = ordenarPorNome(estado.setores);
      U.aviso('Setor atualizado.');
    } catch (err) { falha(err); }
  });
  desenhar();
}

function cfgMonitores(box) {
  function desenhar() {
    box.innerHTML = `
      <form class="form-linha" id="novo-monitor">
        <label>Nome<input name="nome" required autocomplete="off"></label>
        <label>Login<input name="login" required autocomplete="off" placeholder="nome.sobrenome"></label>
        <button class="btn primario" type="submit">Adicionar monitor</button>
      </form>
      <p class="dica">Depois de adicionar aqui, crie o acesso no Firebase (Authentication &gt; Usuários &gt; Adicionar usuário) com o e-mail <strong>login@${DOMINIO}</strong> e uma senha inicial. Para tirar o acesso de alguém, desmarque Ativo.</p>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Nome</th><th>Login</th><th>Função</th><th>Ativo</th></tr></thead>
        <tbody>${estado.usuarios.map(u => `<tr data-id="${esc(u.id)}">
          <td><input data-c="nome" value="${esc(u.nome)}" aria-label="Nome"></td>
          <td>${esc(u.login || u.id)}</td>
          <td>${u.id === LOGIN_ADMIN ? 'Administradora' : 'Monitor'}</td>
          <td><input type="checkbox" data-c="ativo"${u.ativo !== false ? ' checked' : ''}${u.id === LOGIN_ADMIN ? ' disabled' : ''} aria-label="Ativo"></td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }
  box.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const nome = String(fd.get('nome') || '').trim().replace(/\s+/g, ' ');
    const login = String(fd.get('login') || '').trim().toLowerCase();
    if (!nome || !login) return U.aviso('Informe nome e login.', 'erro');
    if (!/^[a-z0-9._-]+$/.test(login)) return U.aviso('O login só pode ter letras sem acento, números, ponto, hífen e sublinhado.', 'erro');
    if (estado.usuarios.some(u => u.id === login)) return U.aviso('Esse login já está cadastrado.', 'erro');
    try {
      const dados = { login, nome, papel: 'monitor', ativo: true };
      await salvarUsuario(login, dados);
      estado.usuarios = ordenarPorNome([...estado.usuarios, { id: login, ...dados }]);
      U.aviso('Monitor adicionado. Agora crie o acesso no Firebase.');
      desenhar();
    } catch (err) { falha(err); }
  });
  box.addEventListener('change', async e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const u = estado.usuarios.find(x => x.id === tr.dataset.id), k = e.target.dataset.c;
    const v = k === 'ativo' ? e.target.checked : e.target.value.trim();
    if (k === 'nome' && !v) { e.target.value = u.nome; return; }
    try {
      await salvarUsuario(u.id, { [k]: v });
      u[k] = v;
      U.aviso('Monitor atualizado.');
    } catch (err) { falha(err); }
  });
  desenhar();
}
