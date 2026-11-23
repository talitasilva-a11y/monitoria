import { norm, media, falhou } from './util.js';

export function resumir(lista) {
  return { qtd: lista.length, media: media(lista.map(m => m.nota)) };
}

export function agruparPor(lista, chave) {
  const mapa = new Map();
  for (const x of lista) {
    const k = chave(x);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(x);
  }
  return mapa;
}

// Para cada critério: quantas vezes foi avaliado (sem contar "não se aplica") e quantas falhou.
export function agregarCriterios(lista) {
  const mapa = new Map();
  for (const m of lista) {
    for (const r of m.respostas || []) {
      const k = norm(r.nome);
      if (!mapa.has(k)) mapa.set(k, { nome: r.nome, avaliados: 0, falhas: 0 });
      const o = mapa.get(k);
      if (r.resposta && r.resposta !== 'NA') {
        o.avaliados++;
        if (falhou(r)) o.falhas++;
      }
    }
  }
  return [...mapa.values()].map(o => ({ ...o, pct: o.avaliados ? (o.falhas / o.avaliados) * 100 : null }));
}

export function principaisFalhas(lista, limite = Infinity) {
  return agregarCriterios(lista)
    .filter(c => c.falhas > 0)
    .sort((a, b) => b.pct - a.pct || b.falhas - a.falhas)
    .slice(0, limite);
}
