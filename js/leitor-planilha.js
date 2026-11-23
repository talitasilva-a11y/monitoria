import * as U from './util.js';
import { CRITERIOS_PADRAO } from './criterios-padrao.js';

// ---------- Comparação de nomes de critérios ----------
const ALIAS = { id: 'identificacao', retono: 'retorno' };
const STOP = new Set(['do', 'da', 'de', 'dos', 'das', 'e', 'ou', 'o', 'a', 'os', 'as', 'em', 'na', 'no', 'ate', 'para', 'pelo', 'pela']);
export function tokens(s) {
  return new Set(U.norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean)
    .map(t => ALIAS[t] || t)
    .map(t => (t.length > 3 && t.endsWith('s')) ? t.slice(0, -1) : t)
    .filter(t => !STOP.has(t)));
}
function jaccard(a, b) {
  let i = 0;
  for (const t of a) if (b.has(t)) i++;
  const u = a.size + b.size - i;
  return u ? i / u : 0;
}
export function melhorPar(nome, lista) {
  const tn = tokens(nome);
  let melhor = null, nota = 0;
  for (const it of lista) {
    const s = jaccard(tn, tokens(it.nome));
    if (s > nota) { nota = s; melhor = it; }
  }
  return nota >= 0.6 ? melhor : null;
}

// ---------- Leitura de valores ----------
function dataValida(ano, mes, dia) {
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}
function lerData(v, XLSX) {
  if (v instanceof Date && !isNaN(v)) return { ano: v.getFullYear(), mes: v.getMonth() + 1 };
  if (typeof v === 'number') {
    if (v > 1900 && v < 3000) return { ano: v, mes: null };
    if (v > 20000 && v < 80000 && XLSX?.SSF?.parse_date_code) {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) return { ano: d.y, mes: d.m };
    }
    return null;
  }
  const s = String(v || '');
  let m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return { ano: +m[3], mes: +m[2] };
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { ano: +m[1], mes: +m[2] };
  m = /^\s*(\d{4})\s*$/.exec(s);
  if (m) return { ano: +m[1], mes: null };
  return null;
}

