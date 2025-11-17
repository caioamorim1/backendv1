import { DataSource, EntityManager } from "typeorm";
import { LeitosStatus } from "../entities/LeitosStatus";
import { HistoricoLeitosStatus } from "../entities/HistoricoLeitosStatus";
import { UnidadeInternacao } from "../entities/UnidadeInternacao";
import { Leito, StatusLeito } from "../entities/Leito";
import { HistoricoOcupacao } from "../entities/HistoricoOcupacao";
import { ClassificacaoCuidado } from "../entities/AvaliacaoSCP";
import { DateTime } from "luxon";

export class LeitosStatusService {
  constructor(private ds: DataSource) {}

  /**
   * Atualiza a tabela leitos_status para uma unidade específica
   * baseado nas avaliações ativas e status dos leitos
   */
  async atualizarStatusUnidade(
    unidadeId: string,
    managerParam?: EntityManager
  ): Promise<LeitosStatus> {
    // If a manager is provided, run within that manager so it can see uncommitted changes
    if (managerParam) {
      return await this._updateWithManager(managerParam, unidadeId);
    }

    return this.ds.transaction(async (manager) => {
      return await this._updateWithManager(manager, unidadeId);
    });
  }

  private async _updateWithManager(
    manager: EntityManager,
    unidadeId: string
  ): Promise<LeitosStatus> {
    const leitosStatusRepo = manager.getRepository(LeitosStatus);
    const leitoRepo = manager.getRepository(Leito);
    const historicoRepo = manager.getRepository(HistoricoOcupacao);

    // Buscar todos os leitos da unidade
    const leitos = await leitoRepo.find({
      where: { unidade: { id: unidadeId } },
      relations: ["unidade"],
    });
    console.log(
      `leitosStatusService.atualizarStatusUnidade: unidadeId=${unidadeId}, totalLeitosFound=${leitos.length}`
    );
    console.log(`leitos IDs: ${leitos.map((l) => l.id).join(", ")}`);

    const totalLeitos = leitos.length;

    // Contar leitos inativos e vagos
    const inativos = leitos.filter(
      (l) => l.status === StatusLeito.INATIVO
    ).length;

    const vagos = leitos.filter((l) => l.status === StatusLeito.VAGO).length;

    // Buscar avaliações ativas (históricos sem data fim)
    const now = new Date();
    const historicosAtivos = await historicoRepo
      .createQueryBuilder("h")
      .where("h.leitoId IN (:...leitoIds)", {
        leitoIds: leitos.map((l) => l.id),
      })
      .andWhere("h.inicio <= :now", { now })
      .andWhere("(h.fim IS NULL OR h.fim > :now)", { now })
      .getMany();

    console.log(`historicosAtivos count=${historicosAtivos.length}`);
    // log sample of historico entries
    for (const h of historicosAtivos.slice(0, 10)) {
      console.log(
        `  historico id=${h.id} leitoId=${
          h.leito?.id ?? "unknown"
        } classificacao=${h.classificacao} inicio=${h.inicio} fim=${h.fim}`
      );
    }

    const avaliados = historicosAtivos.length;

    // Contar por classificação
    const minimumCare = historicosAtivos.filter(
      (h) => h.classificacao === ClassificacaoCuidado.MINIMOS
    ).length;

    const intermediateCare = historicosAtivos.filter(
      (h) => h.classificacao === ClassificacaoCuidado.INTERMEDIARIOS
    ).length;

    const highDependency = historicosAtivos.filter(
      (h) => h.classificacao === ClassificacaoCuidado.ALTA_DEPENDENCIA
    ).length;

    const semiIntensive = historicosAtivos.filter(
      (h) => h.classificacao === ClassificacaoCuidado.SEMI_INTENSIVOS
    ).length;

    const intensive = historicosAtivos.filter(
      (h) => h.classificacao === ClassificacaoCuidado.INTENSIVOS
    ).length;

    console.log(
      `counts by classification: minimum=${minimumCare}, intermediate=${intermediateCare}, highDependency=${highDependency}, semiIntensive=${semiIntensive}, intensive=${intensive}`
    );

    // Buscar ou criar registro de status
    let leitoStatus = await leitosStatusRepo.findOne({
      where: { unidade: { id: unidadeId } },
    });

    if (!leitoStatus) {
      leitoStatus = leitosStatusRepo.create({
        unidade: { id: unidadeId } as UnidadeInternacao,
      });
    }

    // Atualizar valores
    leitoStatus.bedCount = totalLeitos;
    leitoStatus.minimumCare = minimumCare;
    leitoStatus.intermediateCare = intermediateCare;
    leitoStatus.highDependency = highDependency;
    leitoStatus.semiIntensive = semiIntensive;
    leitoStatus.intensive = intensive;
    leitoStatus.evaluated = avaliados;
    leitoStatus.vacant = vagos;
    leitoStatus.inactive = inativos;
    console.log("leito status", leitoStatus);

    const savedStatus = await leitosStatusRepo.save(leitoStatus);

    // Salvar histórico
    await this._salvarHistorico(manager, unidadeId, {
      bedCount: totalLeitos,
      minimumCare,
      intermediateCare,
      highDependency,
      semiIntensive,
      intensive,
      evaluated: avaliados,
      vacant: vagos,
      inactive: inativos,
      leitosVagos: vagos,
      leitosInativos: inativos,
    });

    return savedStatus;
  }

