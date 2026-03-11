# Dimensiona — Documentação da API

**Base URL:** `http://localhost:3110`  
**Formato:** JSON (exceto endpoints que retornam PDF/XLSX)  
**Autenticação:** JWT Bearer token — `Authorization: Bearer <token>`

---

## Sumário

1. [Autenticação](#1-autenticação)
2. [Reset de Senha](#2-reset-de-senha)
3. [Hospitais](#3-hospitais)
4. [Cargos por Hospital](#4-cargos-por-hospital)
5. [Unidades de Internação](#5-unidades-de-internação)
6. [Unidades de Não-Internação](#6-unidades-de-não-internação)
7. [Unidades Neutras](#7-unidades-neutras)
8. [Leitos](#8-leitos)
9. [Cargos Globais](#9-cargos-globais)
10. [Colaboradores](#10-colaboradores)
11. [Avaliações SCP (Sessões de Ocupação)](#11-avaliações-scp-sessões-de-ocupação)
12. [Coletas](#12-coletas)
13. [Sítios Funcionais e Cargos por Sítio](#13-sítios-funcionais-e-cargos-por-sítio)
14. [Parâmetros de Unidades de Internação](#14-parâmetros-de-unidades-de-internação)
15. [Parâmetros de Unidades de Não-Internação](#15-parâmetros-de-unidades-de-não-internação)
16. [Taxa de Ocupação Customizada](#16-taxa-de-ocupação-customizada)
17. [Dimensionamento](#17-dimensionamento)
18. [Snapshots de Dimensionamento](#18-snapshots-de-dimensionamento)
19. [Baselines](#19-baselines)
20. [Hospital Sectors (Setores Agregados)](#20-hospital-sectors-setores-agregados)
21. [Análise de Ocupação](#21-análise-de-ocupação)
22. [Estatísticas e Relatórios](#22-estatísticas-e-relatórios)
23. [Exportações (PDF / XLSX)](#23-exportações-pdf--xlsx)
24. [Redes, Regiões e Grupos](#24-redes-regiões-e-grupos)
25. [SCP Métodos](#25-scp-métodos)
26. [Controle de Período](#26-controle-de-período)
27. [Status de Leitos](#27-status-de-leitos)
28. [Avaliação Qualitativa](#28-avaliação-qualitativa)
29. [Jobs / Utilitários](#29-jobs--utilitários)
30. [Cache](#30-cache)
31. [Status da API](#31-status-da-api)

---

## 1. Autenticação

### `POST /login`
Autentica colaborador ou administrador e retorna JWT.

**Acesso:** Público

**Body:**
```json
{
  "email": "string",
  "senha": "string"
}
```

**Resposta 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "colaborador": { "id": "uuid", "nome": "string", "email": "string" }
}
```

---

## 2. Reset de Senha

### `POST /password-reset/request`
Envia e-mail com token de reset.

**Body:** `{ "email": "string" }`

### `POST /password-reset/reset`
Redefine a senha usando o token recebido.

**Body:** `{ "token": "string", "newPassword": "string" }`

### `GET /password-reset/verify/:token`
Verifica se o token de reset é válido.

### `DELETE /password-reset/cleanup`
Remove tokens expirados (uso administrativo).

---

## 3. Hospitais

### `POST /hospitais`
Cria um hospital. Suporta upload de foto via `multipart/form-data`.

**Body (form-data):**
| Campo | Tipo | Obrigatório |
|---|---|---|
| nome | string | ✓ |
| foto | file (imagem) | — |
| ... demais campos do hospital | | |

### `GET /hospitais`
Lista todos os hospitais.

### `GET /hospitais/:id`
Retorna um hospital pelo ID.

### `PUT /hospitais/:id`
Atualiza hospital. Suporta upload de foto.

### `DELETE /hospitais/:id`
Remove hospital.

### `GET /hospitais/:id/comparative`
Retorna comparativo atual vs projetado para o dashboard do hospital.

### `GET /hospitais/:id/ultima-atualizacao-cargo`
Retorna a data da última atualização de cargo do hospital.

---

## 4. Cargos por Hospital

Cargos específicos vinculados a um hospital.

### `POST /hospitais/:hospitalId/cargos`
Cria cargo para o hospital.

**Body:**
```json
{
  "nome": "string",
  "salario": "string",
  "adicionais_tributos": "string",
  "carga_horaria": "string"
}
```

### `GET /hospitais/:hospitalId/cargos`
Lista cargos do hospital.

### `GET /hospitais/:hospitalId/cargos/:cargoId`
Retorna cargo específico.

### `PATCH /hospitais/:hospitalId/cargos/:cargoId`
Atualiza cargo.

### `DELETE /hospitais/:hospitalId/cargos/:cargoId`
Remove cargo.

---

## 5. Unidades de Internação

### `POST /unidades`
Cria unidade de internação.

### `GET /unidades`
Lista unidades. Query opcional: `?hospitalId=uuid`

### `GET /unidades/:id`
Retorna unidade.

### `PUT /unidades/:id`
Atualiza unidade.

### `DELETE /unidades/:id`
Remove unidade.

### `GET /unidades/:id/estatisticas-consolidadas`
Retorna estatísticas consolidadas da unidade (ocupação, SCP).

### `GET /unidades/:id/resumo-mensal`
Resumo mensal de ocupação. Query: `?ano=YYYY&mes=M`

### `GET /unidades/:id/historico-mensal`
Histórico mensal. Query: `?meses=N` (padrão 6 meses)

---

## 6. Unidades de Não-Internação

### `POST /unidades-nao-internacao`
Cria unidade de não-internação (ambulatório, SADT, etc.).

### `GET /unidades-nao-internacao`
Lista todas.

### `GET /unidades-nao-internacao/hospital/:hospitalId`
Lista por hospital.

### `GET /unidades-nao-internacao/:id`
Retorna unidade.

### `PUT /unidades-nao-internacao/:id`
Atualiza unidade. Inclui campos `horas_extra_reais` e `horas_extra_projetadas`.

### `DELETE /unidades-nao-internacao/:id`
Remove unidade.

### `GET /unidades-nao-internacao/:id/estatisticas`
Estatísticas desta unidade.

### `POST /unidades-nao-internacao/:unidadeId/sitios`
Cria sítio funcional vinculado à unidade (atalho de compatibilidade).

### `PUT /unidades-nao-internacao/:unidadeId/sitios/:sitioId`
Atualiza sítio funcional (atalho de compatibilidade).

---

## 7. Unidades Neutras

Unidades sem internação e sem dimensionamento (ex.: administração).

### `POST /unidades-neutras`
### `GET /unidades-neutras`
### `GET /unidades-neutras/hospital/:hospitalId`
### `GET /unidades-neutras/:id`
### `PUT /unidades-neutras/:id`
### `DELETE /unidades-neutras/:id`

---

## 8. Leitos

### `POST /leitos`
Cria leito.

**Body:** `{ "unidadeId": "uuid", "identificacao": "string", ... }`

### `GET /leitos`
Lista leitos. Query: `?unidadeId=uuid`

### `GET /leitos/taxa-ocupacao-status`
Taxa de ocupação por status atual dos leitos.

**Query:** `?unidadeId=uuid` ou `?hospitalId=uuid` (sem params = todos)

### `GET /leitos/taxa-ocupacao-agregada`
Taxa de ocupação agregada.

**Query:**
- `aggregationType`: `hospital` | `grupo` | `regiao` | `rede`
- `entityId`: uuid da entidade (opcional)

### `PATCH /leitos/:id`
Atualiza leito.

### `PATCH /leitos/:id/status`
Atualiza status do leito (`ocupado`, `vago`, `inativo`, `pendente`).

**Body:** `{ "status": "string" }`

### `POST /leitos/:id/alta`
Dá alta ao paciente do leito.

### `DELETE /leitos/:id`
Remove leito.

---

## 9. Cargos Globais

Cargos não vinculados a hospital específico.

### `POST /cargos`
### `GET /cargos`
### `GET /cargos/:id`
### `PATCH /cargos/:id`
### `DELETE /cargos/:id`

---

## 10. Colaboradores

### `GET /colaboradores/admin`
Lista administradores.

### `POST /colaboradores/admin`
Cria administrador.

### `DELETE /colaboradores/admin/:id`
Remove administrador.

### `POST /colaboradores`
Cria colaborador.

**Body:**
```json
{
  "nome": "string",
  "email": "string",
  "senha": "string",
  "hospitalId": "uuid",
  "unidadeId": "uuid"
}
```

### `GET /colaboradores`
Lista colaboradores. Query: `?unidadeId=uuid`

### `GET /colaboradores/:id`
### `PATCH /colaboradores/:id`
### `DELETE /colaboradores/:id`

### `PATCH /colaboradores/:id/senha`
Altera senha do colaborador.

**Body:** `{ "senhaAtual": "string", "novaSenha": "string" }`

---

## 11. Avaliações SCP (Sessões de Ocupação)

Fluxo principal: **criar sessão → atualizar → liberar** ao dar alta.

### `POST /avaliacoes/sessao`
Cria nova sessão de ocupação (abre internação no leito).

**Body:**
```json
{
  "leitoId": "uuid",
  "unidadeId": "uuid",
  "scp": "FUGULIN | PERROCA | DINI",
  "itens": { "...": 0 },
  "colaboradorId": "uuid",
  "prontuario": "string (opcional)"
}
```

**Resposta 201:** `{ "sessao": { "id": "uuid", "classificacao": "INTERMEDIARIOS", ... } }`

### `PUT /avaliacoes/sessao/:id`
Atualiza avaliação SCP de uma sessão ativa.

### `POST /avaliacoes/sessao/:id/liberar`
Libera a sessão (alta do paciente, libera o leito).

### `GET /avaliacoes/sessoes-ativas`
Lista sessões ativas (leitos ocupados).

**Query:** `?unidadeId=uuid`

### `GET /avaliacoes/leitos-disponiveis`
Lista leitos disponíveis para nova ocupação.

**Query:** `?unidadeId=uuid`

### `GET /avaliacoes/leito/:leitoId/ultimo-prontuario`
Retorna último prontuário registrado no leito.

### `GET /avaliacoes/taxa-ocupacao-dia`
Taxa de ocupação atual do dia.

**Query:** `?unidadeId=uuid` ou `?hospitalId=uuid`

### `GET /avaliacoes`
Lista avaliações por dia.

**Query:** `?data=YYYY-MM-DD&unidadeId=uuid`

### `GET /avaliacoes/todas`
Lista todas as avaliações.

### `GET /avaliacoes/unidade/:unidadeId`
Lista avaliações de uma unidade.

### `GET /avaliacoes/resumo-diario`
Resumo diário de ocupação e SCP.

**Query:** `?data=YYYY-MM-DD&unidadeId=uuid`

**Resposta:**
```json
{
  "totalOcupados": 12,
  "distribuicao": {
    "MINIMOS": 3,
    "INTERMEDIARIOS": 5,
    "ALTA_DEPENDENCIA": 2,
    "SEMI_INTENSIVOS": 1,
    "INTENSIVOS": 1
  }
}
```

### `GET /avaliacoes/consolidado-mensal`
Consolidado mensal de classificações SCP.

**Query:** `?unidadeId=uuid&ano=2025&mes=5`

### `GET /avaliacoes/schema`
Retorna estrutura de campos do instrumento SCP.

**Query:** `?scp=FUGULIN | PERROCA | DINI`

### `GET /avaliacoes/autor/:autorId`
Lista avaliações de um colaborador.

### `POST /avaliacoes`
Cria avaliação (folha de coleta — fluxo legado).

---

## 12. Coletas

Registros de coleta de dados (formulários com fotos).

### `POST /coletas`
Cria coleta com upload de fotos (`multipart/form-data`).

### `GET /coletas`
Lista todas as coletas.

### `GET /coletas/hospital/:hospitalId`
Lista coletas de um hospital.

### `GET /coletas/:id`
Retorna coleta.

### `DELETE /coletas/:id`
Remove coleta.

---

## 13. Sítios Funcionais e Cargos por Sítio

Usados exclusivamente pelas **unidades de não-internação**.

### `POST /sitios/sitios-funcionais`
Cria sítio funcional.

**Body:**
```json
{
  "unidadeId": "uuid",
  "nome": "string",
  "descricao": "string (opcional)"
}
```

### `GET /sitios/sitios-funcionais`
Lista sítios. Query: `?unidadeId=uuid`

### `GET /sitios/sitios-funcionais/:id`
Retorna sítio.

### `GET /sitios/sitios-funcionais/:id/posicoes`
Lista posições (cargos por turno) do sítio.

### `GET /sitios/sitios-funcionais/:id/distribuicoes`
Retorna distribuições de ENF/TEC por turno do sítio.

**Resposta:**
```json
[
  {
    "id": "uuid",
    "categoria": "ENF",
    "segSexManha": 2,
    "segSexTarde": 2,
    "segSexNoite1": 1,
    "segSexNoite2": 1,
    "sabDomManha": 1,
    "sabDomTarde": 1,
    "sabDomNoite1": 1,
    "sabDomNoite2": 1
  }
]
```

### `PUT /sitios/sitios-funcionais/:id`
Atualiza sítio.

### `DELETE /sitios/sitios-funcionais/:id`
Remove sítio.

### `GET /sitios/unidades-nao-internacao/:id/sitios`
Lista sítios de uma unidade.

### `GET /sitios/unidades-nao-internacao/:id/sitios/resumo-distribuicoes`
Resumo consolidado de distribuições ENF/TEC por unidade.

### `GET /sitios/sitios-funcionais/:id/cargos`
Lista cargos atribuídos ao sítio.

### `POST /sitios/sitios-funcionais/:id/cargos`
Associa cargo ao sítio.

**Body:**
```json
{
  "cargoUnidadeId": "uuid",
  "quantidade_funcionarios": 3
}
```

### `GET /sitios/sitios-funcionais/cargos/:id`
Retorna vínculo cargo-sítio.

### `PATCH /sitios/sitios-funcionais/cargos/:id`
Atualiza vínculo (ex.: quantidade).

### `DELETE /sitios/sitios-funcionais/cargos/:id`
Remove vínculo.

---

## 14. Parâmetros de Unidades de Internação

Configurações usadas no cálculo do dimensionamento pela metodologia SCP/NHppd.

### `GET /parametros/unidade/:unidadeId`
Retorna parâmetros.

**Resposta:**
```json
{
  "id": "uuid",
  "ist": 0.15,
  "aplicarIST": false,
  "diasSemana": 7,
  "cargaHorariaEnfermeiro": 36,
  "cargaHorariaTecnico": 36
}
```

### `POST /parametros/unidade/:unidadeId`
Cria ou atualiza parâmetros.

### `DELETE /parametros/unidade/:unidadeId`
Remove parâmetros.

---

## 15. Parâmetros de Unidades de Não-Internação

### `GET /parametros/nao-internacao/:unidadeId`

**Resposta:**
```json
{
  "jornadaSemanalEnfermeiro": 36,
  "jornadaSemanalTecnico": 36,
  "indiceSegurancaTecnica": 0,
  "equipeComRestricao": false,
  "diasFuncionamentoMensal": 30,
  "diasSemana": 5
}
```

### `POST /parametros/nao-internacao/:unidadeId`
Cria ou atualiza.

### `DELETE /parametros/nao-internacao/:unidadeId`

---

## 16. Taxa de Ocupação Customizada

Permite sobrescrever a taxa de ocupação calculada com um valor fixo.

### `POST /taxa-ocupacao`
**Body:** `{ "unidadeId": "uuid", "taxa": 0.85 }`

### `GET /taxa-ocupacao/:unidadeId`

### `DELETE /taxa-ocupacao/:unidadeId`

---

## 17. Dimensionamento

Cálculo de pessoal de enfermagem necessário por unidade.

---

### Internação — Cálculo (SCP + NHppd + Taxa de Ocupação)

#### `GET /dimensionamento/internacao/:unidadeId`
Calcula dimensionamento para unidade de internação.

**Query:**
- `inicio` (opcional): `YYYY-MM-DD` — início do período de análise
- `fim` (opcional): `YYYY-MM-DD` — fim do período

**Resposta:**
```json
{
  "tabela": [
    {
      "cargoId": "uuid",
      "cargoNome": "Enfermeiro",
      "quantidadeAtual": 5,
      "quantidadeProjetada": 7,
      "kmCargo": 0.2857,
      "salario": 5000,
      "custoPorFuncionario": 6500
    }
  ],
  "parametros": {
    "ist": 0.15,
    "diasSemana": 7,
    "cargaHorariaEnfermeiro": 36,
    "cargaHorariaTecnico": 36
  },
  "taxaOcupacao": {
    "taxa": 0.8,
    "percentualLeitosAvaliados": 92.5,
    "leitosOcupados": 16,
    "leitosVagos": 3,
    "leitosInativos": 1,
    "totalLeitos": 20
  },
  "dimensionamento": {
    "totalHorasEnfermagem": 120,
    "percentualEnfermeiro": 0.33,
    "percentualTecnico": 0.67,
    "pessoalEnfermeiro": 4,
    "pessoalTecnico": 8
  }
}
```

---

### Não-Internação — Cálculo (Distribuição de Turnos × KM)

#### `GET /dimensionamento/nao-internacao/:unidadeId`
Calcula dimensionamento para unidade de não-internação.

**Fórmula:**
```
KM_enf = (periodoTrabalho / jornadaEnf) × (fatorBase + indiceSeguranca)
KM_tec = (periodoTrabalho / jornadaTec) × (fatorBase + indiceSeguranca)
quantidadeCalculada(ENF) = round(KM_enf × Σ totalHorasENF por sítio)
quantidadeCalculada(TEC) = round(KM_tec × Σ totalHorasTEC por sítio)
```

**Resposta:**
```json
{
  "tabela": [
    {
      "id": "uuid-sitio",
      "nome": "Sítio A",
      "cargos": [
        {
          "cargoId": "uuid",
          "cargoNome": "Enfermeiro",
          "quantidadeAtual": 3,
          "quantidadeProjetada": 4,
          "isScpCargo": true
        }
      ]
    }
  ],
  "parametros": {
    "jornadaSemanalEnfermeiro": 36,
    "jornadaSemanalTecnico": 36,
    "indiceSegurancaTecnica": 0,
    "equipeComRestricao": false,
    "diasSemana": 5,
    "periodoTrabalho": 4
  },
  "dimensionamento": {
    "kmEnfermeiro": 0.4444,
    "kmTecnico": 0.4444,
    "pessoalEnfermeiroArredondado": 4,
    "pessoalTecnicoArredondado": 6
  },
  "distribuicao": {
    "porSitio": [],
    "totais": { "enfermeiro": 18, "tecnico": 27 }
  }
}
```

> O resultado é **automaticamente persistido** na tabela `dimensionamento_nao_internacao` a cada chamada.

---

### Projetado Final — Internação

#### `POST /dimensionamento/internacao/:unidadeId/projetado-final`
Salva os quantitativos finais definidos pela gestão para cada cargo.

**Body:**
```json
{
  "cargos": [
    { "cargoId": "uuid", "projetadoFinal": 7, "observacao": "string" }
  ]
}
```

#### `GET /dimensionamento/internacao/:unidadeId/projetado-final`
Retorna projetado final salvo.

---

### Projetado Final — Não-Internação

#### `POST /dimensionamento/nao-internacao/:unidadeId/projetado-final`
Salva projetado final por sítio e cargo.

**Body:**
```json
{
  "sitios": [
    {
      "sitioId": "uuid",
      "cargos": [
        { "cargoId": "uuid", "projetadoFinal": 4, "observacao": "string" }
      ]
    }
  ]
}
```

#### `GET /dimensionamento/nao-internacao/:unidadeId/projetado-final`
Retorna projetado final por sítio.

---

## 18. Snapshots de Dimensionamento

> **Todas as rotas requerem autenticação JWT.**

Snapshots salvam o estado completo do dimensionamento (calculado + projetado final) em um momento específico. Apenas **um snapshot pode estar selecionado** por hospital por vez.

---

### Criar

#### `POST /snapshot/hospital/:hospitalId`
Cria snapshot completo do hospital (todas as unidades internação + não-internação).

**Body:** `{ "observacao": "string (opcional)" }`

**Resposta 201:**
```json
{
  "message": "Snapshot do hospital criado com sucesso",
  "snapshot": { "id": "uuid", "nome": "2025-01-15 10:30", "selecionado": false }
}
```

#### `POST /snapshot/unidade-internacao/:unidadeId`
Snapshot apenas da unidade de internação.

**Body:** `{ "hospitalId": "uuid", "observacao": "string" }`

#### `POST /snapshot/unidade-nao-internacao/:unidadeId`
Snapshot apenas da unidade de não-internação.

**Body:** `{ "hospitalId": "uuid", "observacao": "string" }`

---

### Buscar

#### `GET /snapshot/hospital/:hospitalId`
Lista snapshots do hospital.

**Query:** `?limite=N`

#### `GET /snapshot/hospital/:hospitalId/ultimo`
Retorna o snapshot mais recente.

#### `GET /snapshot/hospital/:hospitalId/selecionado`
Retorna o snapshot atualmente selecionado (usado nos relatórios).

#### `GET /snapshot/hospital/:hospitalId/estatisticas`
Estatísticas dos snapshots do hospital.

#### `GET /snapshot/:id`
Retorna snapshot pelo ID.

#### `GET /snapshot/comparar/:id1/:id2`
Compara dois snapshots.

---

### Agregações

#### `GET /snapshot/aggregated`
Agrega snapshot por entidade.

**Query:** `?snapshotId=uuid&groupBy=rede|grupo|regiao|hospital`

#### `GET /snapshot/aggregated/all`
Retorna agregados para todas as entidades (hospital, regiao, grupo, rede) de uma vez.

#### `GET /snapshot/dashboard`
Dashboard comparando snapshot selecionado vs situação atual por rede/grupo/região.

**Query:** `?tipo=rede|grupo|regiao&id=uuid`

#### `GET /snapshot/selected-by-group`
Snapshots selecionados filtrados por rede, grupo ou região.

**Query:** `?tipo=rede|grupo|regiao&id=uuid`

---

### Atualizar / Remover

#### `PATCH /snapshot/:id/selecionado`
Ativa ou desativa a seleção do snapshot.

**Body:** `{ "selecionado": true }`

#### `DELETE /snapshot/limpar`
Remove snapshots antigos não selecionados.

---

## 19. Baselines

Linha de base do quadro de pessoal atual.

### `POST /baselines`
### `PUT /baselines/:id`
### `GET /baselines`
### `GET /baselines/hospital/:hospitalId`
### `GET /baselines/:id`
### `DELETE /baselines/:id`

### `PATCH /baselines/:id/setores/:setorNome/status`
Ativa ou inativa um setor na baseline.

### `GET /hospitals/:hospitalId/snapshots/latest/summary`
Resumo do snapshot mais recente do hospital (cargos, custos, projetado vs. atual).

---

## 20. Hospital Sectors (Setores Agregados)

Visão consolidada de todos os setores de um hospital (internação + não-internação).

### `GET /hospital-sectors/:hospitalId`
Retorna todos os setores de um hospital com dados de quadro atual.

---

### Agregações por Entidade

#### `GET /hospital-sectors-aggregate/all`
Todos os hospitais agrupados.

#### `GET /hospital-sectors-aggregate/hospitals/all-aggregated`
Todos os hospitais com dados agregados.

#### `GET /hospital-sectors-aggregate/networks/all-aggregated`
Todas as redes.

#### `GET /hospital-sectors-aggregate/groups/all-aggregated`
Todos os grupos.

#### `GET /hospital-sectors-aggregate/regions/all-aggregated`
Todas as regiões.

---

### Dados Projetados

#### `GET /hospital-sectors-aggregate/hospitals/all-projected-aggregated`
#### `GET /hospital-sectors-aggregate/networks/all-projected-aggregated`
#### `GET /hospital-sectors-aggregate/groups/all-projected-aggregated`
#### `GET /hospital-sectors-aggregate/regions/all-projected-aggregated`

Retornam setores agregados por **nome** dentro de cada entidade, incluindo dados **atuais e projetados**.

#### `GET /hospital-sectors-aggregate/hospitals/:hospitalId/projected`
#### `GET /hospital-sectors-aggregate/rede/:redeId/projected`
#### `GET /hospital-sectors-aggregate/grupo/:grupoId/projected`
#### `GET /hospital-sectors-aggregate/regiao/:regiaoId/projected`

---

### Comparativo (Atual + Projetado do Snapshot Selecionado)

#### `GET /hospital-sectors-aggregate/hospitals/:hospitalId/comparative`
#### `GET /hospital-sectors-aggregate/rede/:redeId/comparative`
#### `GET /hospital-sectors-aggregate/grupo/:grupoId/comparative`
#### `GET /hospital-sectors-aggregate/regiao/:regiaoId/comparative`

Retorna comparativo usando o **snapshot selecionado** do mesmo hospital/entidade.

---

### Rede — Visão por Hospital

#### `GET /hospital-sectors-network/rede/:redeId`
#### `GET /hospital-sectors-network/grupo/:grupoId`
#### `GET /hospital-sectors-network/regiao/:regiaoId`

---

## 21. Análise de Ocupação

### `GET /hospital-sectors/:hospitalId/occupation-analysis`
Análise de taxa de ocupação de todos os setores do hospital.

**Resposta:**
```json
{
  "hospitalId": "uuid",
  "hospitalName": "Hospital X",
  "sectors": [
    {
      "sectorId": "uuid",
      "sectorName": "UTI Adulto",
      "taxaOcupacao": 85.5,
      "ociosidade": 0,
      "superlotacao": 0,
      "totalLeitos": 20,
      "leitosOcupados": 17
    }
  ],
  "summary": {
    "taxaOcupacao": 76.19,
    "totalLeitos": 250,
    "leitosOcupados": 190
  }
}
```

### `GET /hospital-sectors/:hospitalId/occupation-dashboard`
Dashboard com ocupação máxima atendível e histórico dos últimos 4 meses.

### `GET /hospital-sectors/rede/:redeId/occupation-dashboard`
Dashboard de ocupação agregado por rede.

### `GET /hospital-sectors/rede/:redeId/occupation-analysis`
### `GET /hospital-sectors/grupo/:grupoId/occupation-analysis`
### `GET /hospital-sectors/regiao/:regiaoId/occupation-analysis`

### `POST /hospital-sectors/occupation-analysis/simulate`
Simulação de projeção a partir de inputs customizados (debug).

---

### Rede/Grupo/Região

#### `GET /occupation-analysis-network/rede/:redeId`
#### `GET /occupation-analysis-network/grupo/:grupoId`
#### `GET /occupation-analysis-network/regiao/:regiaoId`

**Query:** `?dataReferencia=YYYY-MM-DD` (opcional)

---

## 22. Estatísticas e Relatórios

### `GET /unidades-nao-internacao/:id/relatorio-mensal` 🔒
Relatório mensal completo da unidade. Query: `?mes=M&ano=YYYY`

### `GET /sitios/:id/estatisticas` 🔒
Estatísticas de um sítio funcional.

### `GET /estatisticas/unidade/:id/json`
Estatísticas completas da unidade em JSON.

### `GET /estatisticas/unidade/:id/pdf`
Estatísticas da unidade em PDF.

### `GET /estatisticas/hospital/:id/json`
Estatísticas do hospital.

### `GET /estatisticas/hospital/:id/pdf`
Estatísticas do hospital em PDF.

### `GET /relatorios/resumo-diario`
Resumo diário. Query: `?data=YYYY-MM-DD&unidadeId=uuid`

### `GET /relatorios/mensal`
Relatório mensal. Query: `?unidadeId=uuid&ano=YYYY&mes=M`

---

## 23. Exportações (PDF / XLSX)

### `GET /export/relatorios/resumo-diario.xlsx`
Exporta resumo diário em Excel.

**Query:** `?unidadeId=uuid&data=YYYY-MM-DD`

### `GET /export/relatorios/mensal.xlsx`
Exporta relatório mensal em Excel.

**Query:** `?unidadeId=uuid&ano=YYYY&mes=M`

### `GET /export/dimensionamento/:unidadeId/pdf`
Exporta PDF de dimensionamento de unidade de internação.

**Query:**
- `inicio` (opcional): `YYYY-MM-DD`
- `fim` (opcional): `YYYY-MM-DD`

### `GET /export/snapshot/:hospitalId/variacao/pdf`
Exporta PDF de variação do snapshot selecionado vs. situação atual.

**Query:**
| Parâmetro | Valores | Padrão |
|---|---|---|
| `tipo` | `MAPA` \| `DETALHAMENTO` | `MAPA` |
| `escopo` | `QUANTIDADE` \| `FINANCEIRO` \| `GERAL` | `QUANTIDADE` |

`MAPA` — visão resumida por setor (retrato)
`DETALHAMENTO` — linha por cargo (paisagem)
`QUANTIDADE` — colunas: Atual / Baseline / Calculado / Projetado / Ajuste
`FINANCEIRO` — colunas em R$
`GERAL` — quantidade + R$ combinados

**Resposta:** `application/pdf`

---

## 24. Redes, Regiões e Grupos

Hierarquia organizacional: **Rede > Região > Grupo > Hospital**

### Redes

| Método | Rota | Descrição |
|---|---|---|
| POST | `/redes` | Criar rede |
| GET | `/redes` | Listar redes |
| GET | `/redes/:id` | Buscar rede |
| GET | `/redes/:id/ultima-atualizacao-cargo` | Última atualização de cargo na rede |
| PUT | `/redes/:id` | Atualizar |
| DELETE | `/redes/:id` | Remover |

### Regiões

| Método | Rota | Descrição |
|---|---|---|
| POST | `/regioes` | Criar região |
| GET | `/regioes` | Listar |
| GET | `/regioes/:id` | Buscar |
| PUT | `/regioes/:id` | Atualizar |
| DELETE | `/regioes/:id` | Remover |

### Grupos

| Método | Rota | Descrição |
|---|---|---|
| POST | `/grupos` | Criar grupo |
| GET | `/grupos` | Listar |
| GET | `/grupos/:id` | Buscar |
| PUT | `/grupos/:id` | Atualizar |
| DELETE | `/grupos/:id` | Remover |

---

## 25. SCP Métodos

Instrumentos de classificação de pacientes (Fugulin, Perroca, Dini).

### `GET /scp-metodos`
Lista todos os métodos.

### `GET /scp-metodos/:id`
### `GET /scp-metodos/key/:key`
Busca por chave (`FUGULIN`, `PERROCA`, `DINI`).

### `POST /scp-metodos`
### `PUT /scp-metodos/:id`
### `DELETE /scp-metodos/:id`

### `POST /scp-metodos/seed/builtin`
Popula os métodos padrão no banco.

---

## 26. Controle de Período

Trava o período de avaliação de uma unidade para evitar edições retroativas.

### `POST /controle-periodo`
**Body:**
```json
{
  "unidadeId": "uuid",
  "travado": true,
  "dataInicial": "YYYY-MM-DD",
  "dataFinal": "YYYY-MM-DD"
}
```

### `GET /controle-periodo/:unidadeId`
Retorna o último registro de controle da unidade.

### `GET /controle-periodo/:unidadeId/travado`
Retorna o período travado vigente.

---

## 27. Status de Leitos

Sincroniza estatísticas de leitos (avaliados, vagos, inativos) para o histórico.

### `PUT /leitos-status/unidade/:unidadeId`
Atualiza status dos leitos de uma unidade.

### `PUT /leitos-status/hospital/:hospitalId`
Atualiza status de todas as unidades de um hospital.

### `PUT /leitos-status/sync`
Atualiza status de todas as unidades de todos os hospitais.

---

## 28. Avaliação Qualitativa

Questionários e avaliações qualitativas por setor/unidade.

### Categorias

| Método | Rota |
|---|---|
| POST | `/qualitative/categories` |
| GET | `/qualitative/categories` |
| PUT | `/qualitative/categories/:id` |
| DELETE | `/qualitative/categories/:id` |

### Questionários

| Método | Rota |
|---|---|
| POST | `/qualitative/questionnaires` |
| GET | `/qualitative/questionnaires` |
| PUT | `/qualitative/questionnaires/:id` |
| DELETE | `/qualitative/questionnaires/:id` |

### Avaliações

| Método | Rota |
|---|---|
| POST | `/qualitative/evaluations` |
| GET | `/qualitative/evaluations` |
| GET | `/qualitative/evaluations-by-sector` |
| GET | `/qualitative/evaluations/:id` |
| PUT | `/qualitative/evaluations/:id` |
| DELETE | `/qualitative/evaluations/:id` |

### Agregações

#### `GET /qualitative/completed-with-categories`
Questionários com 100% de respostas, agrupados por categoria e hospital.

#### `GET /qualitative/aggregates/by-category`
Agregados por categoria e tipo de unidade.

#### `GET /qualitative/aggregates/by-sector`
Agregados por setor.

---

## 29. Jobs / Utilitários

### `GET /jobs/session-expiry/check`
Lista todas as datas anteriores ao dia atual que ainda possuem sessões de avaliação **ATIVAS**.

**Resposta:**
```json
{
  "today": "2025-06-10",
  "hasAny": true,
  "totalActive": 5,
  "dates": [
    { "date": "2025-06-09", "activeEvaluations": 3 },
    { "date": "2025-06-08", "activeEvaluations": 2 }
  ]
}
```

### `POST /jobs/session-expiry`
Expira (encerra) sessões de avaliação de uma data específica.

**Body:** `{ "date": "YYYY-MM-DD" }`

### `POST /jobs/session-expiry/process-pending`
Processa **todas** as sessões pendentes de dias anteriores (mesmo processo que roda ao iniciar o servidor).

---

## 30. Cache

### `GET /cache`
Retorna status do cache interno.

### `DELETE /cache`
Limpa o cache.

---

## 31. Status da API

### `GET /`
**Resposta:** `{ "message": "API ON" }`

---

## Erros Comuns

| Código | Significado |
|---|---|
| 400 | Dados inválidos / parâmetro obrigatório ausente |
| 401 | Token ausente ou inválido |
| 404 | Recurso não encontrado |
| 500 | Erro interno do servidor |

Todos os erros retornam:
```json
{
  "error": "Descrição curta",
  "details": "Mensagem técnica (ambientes não-produção)"
}
```

---

## Modelo de Dados — Referência Rápida

| Entidade | Tabela | Descrição |
|---|---|---|
| Hospital | `hospitais` | Hospital raiz |
| UnidadeInternacao | `unidades_internacao` | Setor de internação (UTI, Clínica, etc.) |
| UnidadeNaoInternacao | `unidades_nao_internacao` | Ambulatório, SADT, etc. |
| UnidadeNeutra | `unidades_neutras` | Adminstrativo sem dimensionamento |
| Leito | `leitos` | Leito físico de internação |
| AvaliacaoSCP | `avaliacoes_scp` | Sessão de ocupação + classificação |
| SitioFuncional | `sitios_funcionais` | Área funcional dentro de unidade não-internação |
| SitioDistribuicao | `sitio_distribuicoes` | Distribuição de turnos ENF/TEC por sítio |
| CargoSitio | `cargos_sitio` | Cargo vinculado a um sítio |
| ParametrosNaoInternacao | `parametros_nao_internacao` | Jornadas, índice de segurança por unidade |
| ParametrosUnidade | `parametros_unidade` | IST, carga horária por unidade de internação |
| DimensionamentoNaoInternacao | `dimensionamento_nao_internacao` | Resultado calculado por sítio+cargo (persistido) |
| ProjetadoFinalInternacao | `projetado_final_internacao` | Projetado final por unidade+cargo |
| ProjetadoFinalNaoInternacao | `projetado_final_nao_internacao` | Projetado final por unidade+sítio+cargo |
| SnapshotDimensionamento | `snapshots_dimensionamento` | Snapshot completo do hospital |
| Baseline | `baselines` | Linha de base do quadro atual |
| Rede / Regiao / Grupo | `redes` / `regioes` / `grupos` | Hierarquia organizacional |
| Cargo | `cargos` | Cargo de enfermagem |
| Colaborador | `colaboradores` | Profissional usuário do sistema |
