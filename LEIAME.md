# Sistema de Monitoria de Qualidade | Agility Soluções

Sistema para registrar monitorias de chat e ligação, calcular a nota na hora e gerar relatórios de feedback para os gestores. As telas ficam no GitHub Pages e os dados ficam no Firebase (Google), protegidos por login.

## O que tem em cada arquivo

| Arquivo | Para que serve |
|---|---|
| `index.html` | Página do sistema |
| `css/estilo.css` | Aparência das telas e do relatório em PDF |
| `img/` | Logos e ícone da Agility |
| `js/config.js` | **Único arquivo que você precisa editar**: dados do Firebase |
| `js/*.js` (demais) | Funcionamento do sistema |
| `firestore.rules` | Regras de segurança do banco (vão no Firebase, não no GitHub) |

---

## Parte 1: Criar o projeto no Firebase

Use a sua conta Google (talita.silva@agility.com.br ou a conta Google da empresa).

1. Acesse **console.firebase.google.com** e clique em **Criar um projeto**.
2. Nome sugerido: `monitoria-agility`. Pode desativar o Google Analytics, ele não é usado.
3. Plano: o gratuito (**Spark**) é suficiente. Não é preciso cadastrar cartão.

### 1.1 Banco de dados

1. No menu lateral: **Criação > Firestore Database > Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)**. Atenção: o local não pode ser mudado depois.
3. Modo: **produção**.

### 1.2 Regras de segurança

1. Em **Firestore Database**, abra a aba **Regras**.
2. Apague o conteúdo que estiver lá, cole todo o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.

### 1.3 Login por e-mail e senha

1. No menu: **Criação > Authentication > Vamos começar**.
2. Em **Método de login**, escolha **E-mail/senha**, ative a primeira opção (deixe "Link de e-mail" desativado) e salve.

### 1.4 Acessos dos monitores

Em **Authentication > Usuários > Adicionar usuário**, crie os três acessos com uma senha inicial para cada um:

| Pessoa | E-mail no Firebase | Login no sistema |
|---|---|---|
| Talita Silva (administradora) | talita.silva@monitoria.agility.com.br | talita.silva |
| Leidimeira Silvano | leidimeira.silvano@monitoria.agility.com.br | leidimeira.silvano |
| Erick Paiva | erick.paiva@monitoria.agility.com.br | erick.paiva |

Esses e-mails não existem de verdade e não recebem mensagens. Servem só como login. Cada pessoa digita apenas a parte antes do @.

### 1.5 Pegar os dados de conexão

1. Clique na engrenagem ao lado de **Visão geral do projeto > Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **</>** (Web). Dê um apelido, por exemplo `monitoria`. **Não** marque Firebase Hosting.
3. Vai aparecer um bloco `firebaseConfig` com `apiKey`, `authDomain`, `projectId` etc.
4. Abra o arquivo `js/config.js` e substitua cada `COLE_AQUI` pelo valor correspondente.

Esses dados não são senha. Eles só dizem ao sistema qual projeto usar. Quem protege os dados são o login e as regras de segurança.

---

## Parte 2: Publicar no GitHub

1. Entre no **github.com** e clique em **New repository**.
2. Nome sugerido: `monitoria`. Marque **Public** (no plano gratuito, o GitHub Pages só funciona com repositório público; isso expõe apenas o código das telas, nunca as monitorias, que ficam no Firebase).
3. No repositório criado, clique em **Add file > Upload files** e arraste **todo o conteúdo** da pasta do sistema, mantendo as pastas `css`, `img` e `js`. Clique em **Commit changes**.
4. Vá em **Settings > Pages**. Em **Source**, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**.
5. Em um ou dois minutos o endereço aparece no topo da página, no formato `https://SEU-USUARIO.github.io/monitoria/`.

### 2.1 Liberar o endereço no Firebase

1. No Firebase: **Authentication > Configurações > Domínios autorizados > Adicionar domínio**.
2. Adicione `SEU-USUARIO.github.io` (sem `https://` e sem `/monitoria`).

---

## Parte 3: Primeiro acesso

1. Abra o endereço do GitHub Pages e entre com `talita.silva` e a senha criada no passo 1.4.
2. No primeiro acesso da administradora, o sistema cria sozinho os três monitores e os critérios de chat e ligação com os pesos das planilhas atuais.
3. Vá em **Configurações > Importar histórico** e siga a Parte 4.
4. Peça para a Leidimeira e o Erick entrarem e confirme que funciona para eles.

---

## Parte 4: Importar o histórico de 2026

