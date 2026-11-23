import { slug } from './util.js';

// "penaliza" é a resposta que desconta pontos. Peso 100 ou mais zera a nota.
const c = (nome, penaliza, peso) => ({ id: slug(nome), nome, penaliza, peso, ativo: true });

export const CANAIS = { chat: 'Chat', ligacao: 'Ligação' };

// Baseado na aba ATRIBUTOS das planilhas de 2026. Ao importar o histórico,
// os pesos são lidos de novo da própria aba ATRIBUTOS de cada planilha.
export const CRITERIOS_PADRAO = {
  chat: [
    c('Apresentação', 'NÃO', 5),
    c('Protocolo', 'NÃO', 100),
    c('Titular do contrato', 'NÃO', 20),
    c('Identificação positiva', 'NÃO', 30),
    c('Sondagem da necessidade', 'NÃO', 20),
    c('Muito tempo na fila de espera', 'NÃO', 5),
    c('Argumentos para insatisfação e/ou cobrança', 'NÃO', 5),
    c('Cordialidade', 'NÃO', 20),
    c('Realizou o retorno em até 3 minutos', 'NÃO', 10),
    c('Alerta de inatividade (5 minutos)', 'NÃO', 3),
    c('Escrita', 'NÃO', 20),
    c('Desculpa pelo envio incorreto de informação', 'NÃO', 5),
    c('Transferência indevida', 'SIM', 15),
    c('Algo mais', 'NÃO', 5),
    c('Pesquisa de satisfação', 'NÃO', 8),
    c('Encerramento', 'NÃO', 5),
    c('Encerramento não titular', 'NÃO', 3),
    c('Gírias e vícios de linguagem', 'SIM', 3)
  ],
  ligacao: [
    c('Apresentação', 'NÃO', 5),
    c('Chamar o cliente pelo nome', 'NÃO', 5),
    c('Call back', 'NÃO', 10),
    c('Protocolo', 'NÃO', 100),
    c('Titular do contrato', 'NÃO', 20),
    c('ID positiva', 'NÃO', 30),
    c('Sondagem da necessidade', 'NÃO', 20),
    c('Tom de voz', 'NÃO', 10),
    c('Cordialidade', 'NÃO', 10),
    c('Retorno 60s', 'NÃO', 3),
    c('Transferência indevida', 'SIM', 15),
    c('Algo mais', 'NÃO', 5),
    c('Pesquisa de satisfação', 'NÃO', 8),
    c('Encerramento', 'NÃO', 5),
    c('Gírias e vícios de linguagem', 'SIM', 3)
  ]
};

export const MONITORES_INICIAIS = [
  { login: 'talita.silva', nome: 'Talita Silva', papel: 'admin' },
  { login: 'leidimeira.silvano', nome: 'Leidimeira Silvano', papel: 'monitor' },
  { login: 'erick.paiva', nome: 'Erick Paiva', papel: 'monitor' }
];
