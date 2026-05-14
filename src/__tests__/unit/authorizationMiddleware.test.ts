import { Request, Response, NextFunction } from "express";
import { buildAuthorizationMiddleware } from "../../middlewares/authorizationMiddleware";
import { makeToken, HOSPITAL_ID, REDE_ID } from "../helpers/makeToken";
import { createMockDataSource } from "../helpers/mockDataSource";

// ────────────────────────────────────────────────────────────
// Utilitários
// ────────────────────────────────────────────────────────────

function makeReq(
  method: string,
  path: string,
  user?: Record<string, unknown>,
  query: Record<string, string> = {}
): Request {
  return {
    method,
    path,
    user,
    query,
    body: {},
    header: jest.fn(),
  } as unknown as Request;
}

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

const next: NextFunction = jest.fn();

// DataSource que não precisa de DB para testes de escopo "none"
const simpleMockDs = createMockDataSource();

// DataSource que resolve hospitalId a partir de unidadeId
function dsWith(hospitalId: string) {
  return createMockDataSource(
    {},
    [
      [{ id: hospitalId }], // primeira query (unidades_internacao)
    ]
  );
}

// DataSource que diz que hospital pertence à rede
function dsHospitalInRede(hospitalId: string, redeId: string) {
  return createMockDataSource(
    {},
    [
      // resolveHospitalIdFromUnidade → não chamado nos testes de rede
      // hospitalBelongsToRede verifica hospitais.redeId
      [{ id: hospitalId, redeId }],
    ]
  );
}

// ────────────────────────────────────────────────────────────
// Rotas públicas — devem sempre chamar next()
// ────────────────────────────────────────────────────────────
describe("buildAuthorizationMiddleware — bypass de rotas públicas", () => {
  const middleware = buildAuthorizationMiddleware(simpleMockDs as any);

  it("GET / (health check) passa sem autenticação", async () => {
    const req = makeReq("GET", "/");
    const res = makeRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("POST /login passa sem autenticação", async () => {
    const req = makeReq("POST", "/login");
    const res = makeRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("OPTIONS qualquer rota passa (CORS preflight)", async () => {
    const req = makeReq("OPTIONS", "/unidades");
    const res = makeRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("PATCH /colaboradores/:id/senha passa sem autenticação", async () => {
    const req = makeReq("PATCH", "/colaboradores/user-1/senha");
    const res = makeRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("GET /uploads/:arquivo passa sem autenticação", async () => {
    const req = makeReq("GET", "/uploads/hospital/logo.png");
    const res = makeRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────
// Rotas protegidas — sem usuário / perfil desconhecido
// ────────────────────────────────────────────────────────────
describe("buildAuthorizationMiddleware — rejeição por ausência/perfil", () => {
  const middleware = buildAuthorizationMiddleware(simpleMockDs as any);

  it("retorna 401 quando req.user está ausente em rota protegida", async () => {
    const req = makeReq("GET", "/hospitais");
    const res = makeRes();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("retorna 403 quando o tipo do usuário é desconhecido", async () => {
    const req = makeReq("GET", "/hospitais", { tipo: "TIPO_INVENTADO" });
    const res = makeRes();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("retorna 403 para rota não mapeada (modo estrito)", async () => {
    const req = makeReq("GET", "/rota-que-nao-existe-nunca", {
      tipo: "ADMIN",
    });
    const res = makeRes();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ────────────────────────────────────────────────────────────
// Controle de acesso baseado em papel (RBAC)
// ────────────────────────────────────────────────────────────
describe("buildAuthorizationMiddleware — RBAC (papel correto / errado)", () => {
  const middleware = buildAuthorizationMiddleware(simpleMockDs as any);

  it("ADM pode acessar GET /cache", async () => {
    const req = makeReq("GET", "/cache", { tipo: "ADMIN" });
    const res = makeRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("AVALIADOR NÃO pode acessar GET /cache (ADM only)", async () => {
    const req = makeReq("GET", "/cache", {
      tipo: "AVALIADOR",
      hospital: { id: HOSPITAL_ID },
    });
    const res = makeRes();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("ADM pode acessar GET /scp-metodos", async () => {
    const req = makeReq("GET", "/scp-metodos", { tipo: "ADMIN" });
    const res = makeRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("AVALIADOR pode acessar GET /scp-metodos (escopo none, leitura liberada)", async () => {
    const req = makeReq("GET", "/scp-metodos", {
      tipo: "AVALIADOR",
      hospital: { id: HOSPITAL_ID },
    });
    const res = makeRes();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("AVALIADOR NÃO pode fazer POST /colaboradores (ADM only)", async () => {
    const req = makeReq("POST", "/colaboradores", {
      tipo: "AVALIADOR",
      hospital: { id: HOSPITAL_ID },
    });
    const res = makeRes();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("GESTOR_TATICO_TEC_ADM pode fazer GET /dimensionamento/internacao/:id no próprio hospital", async () => {
    // hospitalId é extraído do path diretamente pela regex do middleware
    // Aqui o path contém o ID da unidade, não do hospital —
    // o middleware vai tentar resolver via DB. Usamos um DS que devolve HOSPITAL_ID.
    const ds = dsWith(HOSPITAL_ID);
    const mid = buildAuthorizationMiddleware(ds as any);
    const req = makeReq(
      "GET",
      `/dimensionamento/internacao/unidade-xyz`,
      { tipo: "GESTOR_TATICO_TEC_ADM", hospital: { id: HOSPITAL_ID } }
    );
    const res = makeRes();
    await mid(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("GESTOR_TATICO_TEC_ADM é bloqueado no dimensionamento de outro hospital", async () => {
    const ds = dsWith("outro-hosp-999");
    const mid = buildAuthorizationMiddleware(ds as any);
    const req = makeReq(
      "GET",
      `/dimensionamento/internacao/unidade-xyz`,
      { tipo: "GESTOR_TATICO_TEC_ADM", hospital: { id: HOSPITAL_ID } }
    );
    const res = makeRes();
    await mid(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ────────────────────────────────────────────────────────────
// Escopo de REDE (GER)
// ────────────────────────────────────────────────────────────
describe("buildAuthorizationMiddleware — escopo de rede (GER)", () => {
  it("GER pode acessar GET /redes/:redeId quando é a sua própria rede", async () => {
    const ds = createMockDataSource();
    const mid = buildAuthorizationMiddleware(ds as any);
    const req = makeReq("GET", `/redes/${REDE_ID}`, {
      tipo: "GESTOR_ESTRATEGICO_REDE",
      redeId: REDE_ID,
    });
    const res = makeRes();
    await mid(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("GER é bloqueado ao tentar acessar GET /redes/:outraRedeId", async () => {
    const ds = createMockDataSource();
    const mid = buildAuthorizationMiddleware(ds as any);
    const req = makeReq("GET", "/redes/outra-rede-aaa", {
      tipo: "GESTOR_ESTRATEGICO_REDE",
      redeId: REDE_ID,
    });
    const res = makeRes();
    await mid(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("ADM pode acessar GET /redes mesmo sem redeId (scope: none para ADM)", async () => {
    const mid = buildAuthorizationMiddleware(simpleMockDs as any);
    const req = makeReq("GET", "/redes", { tipo: "ADMIN" });
    const res = makeRes();
    await mid(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
