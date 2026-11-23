import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, writeBatch, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig, DOMINIO } from './config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const emailDoLogin = l => {
  const v = String(l || '').trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${DOMINIO}`;
};
export const loginDoEmail = e => String(e || '').toLowerCase().split('@')[0];
export const entrar = (login, senha) => signInWithEmailAndPassword(auth, emailDoLogin(login), senha);
export const sair = () => signOut(auth);
export const aoMudarSessao = cb => onAuthStateChanged(auth, cb);

async function listar(nome) {
  const s = await getDocs(collection(db, nome));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export const listarSetores = () => listar('setores');
export const listarAgentes = () => listar('agentes');
export const listarUsuarios = () => listar('usuarios');

export async function obterUsuario(login) {
  const s = await getDoc(doc(db, 'usuarios', login));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function obterCriterios(canal) {
  const s = await getDoc(doc(db, 'criterios', canal));
  return s.exists() ? (s.data().itens || []) : null;
}
export const salvarCriterios = (canal, itens) => setDoc(doc(db, 'criterios', canal), { itens, atualizadoEm: serverTimestamp() });
export const salvarSetor = (id, dados) => setDoc(doc(db, 'setores', id), dados, { merge: true });
export const salvarAgente = (id, dados) => setDoc(doc(db, 'agentes', id), dados, { merge: true });
export const salvarUsuario = (id, dados) => setDoc(doc(db, 'usuarios', id), dados, { merge: true });

export async function salvarMonitoria(id, dados) {
  if (id) {
    await setDoc(doc(db, 'monitorias', id), { ...dados, atualizadoEm: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = doc(collection(db, 'monitorias'));
  await setDoc(ref, { ...dados, criadoEm: serverTimestamp() });
  return ref.id;
}
export const excluirMonitoria = id => deleteDoc(doc(db, 'monitorias', id));

// Busca por competência ("2026-01") ou por data do atendimento ("2026-01-10").
export async function buscarMonitorias({ compIni, compFim, dataIni, dataFim } = {}) {
  const col = collection(db, 'monitorias');
  const c = [];
  if (dataIni || dataFim) {
    if (dataIni) c.push(where('dataAtendimento', '>=', dataIni));
    if (dataFim) c.push(where('dataAtendimento', '<=', dataFim));
  } else {
    if (compIni) c.push(where('competencia', '>=', compIni));
    if (compFim) c.push(where('competencia', '<=', compFim));
  }
  const s = await getDocs(c.length ? query(col, ...c) : col);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Grava muitos documentos em lotes de 400 (limite do Firestore: 500 por lote).
export async function gravarEmLote(ops, aoProgredir) {
  for (let i = 0; i < ops.length; i += 400) {
    const lote = writeBatch(db);
    for (const o of ops.slice(i, i + 400)) lote.set(doc(db, o.col, o.id), o.dados);
    await lote.commit();
    aoProgredir?.(Math.min(i + 400, ops.length), ops.length);
  }
}
