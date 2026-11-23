import { buscarMonitorias } from './db.js';
import { EMPRESA } from './config.js';
import { estado, opcoesSetores, opcoesAgentes, opcoesCompetencia, opcoesCanal, seg, nomeAgente, agentePorId, setorPorId, falha } from './estado.js';
import { CANAIS } from './criterios-padrao.js';
import { resumir, agruparPor, agregarCriterios, principaisFalhas } from './analise.js';
import * as U from './util.js';

const { $, esc } = U;

export function telaRelatorios(main) {
  const comps = U.listaCompetencias(24);
  const f = { tipo: 'agente', periodo: 'competencia' };
  let ultimo = null;

  main.innerHTML = `
    <header class="cab"><h1>Relatórios</h1><p class="sub">Relatório de feedback para entregar ao gestor do setor.</p></header>
    <section class="bloco filtros-relatorio">
      <div class="form-linha">${seg('tipo', [['agente', 'Por agente'], ['setor', 'Setor inteiro']], 'agente')}</div>
      <div class="filtros">
        <label>Setor<select id="r-setor"><option value="">Escolha o setor</option>${opcoesSetores('', true)}</select></label>
        <label id="r-agente-rot">Agente<select id="r-agente"><option value="">Escolha o setor primeiro</option></select></label>
        <label>Canal<select id="r-canal">${opcoesCanal('Chat e ligação')}</select></label>
      </div>
      <div class="form-linha">${seg('periodo', [['competencia', 'Competência'], ['intervalo', 'Intervalo de datas']], 'competencia')}</div>
      <div class="filtros">
        <label id="r-comp-rot">Competência<select id="r-comp">${opcoesCompetencia(comps, U.deslocarCompetencia(U.competenciaAtual(), -1))}</select></label>
        <label id="r-ini-rot" hidden>Atendimentos de<input type="date" id="r-ini"></label>
        <label id="r-fim-rot" hidden>até<input type="date" id="r-fim"></label>
        <label class="checkbox"><input type="checkbox" id="r-detalhe" checked> Incluir o detalhe de cada monitoria</label>
      </div>
      <button class="btn primario" id="r-gerar" type="button">Gerar relatório</button>
      <p class="erro" id="r-erro" role="alert"></p>
    </section>
    <div class="acoes-relatorio" id="r-acoes" hidden>
      <button class="btn primario" id="r-pdf" type="button">Salvar em PDF</button>
      <button class="btn" id="r-csv" type="button">Exportar resumo (CSV)</button>
    </div>
    <div id="r-saida"></div>`;

  const atualizarAgentes = () => {
    const setorId = $('#r-setor', main).value;
    $('#r-agente', main).innerHTML = setorId
      ? `<option value="">Escolha o agente</option>${opcoesAgentes(setorId, '', true)}`
      : '<option value="">Escolha o setor primeiro</option>';
  };
  $('#r-setor', main).addEventListener('change', atualizarAgentes);

  main.addEventListener('click', e => {
    const b = e.target.closest('.segmentado button');
    if (b) {
      const grupo = b.closest('.segmentado');
      const campo = grupo.dataset.campo;
      f[campo] = b.dataset.v;
      grupo.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      if (campo === 'tipo') {
        $('#r-agente-rot', main).hidden = f.tipo === 'setor';
        $('#r-detalhe', main).checked = f.tipo === 'agente';
      }
      if (campo === 'periodo') {
        const intervalo = f.periodo === 'intervalo';
        $('#r-comp-rot', main).hidden = intervalo;
        $('#r-ini-rot', main).hidden = !intervalo;
        $('#r-fim-rot', main).hidden = !intervalo;
      }
      return;
    }
    if (e.target.closest('#r-gerar')) gerar();
    if (e.target.closest('#r-pdf')) salvarPDF();
    if (e.target.closest('#r-csv')) exportarCSV();
  });

  async function gerar() {
    const erro = $('#r-erro', main), saida = $('#r-saida', main), acoes = $('#r-acoes', main), btn = $('#r-gerar', main);
    const setorId = $('#r-setor', main).value, agenteId = $('#r-agente', main).value, canal = $('#r-canal', main).value;
    erro.textContent = '';
    if (!setorId) { erro.textContent = 'Escolha o setor.'; return; }
    if (f.tipo === 'agente' && !agenteId) { erro.textContent = 'Escolha o agente.'; return; }

    let filtro, periodoTxt, periodoCurto;
    if (f.periodo === 'competencia') {
      const c = $('#r-comp', main).value;
      const { inicio, fim } = U.intervaloCompetencia(c);
      filtro = { compIni: c, compFim: c };
      periodoTxt = `Competência ${U.rotuloCompetencia(c)} (atendimentos de ${U.dataBR(inicio)} a ${U.dataBR(fim)})`;
      periodoCurto = U.rotuloCompetencia(c);
    } else {
      const ini = $('#r-ini', main).value, fim = $('#r-fim', main).value;
      if (!ini || !fim) { erro.textContent = 'Informe as duas datas do intervalo.'; return; }
      if (ini > fim) { erro.textContent = 'A data inicial é depois da data final.'; return; }
      filtro = { dataIni: ini, dataFim: fim };
      periodoTxt = `Atendimentos de ${U.dataBR(ini)} a ${U.dataBR(fim)}`;
      periodoCurto = `${U.dataBR(ini)} a ${U.dataBR(fim)}`;
    }

    btn.disabled = true;
    saida.innerHTML = '<p class="sub">Gerando…</p>';
    acoes.hidden = true;
    try {
      const todas = await buscarMonitorias(filtro);
      const lista = todas
        .filter(m => m.setorId === setorId && (!canal || m.canal === canal) && (f.tipo === 'setor' || m.agenteId === agenteId))
        .sort((a, b) => (a.dataAtendimento || '').localeCompare(b.dataAtendimento || ''));
      const ctx = {
        setor: setorPorId(setorId)?.nome || '—',
        agente: agentePorId(agenteId)?.nome || '',
        canal, periodoTxt, periodoCurto,
        detalhe: $('#r-detalhe', main).checked
      };
      if (!lista.length) {
        saida.innerHTML = '<div class="vazio">Nenhuma monitoria encontrada para esse filtro.</div>';
        ultimo = null;
        return;
      }
      saida.innerHTML = f.tipo === 'agente' ? htmlAgente(lista, ctx) : htmlSetor(lista, ctx);
      ultimo = { lista, ctx, tipo: f.tipo };
      acoes.hidden = false;
    } catch (err) {
      falha(err);
      saida.innerHTML = '';
    } finally {
      btn.disabled = false;
    }
  }

  function salvarPDF() {
    if (!ultimo) return;
    const titulo = document.title;
    const quem = ultimo.tipo === 'agente' ? ultimo.ctx.agente : ultimo.ctx.setor;
    document.title = `Monitoria - ${quem} - ${ultimo.ctx.periodoCurto}`.replace(/[\\/:]/g, '-');
    window.addEventListener('afterprint', () => { document.title = titulo; }, { once: true });
    window.print();
  }

  function exportarCSV() {
    if (!ultimo) return;
    const { lista, ctx, tipo } = ultimo;
    const linhas = [['Período', 'Setor', 'Agente', 'Canal', 'Monitorias', 'Nota média']];
    const grupos = tipo === 'agente'
      ? [[ctx.agente, lista]]
      : [...agruparPor(lista, m => m.agenteId)].map(([, l]) => [nomeAgente(l[0]), l]).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    for (const [nome, l] of grupos) {
      for (const c of ['chat', 'ligacao']) {
        const lc = l.filter(m => m.canal === c);
        if (lc.length) linhas.push([ctx.periodoCurto, ctx.setor, nome, CANAIS[c], lc.length, U.numBR(resumir(lc).media)]);
      }
      if (!ctx.canal) linhas.push([ctx.periodoCurto, ctx.setor, nome, 'Total', l.length, U.numBR(resumir(l).media)]);
    }
    U.baixarCSV(`monitoria-${U.slug(ctx.setor)}-${U.slug(ctx.periodoCurto)}.csv`, linhas);
  }
}

