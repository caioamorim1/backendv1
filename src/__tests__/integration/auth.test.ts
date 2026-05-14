/**
 * Testes de integração HTTP — fluxo de autenticação completo
 *
 * Usa supertest para fazer requisições reais ao app Express, com o
 * DataSource substituído por um mock para isolar o banco de dados.
 */
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../../app";
import { createMockDataSource, createMockRepo } from "../helpers/mockDataSource";
import { TOKENS, HOSPITAL_ID } from "../helpers/makeToken";

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

let hashedPassword: string;

beforeAll(async () => {
  hashedPassword = await bcrypt.hash("senha123", 10);
});

function buildMockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-test-1",
    nome: "Fulano de Tal",
    email: "fulano@hospital.com",
    senha: hashedPassword,
    permissao: "GESTOR_TATICO_TEC_ADM",
    mustChangePassword: false,
    cpf: null,
    hospital: { id: HOSPITAL_ID, nome: "Hospital Teste", rede: null, regiao: null },
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// Helpers de app
// ────────────────────────────────────────────────────────────

function buildApp(user: ReturnType<typeof buildMockUser> | null = buildMockUser()) {
  const ds = createMockDataSource({
    Colaborador: {
      findOne: jest.fn().mockResolvedValue(user),
    } as any,
    // ScpMetodo repo usado por GET /scp-metodos
    ScpMetodo: {
      find: jest.fn().mockResolvedValue([]),
    } as any,
  });
  return { app: createApp(ds as any), ds };
}

// ────────────────────────────────────────────────────────────
// Saúde da API
// ────────────────────────────────────────────────────────────

describe("GET / — health check", () => {
  it("retorna 200 e { message: 'API ON' }", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "API ON" });
  });
});

// ────────────────────────────────────────────────────────────
// POST /login
// ────────────────────────────────────────────────────────────

describe("POST /login", () => {
  it("retorna 400 quando email está ausente", async () => {
    const { app } = buildApp();
    const res = await request(app).post("/login").send({ senha: "senha123" });
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando senha está ausente", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/login")
      .send({ email: "fulano@hospital.com" });
    expect(res.status).toBe(400);
  });

  it("retorna 401 quando usuário não existe no banco", async () => {
    const ds = createMockDataSource({
      Colaborador: { findOne: jest.fn().mockResolvedValue(null) } as any,
    });
    const app = createApp(ds as any);
    const res = await request(app)
      .post("/login")
      .send({ email: "naoexiste@x.com", senha: "qualquer" });
    expect(res.status).toBe(401);
  });

  it("retorna 401 com senha incorreta", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/login")
      .send({ email: "fulano@hospital.com", senha: "senhaErrada" });
    expect(res.status).toBe(401);
  });

  it("retorna 401 quando o usuário não tem senha cadastrada", async () => {
    const { app } = buildApp(buildMockUser({ senha: null }));
    const res = await request(app)
      .post("/login")
      .send({ email: "fulano@hospital.com", senha: "senha123" });
    expect(res.status).toBe(401);
  });

  it("retorna 200 com token e dados do usuário com credenciais válidas", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/login")
      .send({ email: "fulano@hospital.com", senha: "senha123" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      token: expect.any(String),
      nome: "Fulano de Tal",
      id: "user-test-1",
    });
  });

  it("token retornado é um JWT decodificável com as informações do usuário", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/login")
      .send({ email: "fulano@hospital.com", senha: "senha123" });

    const { token } = res.body;
    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
    expect(payload).toMatchObject({
      id: "user-test-1",
      tipo: expect.any(String),
    });
  });

  it("mustChangePassword é propagado no retorno do login", async () => {
    const { app } = buildApp(buildMockUser({ mustChangePassword: true }));
    const res = await request(app)
      .post("/login")
      .send({ email: "fulano@hospital.com", senha: "senha123" });
    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// Proteção de rotas — token obrigatório
// ────────────────────────────────────────────────────────────

describe("Proteção de rotas — token JWT", () => {
  it("GET /scp-metodos sem token retorna 401", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/scp-metodos");
    expect(res.status).toBe(401);
  });

  it("GET /scp-metodos com token inválido retorna 401", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/scp-metodos")
      .set("Authorization", "Bearer token.invalido.aqui");
    expect(res.status).toBe(401);
  });

  it("GET /cache sem token retorna 401", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/cache");
    expect(res.status).toBe(401);
  });
});

// ────────────────────────────────────────────────────────────
// Controle de acesso por papel
// ────────────────────────────────────────────────────────────

describe("Controle de acesso por papel (RBAC)", () => {
  it("AVALIADOR recebe 403 ao tentar acessar GET /cache (ADM only)", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/cache")
      .set("Authorization", `Bearer ${TOKENS.AVALIADOR}`);
    expect(res.status).toBe(403);
  });

  it("ADM pode acessar GET /scp-metodos (escopo none)", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/scp-metodos")
      .set("Authorization", `Bearer ${TOKENS.ADM}`);
    // 200 = passou auth + authz e chegou no controller
    expect(res.status).toBe(200);
  });

  it("AVALIADOR pode acessar GET /scp-metodos (rota liberada para todos)", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/scp-metodos")
      .set("Authorization", `Bearer ${TOKENS.AVALIADOR}`);
    expect(res.status).toBe(200);
  });

  it("AVALIADOR recebe 403 ao tentar POST /colaboradores (ADM only)", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/colaboradores")
      .set("Authorization", `Bearer ${TOKENS.AVALIADOR}`)
      .send({ nome: "Teste", email: "t@t.com" });
    expect(res.status).toBe(403);
  });

  it("ADM recebe 403 ao tentar acessar rota completamente desconhecida", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get("/rota-que-nao-existe-nesse-sistema")
      .set("Authorization", `Bearer ${TOKENS.ADM}`);
    expect(res.status).toBe(403);
  });
});

// ────────────────────────────────────────────────────────────
// Rotas públicas acessíveis sem token
// ────────────────────────────────────────────────────────────

describe("Rotas públicas — sem token", () => {
  it("POST /password-reset/request não exige autenticação", async () => {
    const { app } = buildApp();
    const res = await request(app).post("/password-reset/request").send({
      email: "qualquer@email.com",
    });
    // O controller processa (DB pode falhar com 500), mas não retorna 401 (auth bypass)
    expect(res.status).not.toBe(401);
  });

  it("GET /debug/* não exige autenticação", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/debug/uploads");
    expect(res.status).not.toBe(401);
  });
});