1. No Google Sheets, abra a planilha **MONITORIA CHAT | 2026** e use **Arquivo > Fazer download > Microsoft Excel (.xlsx)**. Faça o mesmo com **MONITORIA TELEFONIA | 2026**.
2. No sistema: **Configurações > Importar histórico** e selecione os dois arquivos.
3. Confira a prévia:
   - **Critérios e pesos lidos**: vêm da aba ATRIBUTOS de cada planilha.
   - **Linhas para conferir**: serão importadas, mas têm algo a revisar (por exemplo, data do atendimento não reconhecida no campo LINK).
   - **Linhas que não serão importadas**: sem competência possível de calcular.
   - **Cadastros**: setores e agentes que serão criados.
4. Clique em **Importar**.

Como a importação funciona:

- A competência vem das colunas **MÊS** e **ANO** da aba BASE DE DADOS.
- A data do atendimento, o tipo (Ativo/Receptivo) e o telefone são separados do campo LINK.
- As notas ficam exatamente como estão na planilha.
- O monitor de cada linha vem da coluna MONITOR.
- Se importar o mesmo arquivo de novo, nada é duplicado: as monitorias são atualizadas.

---

## Uso no dia a dia

**Nova monitoria**: escolha canal, setor, agente, data do atendimento e tipo; preencha contato e protocolo; marque cada critério. Ao marcar um item negativo, abre um campo de observação (opcional). A observação final é obrigatória. A competência aparece embaixo da data e a nota é calculada enquanto você marca. Depois de salvar, o formulário mantém canal, setor e agente para agilizar a próxima monitoria do mesmo agente.

**Competência**: vai do dia 16 ao dia 15 e leva o nome do mês em que termina. Atendimentos de 16/12/2025 a 15/01/2026 são a competência de janeiro de 2026. A competência é sempre pela data do atendimento.

**Monitorias**: lista com filtros e busca por protocolo, contato ou agente. Cada monitor edita e exclui só as próprias monitorias; a administradora pode todas. "Exportar lista (CSV)" baixa a lista filtrada; para a administradora, com o telefone completo.

**Relatórios**:
- **Por agente**: escolha setor, agente, período (competência ou intervalo de datas) e canal (chat, ligação ou os dois).
- **Setor inteiro**: resultado de cada agente do setor e os pontos de atenção da equipe.
- **Salvar em PDF**: abre a janela de impressão; escolha **Salvar como PDF** como destino.
- **Exportar resumo (CSV)**: período, setor, agente, canal, quantidade e nota média, para colar na planilha de indicadores.
- No relatório, o telefone sai mascarado, por exemplo (84) 9****-3456.

**Nota**: 100 menos a soma dos pesos dos itens não atendidos, com mínimo de zero. Peso 100 ou mais (Protocolo) zera a nota. As médias são médias simples das monitorias.

---

## Tarefas da administradora

**Novo monitor**: em **Configurações > Monitores**, adicione nome e login. Depois crie o acesso no Firebase (passo 1.4) com o e-mail `login@monitoria.agility.com.br`.

**Tirar o acesso de alguém**: em **Configurações > Monitores**, desmarque **Ativo**. Para bloquear também no Firebase: **Authentication > Usuários > menu da pessoa > Desativar conta**.

**Senha esquecida**: como os e-mails não existem, não dá para enviar link de redefinição. No Firebase, em **Authentication > Usuários**, exclua a conta da pessoa e crie de novo com o mesmo e-mail e uma senha nova. O histórico não se perde, porque as monitorias ficam ligadas ao login.

**Novo agente ou mudança de setor**: **Configurações > Agentes**. Agente inativo some da lista de novas monitorias, mas continua no histórico e nos relatórios.

**Critérios e pesos**: **Configurações > Critérios e pesos**. As mudanças valem só para as próximas monitorias; as já feitas mantêm os critérios e pesos da época.

---

## Teste de segurança

Para confirmar que ninguém sem login acessa os dados:

1. No Firebase, abra **Firestore Database > Regras > Playground de regras**.
2. Tipo de simulação **get**, local `/monitorias/qualquer`, **Autenticado** desligado.
3. Clique em **Executar**: o resultado deve ser **Negado**.
4. Ligue **Autenticado** com o e-mail `teste@gmail.com` e execute de novo: também deve ser **Negado**.

---

## Limites do plano gratuito

O plano Spark permite 50 mil leituras e 20 mil gravações por dia e 1 GB de dados. O volume atual (cerca de 1.100 monitorias por ano) usa uma pequena fração disso. O projeto gratuito do Firebase não é pausado por falta de uso.

## Se mudar o login da administradora

Altere em dois lugares: `LOGIN_ADMIN` em `js/config.js` e o e-mail na função `ehAdmin()` em `firestore.rules` (e publique as regras de novo no Firebase).
