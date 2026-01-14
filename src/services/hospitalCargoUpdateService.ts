import { DataSource } from "typeorm";
import { CargoUnidade } from "../entities/CargoUnidade";
import { CargoSitio } from "../entities/CargoSitio";

export class HospitalCargoUpdateService {
  constructor(private ds: DataSource) {}

  /**
   * Buscar a última atualização de cargo para um hospital
   * Verifica tanto unidades de internação (CargoUnidade) quanto não-internação (CargoSitio)
   */
  async buscarUltimaAtualizacao(hospitalId: string): Promise<{
    ultimaAtualizacao: Date | null;
    ultimaAtualizacaoInternacao: Date | null;
    ultimaAtualizacaoNaoInternacao: Date | null;
    detalhes: {
      internacao?: {
        data: Date;
        unidadeNome: string;
        cargoNome: string;
      };
      naoInternacao?: {
        data: Date;
        unidadeNome: string;
        sitioNome: string;
        cargoNome: string;
      };
    };
  }> {
    // Buscar última atualização de internação
    const internacaoQuery = this.ds
      .getRepository(CargoUnidade)
      .createQueryBuilder("cu")
      .leftJoin("cu.unidade", "unidade")
      .leftJoin("unidade.hospital", "hospital")
      .leftJoin("cu.cargo", "cargo")
      .select([
        "cu.quantidade_atualizada_em as data",
        "unidade.nome as unidade_nome",
        "cargo.nome as cargo_nome",
      ])
      .where("hospital.id = :hospitalId", { hospitalId })
      .andWhere("cu.quantidade_atualizada_em IS NOT NULL")
      .orderBy("cu.quantidade_atualizada_em", "DESC")
      .limit(1);

    // Buscar última atualização de não-internação
    const naoInternacaoQuery = this.ds
      .getRepository(CargoSitio)
      .createQueryBuilder("cs")
      .leftJoin("cs.sitio", "sitio")
      .leftJoin("sitio.unidade", "unidade")
      .leftJoin("unidade.hospital", "hospital")
      .leftJoin("cs.cargoUnidade", "cargoUnidade")
      .leftJoin("cargoUnidade.cargo", "cargo")
      .select([
        "cs.quantidade_atualizada_em as data",
        "unidade.nome as unidade_nome",
        "sitio.nome as sitio_nome",
        "cargo.nome as cargo_nome",
      ])
      .where("hospital.id = :hospitalId", { hospitalId })
      .andWhere("cs.quantidade_atualizada_em IS NOT NULL")
      .orderBy("cs.quantidade_atualizada_em", "DESC")
      .limit(1);

    const [internacao, naoInternacao] = await Promise.all([
      internacaoQuery.getRawOne(),
      naoInternacaoQuery.getRawOne(),
    ]);

    // Determinar qual é a mais recente
    let ultimaAtualizacao: Date | null = null;
    let ultimaAtualizacaoInternacao: Date | null = null;
    let ultimaAtualizacaoNaoInternacao: Date | null = null;
    const detalhes: any = {};

    if (internacao?.data) {
      ultimaAtualizacaoInternacao = new Date(internacao.data);
      detalhes.internacao = {
        data: ultimaAtualizacaoInternacao,
        unidadeNome: internacao.unidade_nome,
        cargoNome: internacao.cargo_nome,
      };
    }

    if (naoInternacao?.data) {
      ultimaAtualizacaoNaoInternacao = new Date(naoInternacao.data);
      detalhes.naoInternacao = {
        data: ultimaAtualizacaoNaoInternacao,
        unidadeNome: naoInternacao.unidade_nome,
        sitioNome: naoInternacao.sitio_nome,
        cargoNome: naoInternacao.cargo_nome,
      };
    }

    // Comparar qual é a mais recente
    if (ultimaAtualizacaoInternacao && ultimaAtualizacaoNaoInternacao) {
      ultimaAtualizacao =
        ultimaAtualizacaoInternacao > ultimaAtualizacaoNaoInternacao
          ? ultimaAtualizacaoInternacao
          : ultimaAtualizacaoNaoInternacao;
    } else if (ultimaAtualizacaoInternacao) {
      ultimaAtualizacao = ultimaAtualizacaoInternacao;
    } else if (ultimaAtualizacaoNaoInternacao) {
      ultimaAtualizacao = ultimaAtualizacaoNaoInternacao;
    }

    return {
      ultimaAtualizacao,
      ultimaAtualizacaoInternacao,
      ultimaAtualizacaoNaoInternacao,
      detalhes,
    };
  }

