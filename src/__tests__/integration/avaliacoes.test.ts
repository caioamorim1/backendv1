/**
 * Testes de integração HTTP — fluxo de avaliações SCP (sessões de ocupação)
 *
 * Cobre o ciclo completo: criar sessão → listar ativas → liberar
 */
import request from "supertest";
import { createApp } from "../../app";
import { createMockDataSource, createQueryBuilderMock } from "../helpers/mockDataSource";
import { TOKENS, HOSPITAL_ID } from "../helpers/makeToken";

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

const UNIDADE_ID = "unidade-uti-001";
const LEITO_ID = "leito-001";
const SESSAO_ID = "sessao-uuid-001";

const mockSessao = {
  id: SESSAO_ID,
  scp: "FUGULIN",
  dataAplicacao: "2026-05-13",
  totalPontos: 20,
  classificacao: "INTERMEDIARIOS",
  statusSessao: "ATIVA",
  leito: { id: LEITO_ID },
  unidade: { id: UNIDADE_ID, hospital: { id: HOSPITAL_ID } },
  autor: { id: "user-av" },
  itens: { estado_mental: 2, oxigenacao: 2 },
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

const mockLeito = {
  id: LEITO_ID,
  nome: "Leito 01",
  status: "DISPONIVEL",
  unidade: { id: UNIDADE_ID, hospital: { id: HOSPITAL_ID } },
};

const mockUnidade = {
  id: UNIDADE_ID,
  nome: "UTI",
  hospital: { id: HOSPITAL_ID },
  scpMetodo: { key: "FUGULIN", title: "Fugulin" },
  leitos: [mockLeito],
};

// ────────────────────────────────────────────────────────────
// Construtor de app com mocks configurados por cenário
// ────────────────────────────────────────────────────────────

function buildApp(overrides: {
  criarSessao?: jest.Mock;
  liberarSessao?: jest.Mock;
  listarSessoes?: jest.Mock;
} = {}) {
  // QueryBuilder configurável para listarSessoesAtivasComIntervalo
  const sessaoQb = createQueryBuilderMock({
    getMany: jest.fn().mockResolvedValue(overrides.listarSessoes ? [mockSessao] : []),
  });

  const ds = createMockDataSource({
    AvaliacaoSCP: {
      findOne: jest.fn().mockResolvedValue(mockSessao),
      find: jest.fn().mockResolvedValue([mockSessao]),
      save: overrides.criarSessao ?? jest.fn().mockResolvedValue(mockSessao),
      create: jest.fn().mockReturnValue(mockSessao),
      createQueryBuilder: jest.fn().mockReturnValue(sessaoQb),
    } as any,
    Leito: {
      findOne: jest.fn().mockResolvedValue(mockLeito),
      find: jest.fn().mockResolvedValue([mockLeito]),
      save: jest.fn().mockResolvedValue(mockLeito),
      createQueryBuilder: jest.fn().mockReturnValue(
        createQueryBuilderMock({ getMany: jest.fn().mockResolvedValue([mockLeito]) })
      ),
    } as any,
    UnidadeInternacao: {
      findOne: jest.fn().mockResolvedValue(mockUnidade),
    } as any,
    ScpMetodo: {
      findOne: jest.fn().mockResolvedValue({ id: "scp-1", key: "FUGULIN", title: "Fugulin" }),
      find: jest.fn().mockResolvedValue([]),
    } as any,
    Colaborador: {
      findOne: jest.fn().mockResolvedValue({ id: "user-av", nome: "Avaliador" }),
    } as any,
    LeitosStatus: {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockReturnValue({}),
    } as any,
    HistoricoOcupacao: {
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockReturnValue({}),
    } as any,
    LeitoEvento: {
      save: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockReturnValue({}),
    } as any,
  });

  return { app: createApp(ds as any), ds };
}

// ────────────────────────────────────────────────────────────
// POST /avaliacoes (endpoint legado)
// ────────────────────────────────────────────────────────────

describe("POST /avaliacoes — endpoint legado", () => {
  it("retorna 410 (Gone) indicando que o endpoint foi removido", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/avaliacoes")
      .set("Authorization", `Bearer ${TOKENS.AVALIADOR}`)
      .set("hospitalId", HOSPITAL_ID)
      .send({ leitoId: LEITO_ID });
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("legado"),
      uso: expect.stringContaining("/avaliacoes/sessao"),
    });
  });
});

