// Ponto de entrada: confere se o Firebase foi configurado antes de carregar o sistema.
import { firebaseConfig } from './config.js';

const carregando = document.getElementById('carregando-inicial');
const configurado = Object.values(firebaseConfig).every(v => v && !String(v).startsWith('COLE_AQUI'));

if (!configurado) {
  carregando.innerHTML = '<div><h1>Falta configurar o Firebase</h1><p>Abra o arquivo <strong>js/config.js</strong> e cole os dados do seu projeto Firebase, como explicado no LEIAME.</p></div>';
} else {
  import('./principal.js').catch(err => {
    console.error(err);
    carregando.innerHTML = '<div><h1>Não foi possível abrir o sistema</h1><p>Verifique a conexão com a internet e atualize a página.</p></div>';
  });
}
