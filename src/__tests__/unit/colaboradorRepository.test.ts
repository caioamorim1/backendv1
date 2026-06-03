import { ColaboradorRepository } from "../../repositories/colaboradorRepository";
import { createMockDataSource } from "../helpers/mockDataSource";

describe("ColaboradorRepository", () => {
  it("atualizar converte tipo para permissao antes do update", async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({
        id: "colaborador-1",
        hospital: null,
        permissao: "AVALIADOR",
      })
      .mockResolvedValueOnce({
        id: "colaborador-1",
        nome: "user67",
        email: "user6@gmail.com",
        permissao: "GESTOR_ESTRATEGICO_REDE",
        senha: "hash",
      });
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const ds = createMockDataSource({
      Colaborador: { findOne, update },
    });

    const repo = new ColaboradorRepository(ds as any);

    const result = await repo.atualizar("colaborador-1", {
      nome: "user67",
      email: "user6@gmail.com",
      tipo: "GESTOR_ESTRATEGICO_REDE",
      cpf: undefined,
      coren: undefined,
    } as any);

    expect(update).toHaveBeenCalledWith("colaborador-1", {
      nome: "user67",
      email: "user6@gmail.com",
      permissao: "GESTOR_ESTRATEGICO_REDE",
    });
    expect(result).toMatchObject({
      id: "colaborador-1",
      tipo: "GESTOR_ESTRATEGICO_REDE",
    });
    expect(result).not.toHaveProperty("senha");
  });
});
