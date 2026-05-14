# Dimensiona — Backend API

API REST para gestão e dimensionamento de recursos humanos hospitalares. Calcula o quadro de pessoal ideal para unidades de internação e não-internação com base em avaliações de complexidade de pacientes (SCP), taxa de ocupação e parâmetros configuráveis por unidade.

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Stack Tecnológica](#stack-tecnológica)
3. [Estrutura do Projeto](#estrutura-do-projeto)
4. [Configuração e Execução](#configuração-e-execução)
5. [Variáveis de Ambiente](#variáveis-de-ambiente)
6. [Banco de Dados](#banco-de-dados)
7. [Autenticação e Autorização](#autenticação-e-autorização)
8. [Entidades](#entidades)
9. [API — Referência de Rotas](#api--referência-de-rotas)
   - [Autenticação](#autenticação)
   - [Colaboradores](#colaboradores)
   - [Hospitais](#hospitais)
   - [Unidades de Internação](#unidades-de-internação)
   - [Unidades de Não-Internação](#unidades-de-não-internação)
   - [Unidades Neutras](#unidades-neutras)
   - [Leitos](#leitos)
   - [Avaliações SCP](#avaliações-scp)
   - [Coletas](#coletas)
   - [Dimensionamento](#dimensionamento)
   - [Parâmetros de Unidade](#parâmetros-de-unidade)
   - [Taxa de Ocupação](#taxa-de-ocupação)
   - [Baselines](#baselines)
   - [Snapshots de Dimensionamento](#snapshots-de-dimensionamento)
   - [Termômetro](#termômetro)
   - [Análise de Ocupação](#análise-de-ocupação)
   - [Avaliação Qualitativa](#avaliação-qualitativa)
   - [Controle de Período](#controle-de-período)
   - [Redes, Regiões e Grupos](#redes-regiões-e-grupos)
   - [Cargos](#cargos)
   - [Sítios e Posições Funcionais](#sítios-e-posições-funcionais)
   - [Exportações](#exportações)
   - [Relatórios](#relatórios)
   - [Estatísticas](#estatísticas)
   - [Métodos SCP](#métodos-scp)
   - [Reset de Senha](#reset-de-senha)
   - [Cache](#cache)
   - [Jobs](#jobs)
10. [Jobs Agendados](#jobs-agendados)
11. [Upload de Arquivos](#upload-de-arquivos)
12. [Scripts Utilitários](#scripts-utilitários)

---

## Visão Geral

O **Dimensiona** é um sistema de dimensionamento de pessoal hospitalar. Ele permite que gestores e avaliadores registrem a classificação de complexidade de pacientes internados (usando metodologias SCP como FUGULIN, PERROCA e DINI), calculem automaticamente o quadro de pessoal necessário por unidade e comparem esse quadro com baselines de referência e snapshots históricos.

**Principais funcionalidades:**

- Cadastro e gestão de hospitais, unidades e leitos.
- Registro diário de avaliações de complexidade de pacientes (SCP).
- Cálculo automático de dimensionamento (internação e não-internação).
- Análise de taxa de ocupação por leito, unidade e hospital.
- Baselines (cenário de referência de quadro de pessoal).
- Snapshots (fotografia do dimensionamento em um momento).
- Termômetro hospitalar (indicador consolidado de situação do quadro).
- Relatórios e exportações em PDF e XLSX.
- Avaliação qualitativa por questionários.
- Gestão de redes, regiões e grupos de hospitais.
- Controle de períodos de coleta por unidade.

---

## Stack Tecnológica

| Componente      | Tecnologia                         |
|-----------------|------------------------------------|
| Runtime         | Node.js                            |
| Linguagem       | TypeScript 5                       |
| Framework HTTP  | Express 5                          |
| ORM             | TypeORM 0.3                        |
| Banco de Dados  | PostgreSQL 15                      |
| Autenticação    | JWT (jsonwebtoken) + bcrypt        |
| Validação       | express-validator                  |
| Datas           | Luxon                              |
| Upload          | Multer                             |
| E-mail          | Nodemailer                         |
| Excel           | ExcelJS                            |
| PDF             | PDFKit                             |
| HTTP Client     | Axios                              |
| Container       | Docker / Docker Compose            |

---

## Estrutura do Projeto

```
backendv1/
├── src/
│   ├── app.ts                   # Configuração do Express (middlewares, rotas)
│   ├── server.ts                # Entry point — conecta ao DB e inicia o servidor
│   ├── ormconfig.ts             # Configuração do TypeORM / DataSource
│   ├── calculoTaxaOcupacao/     # Lógica de cálculo de taxa de ocupação
│   ├── controllers/             # Controllers HTTP (request/response)
│   ├── database/                # Inicialização da conexão com o banco
│   ├── dto/                     # Data Transfer Objects (tipagens de entrada/saída)
│   ├── entities/                # Entidades TypeORM (mapeamento do banco)
│   ├── jobs/                    # Jobs agendados (ex: expiração de sessões)
│   ├── middlewares/             # Middlewares (auth, autorização, multer)
│   ├── repositories/            # Camada de acesso a dados
│   ├── routes/                  # Definição de rotas Express
│   ├── scripts/                 # Scripts de seed e migração
│   ├── services/                # Lógica de negócio
│   ├── startup/                 # Inicialização automática (seed de SCP)
│   └── utils/                   # Utilitários diversos
├── uploads/
│   ├── coleta/                  # Fotos de coletas de campo
│   └── hospital/                # Logotipos de hospitais
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

---

## Configuração e Execução

### Pré-requisitos

- Node.js ≥ 18
- Docker e Docker Compose (para o banco)

### 1. Instalar dependências

```bash
npm install
```

### 2. Subir o banco de dados

```bash
docker-compose up -d
```

Isso sobe um container PostgreSQL 15 na porta **5433** (mapeada da 5432 interna) com banco `dimensiona`.

### 3. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto (veja a seção [Variáveis de Ambiente](#variáveis-de-ambiente)).

### 4. Executar em modo desenvolvimento

```bash
npm run dev
```

O servidor inicia na porta `3110` (ou a definida em `PORT`).

### 5. Build para produção

```bash
npm run build
npm start
```

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz com as seguintes variáveis:

```env
# Banco de dados
DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=postgresDimensiona
DB_NAME=dimensiona

# JWT
JWT_SECRET=seu_segredo_jwt_aqui

# Servidor
PORT=3110

# E-mail (para reset de senha)
MAIL_HOST=smtp.seuservidor.com
MAIL_PORT=587
MAIL_USER=seu@email.com
MAIL_PASS=sua_senha_email
MAIL_FROM=noreply@dimensiona.com

# Ambiente
NODE_ENV=development
```

---

## Banco de Dados

O TypeORM opera com `synchronize: true`, o que significa que o schema é sincronizado automaticamente com as entidades ao iniciar o servidor. **Não use `synchronize: true` em produção** — prefira migrations.

O `docker-compose.yml` inclui um volume `postgres_data` para persistência e pode carregar um dump inicial via `dimensiona.sql`.

---

## Autenticação e Autorização

### Autenticação (JWT)

Todas as rotas — exceto as listadas abaixo — exigem um token JWT no header:

```
Authorization: Bearer <token>
```

O token é obtido via `POST /login` e contém: `id`, `nome`, `tipo` (permissão), `hospital`, `redeId`.

**Rotas públicas (sem token):**

| Rota                        | Descrição                        |
|-----------------------------|----------------------------------|
| `GET /`                     | Health check                     |
| `POST /login`               | Login                            |
| `GET/POST /password-reset/*`| Reset de senha                   |
| `GET /uploads/*`            | Arquivos estáticos (fotos)       |
| `GET /debug/*`              | Debug de uploads                 |
| `PATCH /*/senha`            | Troca de senha no primeiro acesso|

### Papéis de usuário

| Código | Permissão no banco                  | Descrição                                  |
|--------|-------------------------------------|--------------------------------------------|
| `ADM`  | `ADMIN`                             | Administrador global do sistema            |
| `AV`   | `AVALIADOR`                         | Avaliador de pacientes (coleta/SCP)        |
| `GTT`  | `GESTOR_TATICO_TEC_ADM`             | Gestor tático técnico-administrativo       |
| `GTC`  | `GESTOR_TATICO_TECNICO`             | Gestor tático técnico                      |
| `GTA`  | `GESTOR_TATICO_ADM`                 | Gestor tático administrativo               |
| `GEH`  | `GESTOR_ESTRATEGICO_HOSPITAL`       | Gestor estratégico de hospital             |
| `GER`  | `GESTOR_ESTRATEGICO_REDE`           | Gestor estratégico de rede                 |

### Escopo de autorização

Além do papel, o middleware de autorização valida o **escopo** de cada rota:

- **`none`** — sem restrição de escopo (apenas ADM).
- **`hospital`** — o usuário só pode acessar dados do seu próprio hospital.
- **`rede`** — o usuário (GER) só pode acessar dados da sua própria rede.

---

## Entidades

### Hospital
Entidade central. Possui tipo, gestão, perfil e complexidade como enums.

| Campo        | Tipo     | Descrição                          |
|--------------|----------|------------------------------------|
| `id`         | UUID     | PK                                 |
| `nome`       | string   | Nome do hospital                   |
| `cnpj`       | string   | CNPJ (único)                       |
| `endereco`   | string   | Endereço                           |
| `telefone`   | string   | Telefone                           |
| `tipo`       | enum     | PUBLICO / PRIVADO / FILANTROPICO / OUTROS |
| `gestao`     | enum     | GESTAO_DIRETA / ORGANIZACAO_SOCIAL / GESTAO_TERCEIRIZADA |
| `perfil`     | enum     | GERAL / ESPECIALIZADO / ENSINO_UNIVERSITARIO / ... |
| `complexidade`| enum    | BAIXA / MEDIA / ALTA / MEDIA_ALTA / BAIXA_MEDIA |
| `rede`       | Rede     | Rede à qual pertence (FK)          |
| `regiao`     | Regiao   | Região (FK)                        |

### Colaborador
Usuário do sistema (avaliador ou gestor).

| Campo                | Tipo   | Descrição                                   |
|----------------------|--------|---------------------------------------------|
| `id`                 | UUID   | PK                                          |
| `nome`               | string | Nome completo                               |
| `email`              | string | E-mail (login, único)                       |
| `cpf`                | string | CPF (único, opcional)                       |
| `coren`              | string | Registro COREN (opcional)                   |
| `permissao`          | enum   | Papel do usuário (veja tabela acima)        |
| `senha`              | string | Hash bcrypt                                 |
| `mustChangePassword` | bool   | Se `true`, força troca de senha no login    |
| `hospital`           | Hospital | Hospital vinculado (FK, nullable)         |

**Senha padrão:** CPF (sem formatação) se cadastrado, ou e-mail caso contrário.

### UnidadeInternacao / UnidadeNaoInternacao / UnidadeNeutra
Unidades do hospital. Cada tipo possui características específicas para o cálculo de dimensionamento.

### Leito
Leito pertencente a uma `UnidadeInternacao`. Possui status (`DISPONIVEL`, `OCUPADO`, `MANUTENCAO`, etc.) e registros de histórico.

### AvaliacaoSCP
Avaliação de complexidade de um paciente em um leito, em um momento. Associada a um método SCP (FUGULIN, PERROCA ou DINI).

### Coleta
Visita de campo ao hospital com fotos e registros de auditoria.

### Baseline
Cenário de referência de quadro de pessoal para um hospital. Contém os cargos e quantidades ideais por setor.

### SnapshotDimensionamento
"Fotografia" do dimensionamento calculado em um momento específico. Usado para comparações históricas.

### Rede / Regiao / Grupo
Hierarquia organizacional: `Grupo` → `Rede` → `Regiao` → `Hospital`.

### TaxaOcupacaoCustomizada
Taxa de ocupação definida manualmente para uma unidade (substitui o cálculo automático).

### ParametrosUnidade / ParametrosNaoInternacao
Parâmetros do cálculo de dimensionamento por unidade (IST, dias de trabalho por semana, etc.).

### QualitativeQuestionnaire / QualitativeCategory / QualitativeEvaluation
Questionários e avaliações qualitativas de indicadores hospitalares.

---

## API — Referência de Rotas

A URL base é `http://localhost:3110`.

---

### Autenticação

| Método | Rota     | Descrição            | Papéis   |
|--------|----------|----------------------|----------|
| `POST` | `/login` | Login e obtenção de JWT | Público |

**Request body:**
```json
{
  "email": "usuario@hospital.com",
  "senha": "senha123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "nome": "João Silva",
  "id": "uuid",
  "tipo": "GESTOR_TATICO_TEC_ADM",
  "role": "GESTOR",
  "hospital": { "id": "uuid", "nome": "Hospital Central" },
  "mustChangePassword": false
}
```

---

### Colaboradores

Base: `/colaboradores`

| Método   | Rota                   | Descrição                              | Papéis           |
|----------|------------------------|----------------------------------------|------------------|
| `GET`    | `/admin`               | Listar admins                          | ADM              |
| `POST`   | `/admin`               | Criar admin                            | ADM              |
| `DELETE` | `/admin/:id`           | Deletar admin                          | ADM              |
| `POST`   | `/`                    | Criar colaborador                      | ADM, GTT, GTA    |
| `GET`    | `/`                    | Listar colaboradores (`?hospitalId=`)  | ADM, GTT, GTA    |
| `GET`    | `/:id`                 | Buscar por ID                          | Todos autenticados|
| `PATCH`  | `/:id`                 | Atualizar dados                        | ADM              |
| `DELETE` | `/:id`                 | Deletar                                | ADM              |
| `PATCH`  | `/:id/senha`           | Trocar senha (primeiro acesso)         | Público*         |

*A rota `PATCH /:id/senha` é pública para permitir a troca de senha no primeiro acesso sem token.

---

### Hospitais

Base: `/hospitais`

| Método   | Rota                               | Descrição                                   | Papéis         |
|----------|------------------------------------|---------------------------------------------|----------------|
| `POST`   | `/`                                | Criar hospital (com upload de foto)         | ADM            |
| `GET`    | `/`                                | Listar hospitais                            | ADM            |
| `GET`    | `/:id`                             | Buscar por ID                               | Todos (scoped) |
| `PUT`    | `/:id`                             | Atualizar (com upload de foto)              | ADM            |
| `DELETE` | `/:id`                             | Deletar                                     | ADM            |
| `GET`    | `/:id/comparative`                 | Dashboard comparativo atual vs. projetado   | GEH, GER, ADM  |
| `GET`    | `/:id/ultima-atualizacao-cargo`    | Data da última atualização de cargo         | ADM, GTT, GTA  |
| `GET`    | `/:id/cargos`                      | Listar cargos do hospital                   | ADM, GTT, GTC  |
| `POST`   | `/:id/cargos`                      | Adicionar cargo ao hospital                 | ADM            |
| `PATCH`  | `/:id/cargos/:cargoId`             | Atualizar cargo do hospital                 | ADM            |
| `DELETE` | `/:id/cargos/:cargoId`             | Remover cargo do hospital                   | ADM            |

---

### Unidades de Internação

Base: `/unidades`

| Método   | Rota                              | Descrição                           | Papéis        |
|----------|-----------------------------------|-------------------------------------|---------------|
| `POST`   | `/`                               | Criar unidade                       | ADM           |
| `GET`    | `/`                               | Listar unidades (`?hospitalId=`)    | Todos         |
| `GET`    | `/:id`                            | Buscar por ID                       | Todos         |
| `PUT`    | `/:id`                            | Atualizar                           | ADM           |
| `DELETE` | `/:id`                            | Deletar                             | ADM           |
| `GET`    | `/:id/estatisticas-consolidadas`  | Estatísticas consolidadas da unidade| Todos         |
| `GET`    | `/:id/resumo-mensal`              | Resumo mensal de avaliações         | Todos         |
| `GET`    | `/:id/historico-mensal`           | Histórico mensal                    | Todos         |
| `POST`   | `/:unidadeId/comentarios`         | Adicionar comentário do dia         | Todos         |
| `GET`    | `/:unidadeId/comentarios`         | Listar comentários (`?data=`)       | Todos         |
| `DELETE` | `/:unidadeId/comentarios/:cId`    | Deletar comentário                  | ADM           |

---

### Unidades de Não-Internação

Base: `/unidades-nao-internacao`

| Método   | Rota  | Descrição                        | Papéis |
|----------|-------|----------------------------------|--------|
| `POST`   | `/`   | Criar                            | ADM    |
| `GET`    | `/`   | Listar (`?hospitalId=`)          | Todos  |
| `GET`    | `/:id`| Buscar por ID                    | Todos  |
| `PUT`    | `/:id`| Atualizar                        | ADM    |
| `DELETE` | `/:id`| Deletar                          | ADM    |

---

### Unidades Neutras

Base: `/unidades-neutras`

Mesmas operações CRUD das unidades de não-internação.

---

### Leitos

Base: `/leitos`

| Método   | Rota                      | Descrição                                              | Papéis |
|----------|---------------------------|--------------------------------------------------------|--------|
| `POST`   | `/`                       | Criar leito                                            | ADM    |
| `GET`    | `/`                       | Listar (`?unidadeId=`)                                 | Todos  |
| `GET`    | `/taxa-ocupacao-status`   | Taxa de ocupação por status (`?unidadeId=` / `?hospitalId=`) | Todos |
| `GET`    | `/taxa-ocupacao-agregada` | Taxa agregada (`?aggregationType=hospital|grupo|regiao|rede&entityId=`) | Todos |
| `PATCH`  | `/:id`                    | Atualizar leito                                        | ADM    |
| `PATCH`  | `/:id/status`             | Atualizar status do leito                              | AV, ADM|
| `POST`   | `/:id/alta`               | Dar alta ao paciente (libera o leito)                  | AV, ADM|
| `DELETE` | `/:id`                    | Deletar leito                                          | ADM    |

**Status de leito:** `DISPONIVEL` | `OCUPADO` | `MANUTENCAO` | `BLOQUEADO` | `RESERVADO`

---

### Avaliações SCP

Base: `/avaliacoes`

| Método   | Rota                              | Descrição                                             | Papéis   |
|----------|-----------------------------------|-------------------------------------------------------|----------|
| `POST`   | `/`                               | Criar avaliação (folha de coleta)                     | AV, ADM  |
| `POST`   | `/sessao`                         | Criar sessão de ocupação por leito                    | AV, ADM  |
| `POST`   | `/sessao/:id/liberar`             | Liberar sessão (alta do leito)                        | AV, ADM  |
| `PUT`    | `/sessao/:id`                     | Atualizar sessão                                      | AV, ADM  |
| `GET`    | `/sessoes-ativas`                 | Listar sessões ativas (`?unidadeId=`)                 | Todos    |
| `GET`    | `/leitos-disponiveis`             | Leitos disponíveis para nova sessão (`?unidadeId=`)   | Todos    |
| `GET`    | `/leito/:leitoId/ultimo-prontuario` | Último prontuário do leito                          | Todos    |
| `GET`    | `/taxa-ocupacao-dia`              | Taxa de ocupação do dia (`?unidadeId=` / `?hospitalId=`) | Todos |
| `GET`    | `/`                               | Listar por dia (`?data=YYYY-MM-DD&unidadeId=`)        | Todos    |
| `GET`    | `/todas`                          | Listar todas as avaliações                            | ADM      |
| `GET`    | `/unidade/:unidadeId`             | Listar por unidade                                    | Todos    |
| `GET`    | `/resumo-diario`                  | Resumo diário (`?data=YYYY-MM-DD&unidadeId=`)         | Todos    |
| `GET`    | `/consolidado-mensal`             | Consolidado mensal (`?unidadeId=&ano=&mes=`)          | Todos    |
| `GET`    | `/schema`                         | Schema de itens SCP (`?scp=FUGULIN|PERROCA|DINI`)     | Todos    |
| `GET`    | `/autor/:autorId`                 | Avaliações por autor                                  | Todos    |

**Métodos SCP suportados:** `FUGULIN`, `PERROCA`, `DINI`

---

### Coletas

Base: `/coletas`

| Método   | Rota                     | Descrição                     | Papéis |
|----------|--------------------------|-------------------------------|--------|
| `POST`   | `/`                      | Criar coleta (com upload de fotos) | ADM, AV |
| `GET`    | `/`                      | Listar coletas                | Todos  |
| `GET`    | `/hospital/:hospitalId`  | Listar por hospital           | Todos  |
| `GET`    | `/:id`                   | Buscar por ID                 | Todos  |
| `DELETE` | `/:id`                   | Deletar coleta                | ADM    |

---

### Dimensionamento

Base: `/dimensionamento`

| Método   | Rota                                         | Descrição                                      | Papéis          |
|----------|----------------------------------------------|------------------------------------------------|-----------------|
| `GET`    | `/internacao/:unidadeId`                     | Calcular dimensionamento de unidade de internação | GTT, GTC, ADM |
| `GET`    | `/nao-internacao/:unidadeId`                 | Calcular dimensionamento de não-internação     | GTT, GTC, ADM   |
| `POST`   | `/internacao/:unidadeId/projetado-final`     | Salvar projetado final (internação)            | ADM, GTT, GTC   |
| `GET`    | `/internacao/:unidadeId/projetado-final`     | Buscar projetado final (internação)            | ADM, GTT, GTC   |
| `POST`   | `/nao-internacao/:unidadeId/projetado-final` | Salvar projetado final (não-internação)        | ADM, GTT, GTC   |
| `GET`    | `/nao-internacao/:unidadeId/projetado-final` | Buscar projetado final (não-internação)        | ADM, GTT, GTC   |

O cálculo considera:
- Média de SCP por leito no período selecionado.
- Taxa de ocupação real ou customizada.
- IST (Índice de Segurança Técnica) configurável.
- Dias de trabalho por semana.
- Cargos e sítios funcionais cadastrados.

---

### Parâmetros de Unidade

Base: `/parametros`

| Método       | Rota                          | Descrição                                         | Papéis         |
|--------------|-------------------------------|---------------------------------------------------|----------------|
| `GET`        | `/unidade/:unidadeId`         | Buscar parâmetros de unidade de internação        | GTT, GTC, ADM  |
| `POST / PUT` | `/unidade/:unidadeId`         | Salvar parâmetros de internação                   | ADM, GTT, GTC  |
| `GET`        | `/nao-internacao/:unidadeId`  | Buscar parâmetros de não-internação               | GTT, GTC, ADM  |
| `POST / PUT` | `/nao-internacao/:unidadeId`  | Salvar parâmetros de não-internação               | ADM, GTT, GTC  |

**Parâmetros configuráveis:** IST (padrão 15%), dias de trabalho por semana, `aplicarIST`.

---

### Taxa de Ocupação

Base: `/taxa-ocupacao`

| Método | Rota       | Descrição                                   | Papéis         |
|--------|------------|---------------------------------------------|----------------|
| `GET`  | `/:id`     | Buscar taxa customizada de uma unidade      | GTT, GTC, ADM  |
| `POST` | `/`        | Criar/atualizar taxa customizada            | ADM, GTT, GTC  |

---

### Baselines

Base: `/baselines`

| Método   | Rota                                    | Descrição                          | Papéis        |
|----------|-----------------------------------------|------------------------------------|---------------|
| `POST`   | `/`                                     | Criar baseline                     | ADM, GTT, GTA |
| `PUT`    | `/:id`                                  | Atualizar                          | ADM, GTT, GTA |
| `GET`    | `/`                                     | Listar todos                       | Todos         |
| `GET`    | `/hospital/:hospitalId`                 | Buscar por hospital                | Todos         |
| `GET`    | `/:id`                                  | Buscar por ID                      | Todos         |
| `DELETE` | `/:id`                                  | Deletar                            | ADM, GTT, GTA |
| `PATCH`  | `/:id/setores/:setorNome/status`        | Alterar status de setor            | ADM, GTT, GTA |

---

### Snapshots de Dimensionamento

Base: `/snapshots` (também `/snapshot` para algumas sub-rotas de export)

| Método | Rota                                     | Descrição                                             | Papéis        |
|--------|------------------------------------------|-------------------------------------------------------|---------------|
| `POST` | `/hospital/:hospitalId`                  | Criar snapshot completo do hospital                   | ADM, GTT, GTA |
| `POST` | `/unidade-internacao/:unidadeId`         | Criar snapshot de unidade de internação               | ADM, GTT, GTA |
| `POST` | `/unidade-nao-internacao/:unidadeId`     | Criar snapshot de unidade de não-internação           | ADM, GTT, GTA |
| `GET`  | `/hospital/:hospitalId`                  | Listar snapshots do hospital                          | Todos         |
| `GET`  | `/hospital/:hospitalId/ultimo`           | Último snapshot                                       | Todos         |
| `GET`  | `/hospital/:hospitalId/selecionado`      | Snapshot selecionado (marcado como referência)        | Todos         |
| `GET`  | `/hospital/:hospitalId/estatisticas`     | Estatísticas dos snapshots                            | Todos         |
| `GET`  | `/aggregated`                            | Snapshot agregado por `groupBy` (rede/grupo/regiao)   | Todos         |
| `GET`  | `/aggregated/all`                        | Todos os agregados prontos para frontend              | Todos         |
| `GET`  | `/dashboard`                             | Dashboard por rede/grupo/região                       | Todos         |
| `GET`  | `/selected-by-group`                     | Snapshots selecionados por rede/grupo/região          | Todos         |

**Também disponíveis via `/`:**

| Método | Rota                                  | Descrição                            |
|--------|---------------------------------------|--------------------------------------|
| `GET`  | `/snapshot-summary/:hospitalId`       | Resumo do snapshot selecionado       |
| `GET`  | `/snapshot-summary/rede/:redeId`      | Resumo por rede                      |

---

### Termômetro

Base: `/termometro`

| Método | Rota                           | Descrição                                             | Papéis             |
|--------|--------------------------------|-------------------------------------------------------|--------------------|
| `GET`  | `/:hospitalId/global`          | Indicador global do hospital (score consolidado)      | ADM, GTT, GTC, GEH |
| `GET`  | `/:hospitalId/detalhamento`    | Detalhamento por unidade/cargo                        | ADM, GTT, GTC, GEH |
| `GET`  | `/:hospitalId/serie-historica` | Série histórica do termômetro                         | ADM, GTT, GTC, GEH |

---

### Análise de Ocupação

Base: `/hospital-sectors`

| Método | Rota                                       | Descrição                                          | Papéis |
|--------|--------------------------------------------|----------------------------------------------------|--------|
| `GET`  | `/:hospitalId/occupation-analysis`         | Análise de taxa de ocupação por setor              | Todos  |
| `GET`  | `/:hospitalId/occupation-dashboard`        | Dashboard: ocupação máxima atendível + histórico 4 meses | Todos |
| `GET`  | `/rede/:redeId/occupation-dashboard`       | Dashboard agregado por rede                        | GER    |
| `GET`  | `/:hospitalId/occupation-analysis/test`    | Endpoint de teste para o frontend                  | Todos  |

---

### Avaliação Qualitativa

Base: `/qualitative`

#### Categorias

| Método   | Rota               | Descrição         | Papéis        |
|----------|--------------------|-------------------|---------------|
| `POST`   | `/categories`      | Criar categoria   | ADM, GTT, GTA |
| `GET`    | `/categories`      | Listar categorias | Todos         |
| `PUT`    | `/categories/:id`  | Atualizar         | ADM, GTT, GTA |
| `DELETE` | `/categories/:id`  | Deletar           | ADM, GTT, GTA |

#### Questionários

| Método   | Rota                   | Descrição              | Papéis        |
|----------|------------------------|------------------------|---------------|
| `POST`   | `/questionnaires`      | Criar questionário     | ADM, GTT, GTA |
| `GET`    | `/questionnaires`      | Listar questionários   | Todos         |
| `PUT`    | `/questionnaires/:id`  | Atualizar              | ADM, GTT, GTA |
| `DELETE` | `/questionnaires/:id`  | Deletar                | ADM, GTT, GTA |

#### Avaliações

| Método   | Rota                            | Descrição                                    | Papéis        |
|----------|---------------------------------|----------------------------------------------|---------------|
| `POST`   | `/evaluations`                  | Criar avaliação                              | ADM, GTT, GTA |
| `GET`    | `/evaluations`                  | Listar avaliações (`?hospitalId=&setorId=`)  | Todos         |
| `GET`    | `/evaluations-by-sector`        | Listar por setor                             | Todos         |
| `GET`    | `/evaluations/:id`              | Buscar por ID                                | Todos         |
| `PUT`    | `/evaluations/:id`              | Atualizar                                    | ADM, GTT, GTA |
| `DELETE` | `/evaluations/:id`              | Deletar                                      | ADM, GTT, GTA |
| `GET`    | `/completed-with-categories`    | Questionários 100% completos por hospital    | Todos         |
| `GET`    | `/aggregates/by-category`       | Agregados por categoria                      | Todos         |
| `GET`    | `/aggregates/by-sector`         | Agregados por setor                          | Todos         |

---

### Controle de Período

Base: `/controle-periodo`

| Método | Rota   | Descrição                                          | Papéis        |
|--------|--------|----------------------------------------------------|---------------|
| `GET`  | `/`    | Listar períodos (`?unidadeId=` / `?hospitalId=`)   | Todos         |
| `POST` | `/`    | Criar/atualizar controle de período por unidade    | ADM, GTT, GTC |

Permite travar ou definir o intervalo de coleta de dados por unidade.

---

### Redes, Regiões e Grupos

#### Redes — Base: `/redes`

| Método       | Rota    | Descrição       | Papéis      |
|--------------|---------|-----------------|-------------|
| `GET`        | `/`     | Listar          | ADM, GER    |
| `GET`        | `/:id`  | Buscar por ID   | ADM, GER    |
| `POST`       | `/`     | Criar           | ADM         |
| `PUT/PATCH`  | `/:id`  | Atualizar       | ADM         |
| `DELETE`     | `/:id`  | Deletar         | ADM         |

#### Regiões — Base: `/regioes`

CRUD completo, apenas ADM.

#### Grupos — Base: `/grupos`

CRUD completo, apenas ADM.

---

### Cargos

#### Cargos globais — Base: `/cargos`

CRUD completo, apenas ADM.

#### Cargos por hospital — Base: `/hospitais/:hospitalId/cargos`

Veja a seção [Hospitais](#hospitais).

---

### Sítios e Posições Funcionais

Base: `/sitios`

| Método   | Rota           | Descrição                    | Papéis |
|----------|----------------|------------------------------|--------|
| `POST`   | `/`            | Criar sítio funcional        | ADM    |
| `GET`    | `/`            | Listar (`?hospitalId=`)      | Todos  |
| `GET`    | `/:id`         | Buscar por ID                | Todos  |
| `PUT`    | `/:id`         | Atualizar                    | ADM    |
| `DELETE` | `/:id`         | Deletar                      | ADM    |
| `GET`    | `/:id/posicoes`| Listar posições do sítio     | Todos  |

---

### Exportações

Base: `/export`

| Método | Rota                                          | Descrição                                           |
|--------|-----------------------------------------------|-----------------------------------------------------|
| `GET`  | `/relatorios/resumo-diario.xlsx`              | Relatório diário em Excel                           |
| `GET`  | `/relatorios/mensal.xlsx`                     | Relatório mensal em Excel                           |
| `GET`  | `/dimensionamento/:unidadeId/pdf`             | PDF de dimensionamento (`?inicio=&fim=`)            |
| `GET`  | `/snapshot/:hospitalId/variacao/pdf`          | PDF de variação de snapshot (`?tipo=&escopo=&unidadeId=`) |
| `GET`  | `/diario-avaliacoes/:unidadeId/pdf`           | PDF diário de avaliações (`?data=YYYY-MM-DD`)       |
| `GET`  | `/grau-complexidade/:unidadeId/pdf`           | PDF grau de complexidade (`?inicio=&fim=`)          |

**Parâmetros de variação de snapshot:**
- `tipo`: `MAPA` | `DETALHAMENTO`
- `escopo`: `QUANTIDADE` | `FINANCEIRO` | `GERAL`
- `unidadeId` (opcional): filtra para uma unidade específica

---

### Relatórios

Base: `/relatorios`

Rotas de relatórios gerenciais agregados (por hospital, período, etc.).

---

### Estatísticas

Base: `/estatisticas`

| Método | Rota                          | Descrição                              |
|--------|-------------------------------|----------------------------------------|
| `GET`  | `/`                           | Estatísticas gerais                    |
| `GET`  | `/hospital/:hospitalId/...`   | Estatísticas por hospital              |

---

### Métodos SCP

Base: `/scp-metodos`

| Método       | Rota              | Descrição                           | Papéis |
|--------------|-------------------|-------------------------------------|--------|
| `GET`        | `/`               | Listar métodos                      | Todos  |
| `GET`        | `/:id`            | Buscar por ID                       | Todos  |
| `POST`       | `/`               | Criar método                        | ADM    |
| `PUT/PATCH`  | `/:id`            | Atualizar                           | ADM    |
| `DELETE`     | `/:id`            | Deletar                             | ADM    |
| `POST`       | `/seed/builtin`   | Seed dos métodos padrão (público)   | Público|

---

### Reset de Senha

Base: `/password-reset` (público)

| Método   | Rota          | Descrição                                 |
|----------|---------------|-------------------------------------------|
| `POST`   | `/`           | Solicitar reset (envia e-mail com link)   |
| `POST`   | `/confirm`    | Confirmar reset com token e nova senha    |
| `DELETE` | `/cleanup`    | Limpar tokens expirados (ADM)             |

---

### Cache

Base: `/cache` (apenas ADM)

| Método   | Rota    | Descrição                     |
|----------|---------|-------------------------------|
| `GET`    | `/`     | Ver estado do cache           |
| `DELETE` | `/`     | Invalidar cache               |

---

### Jobs

Base: `/jobs` (apenas ADM)

| Método | Rota                | Descrição                                  |
|--------|---------------------|--------------------------------------------|
| `POST` | `/session-expiry`   | Executar manualmente expiração de sessões  |
| `GET`  | `/session-expiry`   | Verificar status do job                    |

---

## Jobs Agendados

### Expiração de Sessões (`sessionExpiry`)

Expira automaticamente sessões de avaliação (ocupação de leitos) que passaram da data/hora programada. Executa:

- **Na inicialização:** processa pendências de dias anteriores.
- **Periodicamente:** agendado via `scheduleSessionExpiry`.

Para executar manualmente:

```bash
npm run job:expiry
```

---

## Upload de Arquivos

Arquivos enviados ficam na pasta `uploads/` e são servidos estaticamente em `/uploads/*` (sem autenticação).

| Contexto    | Pasta              | Campo do form     | Rota de acesso             |
|-------------|--------------------|-------------------|----------------------------|
| Foto do hospital | `uploads/hospital/` | `foto`       | `/uploads/hospital/<nome>` |
| Fotos de coleta  | `uploads/coleta/`   | qualquer campo | `/uploads/coleta/<nome>` |

---

## Scripts Utilitários

```bash
# Preparar tabelas de qualitativo
npm run db:prepare:qualitative

# Popular banco com dados de exemplo
npm run seed

# Recriar banco e popular do zero
npm run seed:fresh

# Migrar avaliações legadas
npm run seed:avaliacoes

# Importar avaliações de Excel
npm run import:avaliacoes

# Executar job de expiração manualmente
npm run job:expiry
```

---

## Health Check

```http
GET /
```

Retorna `{ "message": "API ON" }` com status 200. Não requer autenticação.
