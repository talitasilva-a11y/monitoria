import { estado, recarregarCadastros, falha, setorPorId, agentePorId } from './estado.js';
import { gravarEmLote } from './db.js';
import { CANAIS } from './criterios-padrao.js';
import { analisarPlanilha } from './leitor-planilha.js';
import * as U from './util.js';

const URL_XLSX = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
let XLSX = null;
const { esc } = U;

const ORIGEM = { atributos: 'Aba ATRIBUTOS', padrao: 'Padrão do sistema', 'sem-peso': 'Sem peso: ajuste depois' };

function setorMaisFrequente(mapa) { return [...mapa].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; }

export function telaImportar(box) {
  box.innerHTML = `
    <p class="dica">No Google Sheets, abra cada planilha de monitoria e use <strong>Arquivo &gt; Fazer download &gt; Microsoft Excel (.xlsx)</strong>. Depois selecione os arquivos aqui. Pode enviar a de chat e a de ligação juntas.</p>
    <p class="dica">O sistema lê a aba BASE DE DADOS (competência pelas colunas MÊS e ANO), a aba MONITORIA (monitor) e a aba ATRIBUTOS (pesos). Nada é gravado antes de você conferir e confirmar.</p>
    <div class="form-linha"><label>Arquivos .xlsx<input type="file" id="imp-arq" accept=".xlsx" multiple></label></div>
    <div id="imp-previa"></div>`;

  let resultados = [];

  box.querySelector('#imp-arq').addEventListener('change', async e => {
    const arquivos = [...e.target.files];
    const previa = box.querySelector('#imp-previa');
    if (!arquivos.length) { previa.innerHTML = ''; return; }
    previa.innerHTML = '<p class="sub">Lendo os arquivos…</p>';
    try {
      if (!XLSX) XLSX = await import(URL_XLSX);
    } catch (err) {
      console.error(err);
      previa.innerHTML = '<p class="erro">Não foi possível carregar o leitor de planilhas. Verifique a internet e tente de novo.</p>';
      return;
    }
    resultados = [];
    const problemas = [];
    for (const a of arquivos) {
      try {
        resultados.push(analisarPlanilha(XLSX, new Uint8Array(await a.arrayBuffer()), a.name, estado.usuarios));
      } catch (err) {
        console.error(err);
        problemas.push(`${a.name}: ${err.message}`);
      }
    }
    previa.innerHTML = htmlPrevia(resultados, problemas);
  });

  box.addEventListener('click', async e => {
    const btn = e.target.closest('#imp-confirmar');
    if (!btn) return;
    await importar(resultados, box, btn);
  });
}

function tabelaLinhas(lista) {
  return `<div class="tabela-wrap"><table><thead><tr><th class="num">Linha</th><th>Agente</th><th>Motivo</th><th>Texto original</th></tr></thead><tbody>` +
    lista.map(l => `<tr><td class="num">${l.linha}</td><td>${esc(l.agente)}</td><td>${esc(l.motivo)}</td><td>${esc(l.texto || '')}</td></tr>`).join('') +
    `</tbody></table></div>`;
}

