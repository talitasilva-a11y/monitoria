import { listarSetores, listarAgentes, listarUsuarios, obterCriterios } from './db.js';
import { esc, rotuloCompetencia, aviso } from './util.js';

export const estado = {
  usuario: null,          // { login, nome, admin }
  setores: [],
  agentes: [],
  usuarios: [],
  criterios: { chat: [], ligacao: [] },
  edicao: null,           // monitoria em edição
  ultimaEscolha: null     // canal/setor/agente da última monitoria salva
};

export const ordenarPorNome = arr => [...arr].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
export const setorPorId = id => estado.setores.find(s => s.id === id);
export const agentePorId = id => estado.agentes.find(a => a.id === id);
export const nomeAgente = m => agentePorId(m.agenteId)?.nome || m.agenteNome || '—';
export const nomeSetor = m => setorPorId(m.setorId)?.nome || m.setorNome || '—';

export async function recarregarCadastros() {
  const [s, a, u, cc, cl] = await Promise.all([
    listarSetores(), listarAgentes(), listarUsuarios(), obterCriterios('chat'), obterCriterios('ligacao')
  ]);
  estado.setores = ordenarPorNome(s);
  estado.agentes = ordenarPorNome(a);
  estado.usuarios = ordenarPorNome(u);
  estado.criterios = { chat: cc || [], ligacao: cl || [] };
}

export function opcoesSetores(sel = '', incluirInativos = false) {
  return estado.setores
    .filter(s => incluirInativos || s.ativo !== false || s.id === sel)
    .map(s => `<option value="${esc(s.id)}"${s.id === sel ? ' selected' : ''}>${esc(s.nome)}${s.ativo === false ? ' (inativo)' : ''}</option>`)
    .join('');
}
export function opcoesAgentes(setorId, sel = '', incluirInativos = false) {
  return estado.agentes
    .filter(a => (!setorId || a.setorId === setorId) && (incluirInativos || a.ativo !== false || a.id === sel))
    .map(a => `<option value="${esc(a.id)}"${a.id === sel ? ' selected' : ''}>${esc(a.nome)}${a.ativo === false ? ' (inativo)' : ''}</option>`)
    .join('');
}
export function opcoesCompetencia(comps, sel = '') {
  return comps.map(c => `<option value="${c}"${c === sel ? ' selected' : ''}>${rotuloCompetencia(c)}</option>`).join('');
}
export function opcoesCanal(rotuloTodos, sel = '') {
  return (rotuloTodos ? `<option value="">${rotuloTodos}</option>` : '') +
    `<option value="chat"${sel === 'chat' ? ' selected' : ''}>Chat</option>` +
    `<option value="ligacao"${sel === 'ligacao' ? ' selected' : ''}>Ligação</option>`;
}
export function seg(campo, opcoes, valor, extra = '') {
  return `<div class="segmentado ${extra}" role="group" data-campo="${campo}">` +
    opcoes.map(([v, r]) => `<button type="button" data-v="${v}" aria-pressed="${v === valor}">${r}</button>`).join('') +
    `</div>`;
}
export function falha(err) {
  console.error(err);
  aviso(err?.code === 'permission-denied'
    ? 'Sem permissão para esta ação.'
    : 'Não foi possível concluir. Verifique a conexão e tente de novo.', 'erro');
}