// O campo "LINK" das planilhas tem data, hora, Ativo/Receptivo e telefone juntos.
export function lerLink(txt) {
  const s = String(txt || '').trim();
  const r = { data: '', tipo: '', contato: '' };
  const d = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (d && dataValida(+d[3], +d[2], +d[1])) r.data = `${d[3]}-${U.pad(+d[2])}-${U.pad(+d[1])}`;
  const t = /(ativo|receptivo)/i.exec(s);
  if (t) r.tipo = t[1].toLowerCase() === 'ativo' ? 'Ativo' : 'Receptivo';
  if (!/^https?:/i.test(s)) {
    if (t) {
      const dig = U.apenasDigitos(s.slice(t.index + t[1].length));
      if (dig.length >= 8) r.contato = dig;
    } else {
      const trechos = s.replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ').replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ').match(/\+?\d[\d\s-]{6,}\d/g);
      if (trechos) r.contato = U.apenasDigitos(trechos[trechos.length - 1]);
    }
  }
  return r;
}
function valorResposta(v) {
  const n = U.norm(v);
  if (n === 'sim') return 'SIM';
  if (n === 'nao') return 'NÃO';
  return 'NA';
}
const arred = n => Math.round(n * 100) / 100;
function lerNota(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return arred(v <= 1.0001 ? v * 100 : v);
  let s = String(v).trim();
  const pct = s.includes('%');
  s = s.replace('%', '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return arred(pct || n > 1.0001 ? n : n * 100);
}
function hash(s) {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
function nomeFrase(s) { const t = String(s).trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); }
export function mapearMonitor(valor, usuarios) {
  const n = U.norm(valor);
  if (!n) return { monitorLogin: '', monitorNome: '' };
  const primeiro = n.split(' ')[0];
  const u = usuarios.find(u => {
    const nn = U.norm(u.nome);
    return nn === n || U.norm(u.login) === n || nn.split(' ')[0] === primeiro;
  });
  return u ? { monitorLogin: u.login, monitorNome: u.nome } : { monitorLogin: '', monitorNome: U.nomeProprio(valor) };
}

// ---------- Leitura de um arquivo .xlsx ----------
export function analisarPlanilha(XLSX, dados, nomeArquivo, usuarios = []) {
  const wb = XLSX.read(dados, { type: 'array', cellDates: true });
  const nomes = wb.SheetNames;
  const abaBase = nomes.find(n => U.norm(n).includes('base'));
  if (!abaBase) throw new Error('não encontrei a aba BASE DE DADOS.');
  const abaMon = nomes.find(n => U.norm(n) === 'monitoria');
  const abaAtr = nomes.find(n => U.norm(n).includes('atributo'));
  const ler = n => n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) : [];

  const linhas = ler(abaBase);
  if (linhas.length < 2) throw new Error('a aba BASE DE DADOS está vazia.');
  const H = linhas[0].map(h => U.norm(h));
  const acha = teste => H.findIndex(teste);
  const iAgente = acha(h => h.includes('agente'));
  const iSetor = acha(h => h === 'setor');
  const iLink = acha(h => h.startsWith('link'));
  const iCarimbo = acha(h => h.includes('carimbo'));
  const iFeedback = acha(h => h.includes('feedback'));
  const iMonitor = acha(h => h === 'monitor');
  const iNota = acha(h => h === 'nota');
  const iMes = acha(h => h === 'mes');
  const iAno = acha(h => h === 'ano');
  if (iAgente < 0) throw new Error('não encontrei a coluna do agente na aba BASE DE DADOS.');
  if (iLink < 0) throw new Error('não encontrei a coluna LINK na aba BASE DE DADOS.');

  const canal = (H[iLink].includes('ligac') || U.norm(nomeArquivo).includes('telefon')) ? 'ligacao' : 'chat';

  // Colunas de critério: as que têm o nome entre colchetes, ex.: " [PROTOCOLO]".
  const colsCrit = linhas[0].map((h, i) => ({ h: String(h), i }))
    .filter(x => /\[.+\]/.test(x.h))
    .map(x => ({ i: x.i, bruto: x.h.replace(/^[^[]*\[/, '').replace(/\][^\]]*$/, '').trim() }));
  if (!colsCrit.length) throw new Error('não encontrei as colunas de critérios (nomes entre colchetes).');

  const atrib = ler(abaAtr).slice(1)
    .filter(r => String(r[0]).trim() && String(r[2]).trim() !== '' && !isNaN(Number(r[2])))
    .map(r => ({ nome: String(r[0]).trim(), penaliza: U.norm(r[1]) === 'sim' ? 'SIM' : 'NÃO', peso: Number(r[2]) }));

  const sementes = CRITERIOS_PADRAO[canal];
  const ids = new Set();
  const criterios = colsCrit.map(col => {
    const semente = melhorPar(col.bruto, sementes);
    const at = melhorPar(col.bruto, atrib);
    const nome = semente?.nome || nomeFrase(col.bruto);
    let id = semente?.id || U.slug(nome);
    while (ids.has(id)) id += '-2';
    ids.add(id);
    return {
      id, nome,
      penaliza: at ? at.penaliza : (semente?.penaliza || 'NÃO'),
      peso: at ? at.peso : (semente?.peso ?? 0),
      ativo: true,
      origem: at ? 'atributos' : (semente ? 'padrao' : 'sem-peso'),
      col: col.i,
      bruto: col.bruto
    };
  });

  // Monitor: vem da aba BASE (ligação) ou da aba MONITORIA na mesma linha (chat).
  const linhasMon = ler(abaMon);
  const Hm = (linhasMon[0] || []).map(h => U.norm(h));
  const iMonM = Hm.findIndex(h => h === 'monitor');
  const iAgM = Hm.findIndex(h => h.includes('agente'));
  const contagemMon = new Map();
  if (iMonM >= 0) for (const l of linhasMon.slice(1)) { const v = String(l[iMonM] || '').trim(); if (v) contagemMon.set(v, (contagemMon.get(v) || 0) + 1); }
  const monitorMaisComum = [...contagemMon].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  const monitorias = [], alertas = [], erros = [];
  const setores = new Map(), agentes = new Map(), monitores = new Map(), comps = new Set();
  const usados = new Map();

  for (let r = 1; r < linhas.length; r++) {
    const row = linhas[r];
    const agenteNome = String(row[iAgente] ?? '').trim().replace(/\s+/g, ' ');
    if (!agenteNome) {
      if (row.some(v => String(v).trim())) erros.push({ linha: r + 1, agente: '', motivo: 'Linha sem agente.' });
      continue;
    }
    const linkOriginal = String(row[iLink] ?? '').trim();
    const link = lerLink(linkOriginal);

    // Competência pelas colunas MÊS e ANO (ANO guarda a data da monitoria).
    const dm = (iAno >= 0 ? lerData(row[iAno], XLSX) : null) || (iCarimbo >= 0 ? lerData(row[iCarimbo], XLSX) : null);
    const mes = iMes >= 0 ? parseInt(row[iMes], 10) : NaN;
    let competencia = '';
    if (mes >= 1 && mes <= 12 && dm?.ano) {
      let ano = dm.ano;
      if (dm.mes) { if (mes - dm.mes > 6) ano--; else if (mes - dm.mes < -6) ano++; }
      competencia = `${ano}-${U.pad(mes)}`;
    } else if (link.data) {
      competencia = U.competenciaDeData(link.data);
      alertas.push({ linha: r + 1, agente: agenteNome, motivo: 'Sem MÊS/ANO; competência calculada pela data do atendimento.', texto: linkOriginal });
    }
    if (!competencia) {
      erros.push({ linha: r + 1, agente: agenteNome, motivo: 'Sem MÊS/ANO e sem data do atendimento reconhecível.', texto: linkOriginal });
      continue;
    }
    if (!link.data) alertas.push({ linha: r + 1, agente: agenteNome, motivo: 'Data do atendimento não reconhecida.', texto: linkOriginal });
    else if (!link.tipo) alertas.push({ linha: r + 1, agente: agenteNome, motivo: 'Ativo/Receptivo não reconhecido.', texto: linkOriginal });

    const setorNome = iSetor >= 0 && String(row[iSetor]).trim() ? U.nomeProprio(row[iSetor]) : 'Não informado';
    const setorId = U.slug(setorNome);
    const agenteId = U.slug(agenteNome);
    if (!setores.has(setorId)) setores.set(setorId, setorNome);
    if (!agentes.has(agenteId)) agentes.set(agenteId, { nome: agenteNome, setores: new Map() });
    const sa = agentes.get(agenteId).setores;
    sa.set(setorId, (sa.get(setorId) || 0) + 1);

    let monitorBruto = iMonitor >= 0 ? String(row[iMonitor] || '').trim() : '';
    if (!monitorBruto && iMonM >= 0) {
      const lm = linhasMon[r];
      if (lm && U.norm(lm[iAgM]) === U.norm(agenteNome)) monitorBruto = String(lm[iMonM] || '').trim();
    }
    if (!monitorBruto) monitorBruto = monitorMaisComum;
    const mon = mapearMonitor(monitorBruto, usuarios);
    if (!monitores.has(monitorBruto)) monitores.set(monitorBruto, { ...mon, qtd: 0 });
    monitores.get(monitorBruto).qtd++;

    const respostas = criterios.map(c => ({
      id: c.id, nome: c.nome, peso: c.peso, penaliza: c.penaliza, resposta: valorResposta(row[c.col]), obs: ''
    }));
    const calc = U.calcularNota(respostas);
    const notaPlanilha = iNota >= 0 ? lerNota(row[iNota]) : null;
    const nota = notaPlanilha ?? calc.nota;
    if (notaPlanilha != null && Math.abs(notaPlanilha - calc.nota) > 0.5) {
      alertas.push({ linha: r + 1, agente: agenteNome, motivo: `Nota da planilha (${U.fmtNota(notaPlanilha)}) diferente do cálculo pelos pesos (${U.fmtNota(calc.nota)}). Mantida a da planilha.`, texto: '' });
    }

    let carimbo = iCarimbo >= 0 ? row[iCarimbo] : '';
    const criadoEm = carimbo instanceof Date && !isNaN(carimbo) ? carimbo : null;
    const base = `${canal}|${criadoEm ? criadoEm.toISOString().slice(0, 10) : String(carimbo)}|${U.norm(agenteNome)}|${linkOriginal}`;
    let id = `imp-${canal}-${hash(base)}`;
    const vezes = usados.get(id) || 0;
    usados.set(id, vezes + 1);
    if (vezes) id += `-${vezes + 1}`;

    comps.add(competencia);
    monitorias.push({
      id,
      dados: {
        canal, setorId, setorNome, agenteId, agenteNome,
        dataAtendimento: link.data, competencia, tipo: link.tipo, contato: link.contato,
        protocolo: '', linkOriginal, respostas,
        desconto: calc.desconto, nota,
        obsFinal: (iFeedback >= 0 ? String(row[iFeedback] || '').trim() : '') || 'Sem observação registrada na planilha.',
        monitorLogin: mon.monitorLogin, monitorNome: mon.monitorNome,
        origem: 'importacao', criadoEm
      }
    });
  }

  return { arquivo: nomeArquivo, canal, criterios, monitorias, alertas, erros, setores, agentes, monitores, comps: [...comps].sort() };
}