function htmlPrevia(resultados, problemas) {
  let h = '';
  if (problemas.length) {
    h += `<div class="bloco"><h2>Arquivos que não puderam ser lidos</h2><ul>${problemas.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`;
  }
  if (!resultados.length) return h;

  resultados.forEach((r, idx) => {
    const de = U.rotuloCompetencia(r.comps[0]), ate = U.rotuloCompetencia(r.comps[r.comps.length - 1]);
    h += `<section class="bloco">
      <h2>${esc(r.arquivo)}</h2>
      <p>Canal identificado: <strong>${CANAIS[r.canal]}</strong>. ${r.monitorias.length} monitorias prontas para importar${r.comps.length ? `, de ${de} a ${ate}` : ''}.</p>
      <details><summary>Critérios e pesos lidos (${r.criterios.length})</summary>
        <div class="tabela-wrap"><table><thead><tr><th>Critério</th><th>Coluna na planilha</th><th>Desconta quando</th><th class="num">Peso</th><th>Origem do peso</th></tr></thead><tbody>
        ${r.criterios.map(c => `<tr><td>${esc(c.nome)}</td><td>${esc(c.bruto)}</td><td>${c.penaliza}</td><td class="num">${c.peso}</td><td>${ORIGEM[c.origem]}</td></tr>`).join('')}
        </tbody></table></div>
      </details>
      <label class="checkbox"><input type="checkbox" data-atualizar="${idx}" checked> Usar estes critérios e pesos como configuração de ${CANAIS[r.canal].toLowerCase()}</label>
      ${r.alertas.length ? `<details><summary>${r.alertas.length} linhas para conferir (serão importadas)</summary>${tabelaLinhas(r.alertas)}</details>` : ''}
      ${r.erros.length ? `<details open><summary>${r.erros.length} linhas que não serão importadas</summary>${tabelaLinhas(r.erros)}</details>` : ''}
    </section>`;
  });

  // Cadastros encontrados em todos os arquivos
  const setores = new Map(), agentes = new Map(), monitores = new Map();
  for (const r of resultados) {
    for (const [id, nome] of r.setores) if (!setores.has(id)) setores.set(id, nome);
    for (const [id, a] of r.agentes) {
      if (!agentes.has(id)) agentes.set(id, { nome: a.nome, setores: new Map() });
      for (const [s, n] of a.setores) agentes.get(id).setores.set(s, (agentes.get(id).setores.get(s) || 0) + n);
    }
    for (const [bruto, m] of r.monitores) {
      if (!monitores.has(bruto)) monitores.set(bruto, { ...m, qtd: 0 });
      monitores.get(bruto).qtd += m.qtd;
    }
  }
  const novo = '<span class="chip">novo</span>';
  const total = resultados.reduce((s, r) => s + r.monitorias.length, 0);

  h += `<section class="bloco"><h2>Cadastros</h2>
    <p><strong>Setores:</strong> ${[...setores].map(([id, n]) => `${esc(setorPorId(id)?.nome || n)} ${setorPorId(id) ? '' : novo}`).join(', ')}</p>
    <p><strong>Agentes:</strong> ${[...agentes].sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR')).map(([id, a]) => {
      const existente = agentePorId(id);
      const sid = existente?.setorId || setorMaisFrequente(a.setores);
      return `${esc(existente?.nome || a.nome)} (${esc(setorPorId(sid)?.nome || setores.get(sid) || '—')}) ${existente ? '' : novo}`;
    }).join(', ')}</p>
    <p><strong>Monitores nas planilhas:</strong> ${[...monitores].map(([bruto, m]) =>
      `${esc(bruto || 'vazio')}: ${m.monitorLogin ? `ligado a ${esc(m.monitorNome)}` : `sem login correspondente, fica registrado como "${esc(m.monitorNome || '—')}"`} (${m.qtd})`).join('; ')}</p>
  </section>
  <p class="dica">As notas das monitorias antigas ficam exatamente como estão na planilha. Se importar o mesmo arquivo de novo, as monitorias são atualizadas, não duplicadas, e qualquer edição feita no sistema nessas monitorias importadas é substituída.</p>
  <div class="form-linha"><button class="btn primario" id="imp-confirmar" ${total ? '' : 'disabled'}>Importar ${total} monitorias</button></div>
  <p id="imp-status" class="sub" role="status"></p>`;
  return h;
}

async function importar(resultados, box, btn) {
  const status = box.querySelector('#imp-status');
  const ops = [];
  const setoresNovos = new Map(), agentesNovos = new Map();

  for (const r of resultados) {
    for (const [id, nome] of r.setores) if (!setorPorId(id) && !setoresNovos.has(id)) setoresNovos.set(id, nome);
    for (const [id, a] of r.agentes) {
      if (!agentePorId(id) && !agentesNovos.has(id)) agentesNovos.set(id, { nome: a.nome, setorId: setorMaisFrequente(a.setores) });
    }
  }
  for (const [id, nome] of setoresNovos) ops.push({ col: 'setores', id, dados: { nome, ativo: true } });
  for (const [id, a] of agentesNovos) ops.push({ col: 'agentes', id, dados: { ...a, ativo: true } });

  resultados.forEach((r, idx) => {
    if (box.querySelector(`[data-atualizar="${idx}"]`)?.checked) {
      const itens = r.criterios.map(({ col, origem, bruto, ...c }) => c);
      ops.push({ col: 'criterios', id: r.canal, dados: { itens, atualizadoEm: new Date() } });
    }
    for (const m of r.monitorias) ops.push({ col: 'monitorias', id: m.id, dados: { ...m.dados, importadoEm: new Date() } });
  });

  btn.disabled = true;
  try {
    await gravarEmLote(ops, (feitos, total) => { status.textContent = `Gravando ${feitos} de ${total} registros…`; });
    await recarregarCadastros();
    const qtd = resultados.reduce((s, r) => s + r.monitorias.length, 0);
    status.textContent = `Importação concluída: ${qtd} monitorias, ${agentesNovos.size} agentes novos e ${setoresNovos.size} setores novos.`;
    U.aviso('Histórico importado.');
  } catch (err) {
    falha(err);
    status.textContent = 'A importação parou no meio. Pode rodar de novo com os mesmos arquivos: o que já foi gravado é atualizado, sem duplicar.';
    btn.disabled = false;
  }
}
