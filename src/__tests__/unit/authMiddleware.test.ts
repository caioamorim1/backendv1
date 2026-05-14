import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { authMiddleware } from "../../middlewares/authMiddleware";

const JWT_SECRET = "secreto";

function makeReq(authHeader?: string): Request {
  return { header: jest.fn().mockReturnValue(authHeader) } as unknown as Request;
}

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("authMiddleware", () => {
  const next: NextFunction = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it("retorna 401 quando não há header Authorization", () => {
    const req = makeReq(undefined);
    const res = makeRes();

    (authMiddleware as Function)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({
      message: expect.stringContaining("Token"),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 401 quando o token é inválido", () => {
    const req = makeReq("Bearer token.invalido.aqui");
    const res = makeRes();

    (authMiddleware as Function)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({
      message: expect.stringContaining("inválido"),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 401 com token expirado", () => {
    const expired = jwt.sign({ id: "x", tipo: "ADMIN" }, JWT_SECRET, {
      expiresIn: -1, // já expirado
    });
    const req = makeReq(`Bearer ${expired}`);
    const res = makeRes();

    (authMiddleware as Function)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("chama next() e popula req.user quando o token é válido", () => {
    const payload = { id: "user-1", tipo: "AVALIADOR", nome: "João" };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();

    (authMiddleware as Function)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).user).toMatchObject({
      id: "user-1",
      tipo: "AVALIADOR",
    });
  });

  it("aceita token sem o prefixo 'Bearer ' removendo manualmente (comportamento do middleware)", () => {
    // O middleware faz header("Authorization")?.replace("Bearer ", "")
    // Se o header não tiver o prefixo, o JWT completo é passado ao verify, o que é válido
    const payload = { id: "user-2", tipo: "ADMIN" };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
    const req = makeReq(token); // sem "Bearer " na frente
    const res = makeRes();

    (authMiddleware as Function)(req, res, next);

    // O token sem "Bearer " ainda é um JWT válido — o replace não altera nada
    expect(next).toHaveBeenCalledTimes(1);
  });
});
