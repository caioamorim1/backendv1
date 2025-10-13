import { DataSource, Repository } from "typeorm";
import { Leito, StatusLeito } from "../entities/Leito";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { CreateLeitoDTO } from "../dto/leito.dto";
import { LeitosStatusService } from "../services/leitosStatusService";

export class LeitoRepository {
  private repo: Repository<Leito>;
  private unidadeRepo: Repository<UnidadeInternacao>;
  private leitosStatusService: LeitosStatusService;

  constructor(ds: DataSource) {
    this.repo = ds.getRepository(Leito);
    this.unidadeRepo = ds.getRepository(UnidadeInternacao);
    this.leitosStatusService = new LeitosStatusService(ds);
  }

  async criar(data: CreateLeitoDTO) {
    console.log(data);
    const unidade = await this.unidadeRepo.findOneByOrFail({
      id: data.unidadeId,
    });
    const ent = this.repo.create({ unidade, numero: data.numero });
    return this.repo.save(ent);
  }

  listar(unidadeId?: string) {
    if (unidadeId)
      return this.repo.find({
        where: { unidade: { id: unidadeId } },
        relations: ["unidade"],
      });
    return this.repo.find({ relations: ["unidade"] });
  }

  async buscarPorId(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: ["unidade"],
    });
  }

  async deletar(id: string) {
    const r = await this.repo.delete(id);
    return (r.affected ?? 0) > 0;
  }

  async atualizar(
    id: string,
    data: Partial<{ numero: string; unidadeId: string }>
  ) {
    const ent = await this.repo.findOne({ where: { id } });
    if (!ent) return null;
    if (data.numero !== undefined) ent.numero = data.numero;
    if (data.unidadeId !== undefined) {
      const unidade = await this.unidadeRepo.findOneByOrFail({
        id: data.unidadeId,
      });
      ent.unidade = unidade;
    }
    return this.repo.save(ent);
  }

  async atualizarStatus(
    id: string,
    status: string,
    justificativa?: string | null
  ) {
    // Busca a entidade
    const ent = await this.repo.findOne({
      where: { id },
      relations: ["unidade"],
    });
    if (!ent) return null;

    // Se já estiver ATIVO, não permite alteração (regra de negócio)
    if (ent.status === StatusLeito.ATIVO) {
      const e = new Error("Não é possível alterar o status de um leito ativo");
      // marca o erro para ser tratado pelo controller
      (e as any).code = "LEITO_ATIVO";
      throw e;
    }

    console.log("Status : ", status);

    try {
      // tipo é enum StatusLeito — atribuição direta (validação básica)
      (ent as any).status = status;
      if (justificativa !== undefined) {
        (ent as any).justificativa = justificativa;
      }
      const saved = await this.repo.save(ent);

      // Atualiza leitos_status da unidade após mudar status do leito
      if (ent.unidade?.id) {
        try {
          await this.leitosStatusService.atualizarStatusUnidade(ent.unidade.id);
        } catch (e) {
          console.warn("Não foi possível atualizar leitos_status:", e);
        }
      }

      return saved;
    } catch (err: any) {
      // Loga internamente e repassa uma mensagem amigável
      console.error("Erro ao atualizar status do leito:", err?.message ?? err);
      const e = new Error("Erro ao persistir alteração de status do leito");
      (e as any).cause = err;
      throw e;
    }
  }

  /**
   * Calcula a taxa de ocupação baseada no STATUS dos leitos
   * Taxa = (Leitos ATIVO / Total de Leitos) * 100
   * @param params.unidadeId ID da unidade específica
   * @param params.hospitalId ID do hospital (retorna todas unidades do hospital)
   * @returns Taxa de ocupação com detalhes por status
   */
  async calcularTaxaOcupacaoPorStatus(params?: {
    unidadeId?: string;
    hospitalId?: string;
  }) {
    const unidadeId = params?.unidadeId;
    const hospitalId = params?.hospitalId;

    if (unidadeId) {
      // Taxa de ocupação para uma unidade específica
      const leitos = await this.repo.find({
        where: { unidade: { id: unidadeId } },
        relations: ["unidade"],
      });

      const totalLeitos = leitos.length;
      const leitosAtivos = leitos.filter(
        (l) => l.status === StatusLeito.ATIVO
      ).length;
      const leitosVagos = leitos.filter(
        (l) => l.status === StatusLeito.VAGO
      ).length;
      const leitosPendentes = leitos.filter(
        (l) => l.status === StatusLeito.PENDENTE
      ).length;
      const leitosInativos = leitos.filter(
        (l) => l.status === StatusLeito.INATIVO
      ).length;

      // Taxa = leitos ATIVO / TOTAL * 100
      const taxaOcupacao =
        totalLeitos > 0 ? (leitosAtivos / totalLeitos) * 100 : 0;

      return {
        unidadeId,
        unidadeNome: leitos[0]?.unidade?.nome || "N/A",
        totalLeitos,
        leitosAtivos,
        leitosVagos,
        leitosPendentes,
        leitosInativos,
        taxaOcupacao: Number(taxaOcupacao.toFixed(2)),
      };
    } else if (hospitalId) {
      // Taxa de ocupação para todas as unidades de um hospital específico
      const unidades = await this.unidadeRepo.find({
        where: { hospital: { id: hospitalId } },
        relations: ["leitos", "hospital"],
      });

      const resultados = await Promise.all(
        unidades.map(async (unidade) => {
          const leitos = unidade.leitos || [];
          const totalLeitos = leitos.length;
          const leitosAtivos = leitos.filter(
            (l) => l.status === StatusLeito.ATIVO
          ).length;
          const leitosVagos = leitos.filter(
            (l) => l.status === StatusLeito.VAGO
          ).length;
          const leitosPendentes = leitos.filter(
            (l) => l.status === StatusLeito.PENDENTE
          ).length;
          const leitosInativos = leitos.filter(
            (l) => l.status === StatusLeito.INATIVO
          ).length;

          const taxaOcupacao =
            totalLeitos > 0 ? (leitosAtivos / totalLeitos) * 100 : 0;

          return {
            unidadeId: unidade.id,
            unidadeNome: unidade.nome,
            totalLeitos,
            leitosAtivos,
            leitosVagos,
            leitosPendentes,
            leitosInativos,
            taxaOcupacao: Number(taxaOcupacao.toFixed(2)),
          };
        })
      );

      // Cálculo consolidado do hospital
      const totalHospitalLeitos = resultados.reduce(
        (sum, r) => sum + r.totalLeitos,
        0
      );
      const totalHospitalAtivos = resultados.reduce(
        (sum, r) => sum + r.leitosAtivos,
        0
      );
      const totalHospitalVagos = resultados.reduce(
        (sum, r) => sum + r.leitosVagos,
        0
      );
      const totalHospitalPendentes = resultados.reduce(
        (sum, r) => sum + r.leitosPendentes,
        0
      );
      const totalHospitalInativos = resultados.reduce(
        (sum, r) => sum + r.leitosInativos,
        0
      );
      const taxaHospitalOcupacao =
        totalHospitalLeitos > 0
          ? (totalHospitalAtivos / totalHospitalLeitos) * 100
          : 0;

      return {
        hospitalId,
        hospitalNome: unidades[0]?.hospital?.nome || "N/A",
        consolidadoHospital: {
          totalLeitos: totalHospitalLeitos,
          leitosAtivos: totalHospitalAtivos,
          leitosVagos: totalHospitalVagos,
          leitosPendentes: totalHospitalPendentes,
          leitosInativos: totalHospitalInativos,
          taxaOcupacao: Number(taxaHospitalOcupacao.toFixed(2)),
          totalUnidades: unidades.length,
        },
        porUnidade: resultados,
      };
    } else {
      // Taxa de ocupação para todas as unidades (todos os hospitais)
      const unidades = await this.unidadeRepo.find({
        relations: ["leitos", "hospital"],
      });

      const resultados = await Promise.all(
        unidades.map(async (unidade) => {
          const leitos = unidade.leitos || [];
          const totalLeitos = leitos.length;
          const leitosAtivos = leitos.filter(
            (l) => l.status === StatusLeito.ATIVO
          ).length;
          const leitosVagos = leitos.filter(
            (l) => l.status === StatusLeito.VAGO
          ).length;
          const leitosPendentes = leitos.filter(
            (l) => l.status === StatusLeito.PENDENTE
          ).length;
          const leitosInativos = leitos.filter(
            (l) => l.status === StatusLeito.INATIVO
          ).length;

          const taxaOcupacao =
            totalLeitos > 0 ? (leitosAtivos / totalLeitos) * 100 : 0;

          return {
            unidadeId: unidade.id,
            unidadeNome: unidade.nome,
            hospitalId: unidade.hospital?.id,
            hospitalNome: unidade.hospital?.nome,
            totalLeitos,
            leitosAtivos,
            leitosVagos,
            leitosPendentes,
            leitosInativos,
            taxaOcupacao: Number(taxaOcupacao.toFixed(2)),
          };
        })
      );

      // Cálculo geral (todos os hospitais)
      const totalGeralLeitos = resultados.reduce(
        (sum, r) => sum + r.totalLeitos,
        0
      );
      const totalGeralAtivos = resultados.reduce(
        (sum, r) => sum + r.leitosAtivos,
        0
      );
      const totalGeralVagos = resultados.reduce(
        (sum, r) => sum + r.leitosVagos,
        0
      );
      const totalGeralPendentes = resultados.reduce(
        (sum, r) => sum + r.leitosPendentes,
        0
      );
      const totalGeralInativos = resultados.reduce(
        (sum, r) => sum + r.leitosInativos,
        0
      );
      const taxaGeralOcupacao =
        totalGeralLeitos > 0 ? (totalGeralAtivos / totalGeralLeitos) * 100 : 0;

      return {
        geral: {
          totalLeitos: totalGeralLeitos,
          leitosAtivos: totalGeralAtivos,
          leitosVagos: totalGeralVagos,
          leitosPendentes: totalGeralPendentes,
          leitosInativos: totalGeralInativos,
          taxaOcupacao: Number(taxaGeralOcupacao.toFixed(2)),
        },
        porUnidade: resultados,
      };
    }
  }
}