  /**
   * Buscar a última atualização de cargo para todos os hospitais de uma rede
   */
  async buscarUltimaAtualizacaoRede(redeId: string): Promise<{
    ultimaAtualizacao: Date | null;
    ultimaAtualizacaoInternacao: Date | null;
    ultimaAtualizacaoNaoInternacao: Date | null;
    detalhes: {
      internacao?: {
        data: Date;
        hospitalNome: string;
        unidadeNome: string;
        cargoNome: string;
      };
      naoInternacao?: {
        data: Date;
        hospitalNome: string;
        unidadeNome: string;
        sitioNome: string;
        cargoNome: string;
      };
    };
  }> {
    // Buscar última atualização de internação na rede
    const internacaoQuery = this.ds
      .getRepository(CargoUnidade)
      .createQueryBuilder("cu")
      .leftJoin("cu.unidade", "unidade")
      .leftJoin("unidade.hospital", "hospital")
      .leftJoin("hospital.grupo", "grupo")
      .leftJoin("grupo.rede", "rede")
      .leftJoin("cu.cargo", "cargo")
      .select([
        "cu.quantidade_atualizada_em as data",
        "hospital.nome as hospital_nome",
        "unidade.nome as unidade_nome",
        "cargo.nome as cargo_nome",
      ])
      .where("rede.id = :redeId", { redeId })
      .andWhere("cu.quantidade_atualizada_em IS NOT NULL")
      .orderBy("cu.quantidade_atualizada_em", "DESC")
      .limit(1);

    // Buscar última atualização de não-internação na rede
    const naoInternacaoQuery = this.ds
      .getRepository(CargoSitio)
      .createQueryBuilder("cs")
      .leftJoin("cs.sitio", "sitio")
      .leftJoin("sitio.unidade", "unidade")
      .leftJoin("unidade.hospital", "hospital")
      .leftJoin("hospital.grupo", "grupo")
      .leftJoin("grupo.rede", "rede")
      .leftJoin("cs.cargoUnidade", "cargoUnidade")
      .leftJoin("cargoUnidade.cargo", "cargo")
      .select([
        "cs.quantidade_atualizada_em as data",
        "hospital.nome as hospital_nome",
        "unidade.nome as unidade_nome",
        "sitio.nome as sitio_nome",
        "cargo.nome as cargo_nome",
      ])
      .where("rede.id = :redeId", { redeId })
      .andWhere("cs.quantidade_atualizada_em IS NOT NULL")
      .orderBy("cs.quantidade_atualizada_em", "DESC")
      .limit(1);

    const [internacao, naoInternacao] = await Promise.all([
      internacaoQuery.getRawOne(),
      naoInternacaoQuery.getRawOne(),
    ]);

    // Determinar qual é a mais recente
    let ultimaAtualizacao: Date | null = null;
    let ultimaAtualizacaoInternacao: Date | null = null;
    let ultimaAtualizacaoNaoInternacao: Date | null = null;
    const detalhes: any = {};

    if (internacao?.data) {
      ultimaAtualizacaoInternacao = new Date(internacao.data);
      detalhes.internacao = {
        data: ultimaAtualizacaoInternacao,
        hospitalNome: internacao.hospital_nome,
        unidadeNome: internacao.unidade_nome,
        cargoNome: internacao.cargo_nome,
      };
    }

    if (naoInternacao?.data) {
      ultimaAtualizacaoNaoInternacao = new Date(naoInternacao.data);
      detalhes.naoInternacao = {
        data: ultimaAtualizacaoNaoInternacao,
        hospitalNome: naoInternacao.hospital_nome,
        unidadeNome: naoInternacao.unidade_nome,
        sitioNome: naoInternacao.sitio_nome,
        cargoNome: naoInternacao.cargo_nome,
      };
    }

    // Comparar qual é a mais recente
    if (ultimaAtualizacaoInternacao && ultimaAtualizacaoNaoInternacao) {
      ultimaAtualizacao =
        ultimaAtualizacaoInternacao > ultimaAtualizacaoNaoInternacao
          ? ultimaAtualizacaoInternacao
          : ultimaAtualizacaoNaoInternacao;
    } else if (ultimaAtualizacaoInternacao) {
      ultimaAtualizacao = ultimaAtualizacaoInternacao;
    } else if (ultimaAtualizacaoNaoInternacao) {
      ultimaAtualizacao = ultimaAtualizacaoNaoInternacao;
    }

    return {
      ultimaAtualizacao,
      ultimaAtualizacaoInternacao,
      ultimaAtualizacaoNaoInternacao,
      detalhes,
    };
  }
}