// ---------- Montagem do documento ----------
const rotCanal = c => c ? CANAIS[c] : 'Chat e ligação';
const emitido = () => `${U.dataBR(U.hojeISO())}, por ${estado.usuario.nome}`;

function cabecalho(titulo, itens) {
  return `<header class="rel-cab">
    <div class="rel-marca"><img src="img/logo-cor.png" alt="${esc(EMPRESA)}"><span>Monitoria de qualidade</span></div>
    <h1>${titulo}</h1>
    <dl class="dados rel-meta">${itens.map(([t, v, largo]) => `<div${largo ? ' class="largo"' : ''}><dt>${t}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  </header>`;
}

function destaque(lista, canal) {
  const r = resumir(lista);
  let h = `<div class="rel-destaque">
    <div><strong class="${U.classeNota(r.media)}">${U.fmtNota(r.media)}</strong><span>Nota média</span></div>
    <div><strong>${r.qtd}</strong><span>${r.qtd === 1 ? 'Monitoria' : 'Monitorias'}</span></div>`;
  if (!canal) {
    for (const c of ['chat', 'ligacao']) {
      const rc = resumir(lista.filter(m => m.canal === c));
      if (rc.qtd) h += `<div><strong>${U.fmtNota(rc.media)}</strong><span>Média em ${CANAIS[c].toLowerCase()} (${rc.qtd})</span></div>`;
    }
  }
  return h + '</div>';
}

function tabelaFalhas(lista) {
  const falhas = principaisFalhas(lista);
  if (!falhas.length) return '<p>Nenhuma falha registrada no período.</p>';
  return `<table><thead><tr><th>Critério</th><th class="num">Avaliações</th><th class="num">Falhas</th><th class="num">% de falha</th></tr></thead><tbody>` +
    falhas.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${c.avaliados}</td><td class="num">${c.falhas}</td><td class="num">${U.fmtPct(c.pct)}</td></tr>`).join('') +
    `</tbody></table>`;
}