  /**
   * Salva um registro histórico do status dos leitos
   * Mantém apenas 1 registro por unidade por dia (atualiza se já existir)
   *
   * ✅ Salva momento atual - PostgreSQL armazena em UTC automaticamente
   */
  private async _salvarHistorico(
    manager: EntityManager,
    unidadeId: string,
    dados: {
      bedCount: number;
      minimumCare: number;
      intermediateCare: number;
      highDependency: number;
      semiIntensive: number;
      intensive: number;
      evaluated: number;
      vacant: number;
      inactive: number;
      leitosVagos: number;
      leitosInativos: number;
    }
  ): Promise<void> {
    const historicoRepo = manager.getRepository(HistoricoLeitosStatus);
    const ZONE = "America/Sao_Paulo";

    // Momento atual (JavaScript Date já está em UTC internamente)
    const agora = new Date();

    // Data em São Paulo para comparação
    const agoraEmSP = DateTime.fromJSDate(agora).setZone(ZONE);
    const dataStr = agoraEmSP.toISODate(); // YYYY-MM-DD em São Paulo

    console.log(
      `\n🔍 [HISTÓRICO] Salvando histórico para unidade ${unidadeId}`
    );
    console.log(`📅 Momento atual em São Paulo: ${agoraEmSP.toISO()}`);
    console.log(`📅 Armazenado como UTC no banco: ${agora.toISOString()}`);
    console.log(`📅 Data para comparação: ${dataStr}`);

    // ✅ Query timezone-aware: compara apenas a DATA em São Paulo
    const registroExistente = await historicoRepo
      .createQueryBuilder("h")
      .leftJoinAndSelect("h.unidade", "unidade")
      .where("unidade.id = :unidadeId", { unidadeId })
      .andWhere(
        "(h.data AT TIME ZONE 'America/Sao_Paulo')::DATE = :dataStr::DATE",
        { dataStr }
      )
      .getOne();

    if (registroExistente) {
      console.log(
        `♻️  Registro encontrado (id=${registroExistente.id}) - ATUALIZANDO`
      );

      Object.assign(registroExistente, dados);
      registroExistente.data = agora;

      await historicoRepo.save(registroExistente);
      console.log(`✅ Histórico ATUALIZADO`);
      console.log(
        `   Dados: evaluated=${dados.evaluated}, vacant=${dados.vacant}, inactive=${dados.inactive}`
      );
    } else {
      console.log(`🆕 CRIANDO novo histórico para ${dataStr}`);

      const historico = historicoRepo.create({
        unidade: { id: unidadeId } as UnidadeInternacao,
        data: agora,
        ...dados,
      });

      await historicoRepo.save(historico);
      console.log(`✅ Novo histórico CRIADO`);
      console.log(
        `   Dados: evaluated=${dados.evaluated}, vacant=${dados.vacant}, inactive=${dados.inactive}`
      );
    }
  }

  /**
   * Atualiza status de todas as unidades de um hospital
   */
  async atualizarStatusHospital(hospitalId: string): Promise<void> {
    const unidadeRepo = this.ds.getRepository(UnidadeInternacao);
    const unidades = await unidadeRepo.find({
      where: { hospital: { id: hospitalId } },
    });

    for (const unidade of unidades) {
      await this.atualizarStatusUnidade(unidade.id);
    }
  }

  /**
   * Atualiza status de todas as unidades do sistema
   */
  async atualizarTodasUnidades(): Promise<void> {
    const unidadeRepo = this.ds.getRepository(UnidadeInternacao);
    const unidades = await unidadeRepo.find();

    console.log(
      `📊 Atualizando status de ${unidades.length} unidades de internação...`
    );

    for (const unidade of unidades) {
      try {
        await this.atualizarStatusUnidade(unidade.id);
        console.log(`  ✓ Unidade ${unidade.nome} atualizada`);
      } catch (error) {
        console.error(`  ✗ Erro ao atualizar unidade ${unidade.nome}:`, error);
      }
    }

    console.log("✅ Atualização de status concluída");
  }
}
