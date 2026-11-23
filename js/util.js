export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const pad = n => String(n).padStart(2, '0');

export function semAcento(s) { return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
export function norm(s) { return semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
export function slug(s) { return semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'; }
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const MINUSCULAS = new Set(['a', 'e', 'o', 'de', 'da', 'do', 'das', 'dos', 'em', 'para']);
export function nomeProprio(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ')
    .map((p, i) => (i > 0 && MINUSCULAS.has(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// ---------- Datas e competência (16 a 15, pelo mês em que termina) ----------
export function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function competenciaDeData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  let ano = +m[1], mes = +m[2];
  if (+m[3] >= 16) { mes++; if (mes > 12) { mes = 1; ano++; } }
  return `${ano}-${pad(mes)}`;
}
export function competenciaAtual() { return competenciaDeData(hojeISO()); }
export function deslocarCompetencia(c, n) {
  let [a, m] = c.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; a++; }
  while (m < 1) { m += 12; a--; }
  return `${a}-${pad(m)}`;
}
export function intervaloCompetencia(c) {
  const ant = deslocarCompetencia(c, -1);
  return { inicio: `${ant}-16`, fim: `${c}-15` };
}
export function rotuloCompetencia(c) {
  const [a, m] = String(c || '').split('-');
  return a && m ? `${MESES[+m - 1]}/${a}` : (c || '—');
}
export function listaCompetencias(qtd = 24) {
  const atual = competenciaAtual();
  return Array.from({ length: qtd }, (_, i) => deslocarCompetencia(atual, -i));
}
export function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// ---------- Telefone ----------
export function apenasDigitos(s) { return String(s ?? '').replace(/\D/g, ''); }
function semDDI(d) { return (d.length > 11 && d.startsWith('55')) ? d.slice(2) : d; }
export function mascaraDigitacao(v) {
  const d = semDDI(apenasDigitos(v)).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
export function formatarTelefone(s) {
  const d = semDDI(apenasDigitos(s));
  if (!d) return '—';
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return d;
}
export function mascararTelefone(s) {
  const d = semDDI(apenasDigitos(s));
  if (!d) return '—';
  if (d.length < 6) return '****';
  const fim = d.slice(-4);
  if (d.length >= 10) return `(${d.slice(0, 2)}) ${d[2]}****-${fim}`;
  return `${d[0]}****-${fim}`;
}

// ---------- Nota ----------
export function falhou(r) { return !!r.resposta && r.resposta !== 'NA' && r.resposta === r.penaliza; }
export function calcularNota(respostas) {
  let desconto = 0;
  for (const r of respostas || []) if (falhou(r)) desconto += Number(r.peso) || 0;
  return { desconto, nota: Math.max(0, 100 - desconto) };
}
export function media(nums) {
  const v = nums.filter(n => typeof n === 'number' && !isNaN(n));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
export function fmtNota(n) {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 1, maximumFractionDigits: 1 });
}
export function fmtPct(n) { return n == null ? '—' : `${Math.round(n)}%`; }
export function classeNota(n) { if (n == null) return ''; if (n >= 90) return 'boa'; if (n >= 70) return 'media'; return 'baixa'; }

// ---------- Interface ----------
export function aviso(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${tipo} visivel`;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.className = 'toast'; }, 4000);
}
export function baixarCSV(nome, linhas) {
  const txt = linhas.map(l => l.map(c => {
    const s = String(c ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + txt], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const numBR = n => n == null ? '' : n.toFixed(2).replace('.', ',');