function pontosFortes(lista) {
  const fortes = agregarCriterios(lista).filter(c => c.avaliados > 0 && c.falhas === 0).map(c => esc(c.nome));
  return fortes.length
    ? `<p>Critérios atendidos em todas as monitorias em que foram avaliados: ${fortes.join(', ')}.</p>`
    : '<p>Nenhum critério foi atendido em todas as monitorias do período.</p>';
}

function blocoMonitoria(m) {
  const negativos = (m.respostas || []).filter(U.falhou);
  const info = [
    CANAIS[m.canal] || '',
    m.tipo || '',
    `contato ${U.mascararTelefone(m.contato)}`,
    m.protocolo ? `protocolo ${esc(m.protocolo)}` : '',
    `monitor ${esc(m.monitorNome || '—')}`
  ].filter(Boolean).join(', ');
  return `<div class="rel-mon">
    <header><strong>Atendimento de ${U.dataBR(m.dataAtendimento) || 'data não informada'}</strong><strong class="${U.classeNota(m.nota)}">Nota ${U.fmtNota(m.nota)}</strong></header>
    <p class="info">${info}</p>
    ${negativos.length
      ? `<ul>${negativos.map(r => `<li><strong>${esc(r.nome)}</strong>${r.obs ? `: ${esc(r.obs)}` : ''}</li>`).join('')}</ul>`
      : '<p class="info">Nenhum item negativo.</p>'}
    <p class="obs-final"><strong>Observação final:</strong> ${esc(m.obsFinal || '—')}</p>
  </div>`;
}

const rodape = '<p class="rel-rodape">A nota de cada monitoria é 100 menos a soma dos pesos dos itens não atendidos. A nota média é a média simples das monitorias do período. Telefones exibidos parcialmente.</p>';

function htmlAgente(lista, ctx) {
  return `<article class="rel">
    ${cabecalho('Relatório de feedback do agente', [['Agente', ctx.agente], ['Setor', ctx.setor], ['Canal', rotCanal(ctx.canal)], ['Período', ctx.periodoTxt, true], ['Emitido em', emitido()]])}
    <section><h2>Resultado</h2>${destaque(lista, ctx.canal)}</section>
    <section><h2>Pontos de atenção</h2>${tabelaFalhas(lista)}</section>
    <section><h2>Pontos fortes</h2>${pontosFortes(lista)}</section>
    ${ctx.detalhe ? `<section><h2>Monitorias do período</h2>${lista.map(blocoMonitoria).join('')}</section>` : ''}
    ${rodape}
  </article>`;
}

function htmlSetor(lista, ctx) {
  const grupos = [...agruparPor(lista, m => m.agenteId)].map(([, l]) => ({
    nome: nomeAgente(l[0]),
    lista: l,
    r: resumir(l),
    chat: resumir(l.filter(m => m.canal === 'chat')),
    lig: resumir(l.filter(m => m.canal === 'ligacao')),
    falha: principaisFalhas(l, 1)[0]?.nome || '—'
  })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const porCanal = !ctx.canal;

  return `<article class="rel">
    ${cabecalho('Relatório de monitoria do setor', [['Setor', ctx.setor], ['Canal', rotCanal(ctx.canal)], ['Agentes avaliados', String(grupos.length)], ['Período', ctx.periodoTxt, true], ['Emitido em', emitido()]])}
    <section><h2>Resultado do setor</h2>${destaque(lista, ctx.canal)}</section>
    <section><h2>Resultado por agente</h2>
      <table><thead><tr><th>Agente</th><th class="num">Monitorias</th><th class="num">Nota média</th>${porCanal ? '<th class="num">Chat</th><th class="num">Ligação</th>' : ''}<th>Principal ponto de atenção</th></tr></thead><tbody>
      ${grupos.map(g => `<tr><td>${esc(g.nome)}</td><td class="num">${g.r.qtd}</td><td class="num ${U.classeNota(g.r.media)}"><strong>${U.fmtNota(g.r.media)}</strong></td>${porCanal ? `<td class="num">${U.fmtNota(g.chat.media)}</td><td class="num">${U.fmtNota(g.lig.media)}</td>` : ''}<td>${esc(g.falha)}</td></tr>`).join('')}
      </tbody></table>
    </section>
    <section><h2>Pontos de atenção do setor</h2>${tabelaFalhas(lista)}</section>
    ${ctx.detalhe ? `<section><h2>Monitorias do período</h2>${grupos.map(g => `<h3>${esc(g.nome)}</h3>${g.lista.map(blocoMonitoria).join('')}`).join('')}</section>` : ''}
    ${rodape}
  </article>`;
}