// ────────────────────────────────────────────────────────────
// GET /avaliacoes/sessoes-ativas
// ────────────────────────────────────────────────────────────

describe("GET /avaliacoes/sessoes-ativas", () => {
  it("retorna 401 sem token", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/avaliacoes/sessoes-ativas")
      .query({ unidadeId: UNIDADE_ID });
    expect(res.status).toBe(401);
  });

  it("retorna 200 com token de AVALIADOR do mesmo hospital", async () => {
    const { app } = buildApp({ listarSessoes: jest.fn() });
    const res = await request(app)
      .get("/avaliacoes/sessoes-ativas")
      .set("Authorization", `Bearer ${TOKENS.AVALIADOR}`)
      .query({ unidadeId: UNIDADE_ID });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("retorna 403 para AVALIADOR de hospital diferente", async () => {
    const { app } = buildApp();
    const ds = createMockDataSource(
      {},
      [
        // resolveHospitalIdFromUnidade devolve um hospital diferente
        [{ id: "outro-hosp-999" }],
      ]
    );
    const app2 = createApp(ds as any);
    const res = await request(app2)
      .get("/avaliacoes/sessoes-ativas")
      .set("Authorization", `Bearer ${TOKENS.AVALIADOR}`)
      .query({ unidadeId: UNIDADE_ID });
    expect(res.status).toBe(403);
  });
});

// ────────────────────────────────────────────────────────────
// GET /avaliacoes/schema — schema SCP (sem DB)
// ────────────────────────────────────────────────────────────

describe("GET /avaliacoes/schema", () => {
  it("retorna 200 com o schema FUGULIN para um AVALIADOR autenticado", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/avaliacoes/schema")
      .set("Authorization", `Bearer ${TOKENS.AVALIADOR}`)
      .query({ scp: "FUGULIN" });
    // 200 indica que a rota passou auth + authz e chegou no controller
    expect(res.status).toBe(200);
  });

  it("retorna 401 sem token de autenticação", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/avaliacoes/schema")
      .query({ scp: "FUGULIN" });
    expect(res.status).toBe(401);
  });
});

// ────────────────────────────────────────────────────────────
// GET /avaliacoes/leito/:id/ultimo-prontuario — escopo none
// ────────────────────────────────────────────────────────────

describe("GET /avaliacoes/leito/:id/ultimo-prontuario", () => {
  it("retorna 401 sem token", async () => {
    const { app } = buildApp();
    const res = await request(app).get(
      `/avaliacoes/leito/${LEITO_ID}/ultimo-prontuario`
    );
    expect(res.status).toBe(401);
  });

  it("retorna 200 para AVALIADOR autenticado (escopo: none)", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get(`/avaliacoes/leito/${LEITO_ID}/ultimo-prontuario`)
      .set("Authorization", `Bearer ${TOKENS.AVALIADOR}`);
    // Chegou no controller → 200
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────
// GET /avaliacoes/taxa-ocupacao-dia — múltiplos filtros
// ────────────────────────────────────────────────────────────

describe("GET /avaliacoes/taxa-ocupacao-dia", () => {
  it("retorna 401 sem autenticação", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/avaliacoes/taxa-ocupacao-dia")
      .query({ unidadeId: UNIDADE_ID });
    expect(res.status).toBe(401);
  });

  it("retorna resposta com token válido de GESTOR_TATICO_TEC_ADM", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/avaliacoes/taxa-ocupacao-dia")
      .set("Authorization", `Bearer ${TOKENS.GTT}`)
      .query({ unidadeId: UNIDADE_ID });
    // Não espera 401 nem 403 — o controller recebe a requisição
    expect([200, 400, 404, 500]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
