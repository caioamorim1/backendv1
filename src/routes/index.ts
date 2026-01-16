import { Router } from "express";
import { AvaliacaoRoutes } from "./avaliacaoRoutes";
import { HospitalRoutes } from "./hospitalRoutes";
import { UnidadeRoutes } from "./unidadeRoutes";
import { UnidadeNaoInternacaoRoutes } from "./unidadeNaoInternacaoRoutes";
import { UnidadeNeutraRoutes } from "./unidadeNeutraRoutes";
import { SitioPosicaoRoutes } from "./sitioPosicaoRoutes";
import { EstatisticasRoutes } from "./estatisticasRoutes";
import { LeitoRoutes } from "./leitoRoutes";

import { ColaboradorRoutes } from "./colaboradorRoutes";
import { RelatoriosRoutes } from "./relatoriosRoutes";
import { StatisticsRoutes } from "./statisticsRoutes";
import { ExportRoutes } from "./exportRoutes";
import { ScpMetodoRoutes } from "./scpMetodoRoutes";
import { JobsRoutes } from "./jobsRoutes";

import { RedeRoutes } from "./redeRoutes";
import { RegiaoRoutes } from "./regiaoRoutes";
import { GrupoRoutes } from "./grupoRoutes";
import { BaselineRoutes } from "./baselineRoutes";
// import { BaselineSummaryRoutes } from "./baselineSummaryRoutes"; // deprecated wiring
import { SnapshotSummaryRoutes } from "./snapshotSummaryRoutes";

import { DataSource } from "typeorm";
import { AuthRoutes } from "./authRoutes";
import { CargoRoutes } from "./cargoRoutes";
import { CargoHospitalRoutes } from "./cargoHospitalRoutes";
import { ParametrosUnidadeRoutes } from "./parametrosUnidadeRoutes";
import { ParametrosNaoInternacaoRoutes } from "./parametrosNaoInternacaoRoutes";
import { QuestionarioRoutes } from "./questionarioRoutes";
import { ColetaRoutes } from "./coletaRoutes";
import { DimensionamentoRoutes } from "./dimensionamentoRoutes";
import { HospitalSectorsRoutes } from "./hospitalSectorsRoutes";
import { LeitosStatusRoutes } from "./leitosStatusRoutes";

import { snapshotDimensionamentoRoutes } from "./snapshotDimensionamentoRoutes";
import { HospitalSectorsAggregateRoutes } from "./hospitalSectorsAggregateRoutes";
import { HospitalSectorsNetworkRoutes } from "./hospitalSectorsNetworkRoutes";
import { QualitativeRoutes } from "./QualitativeRoutes";
import { OccupationAnalysisRoutes } from "./occupationAnalysisRoutes";
import { OccupationAnalysisNetworkRoutes } from "./occupationAnalysisNetworkRoutes";
import { ControlePeriodoRoutes } from "./controlePeriodoRoutes";
import { TaxaOcupacaoRoutes } from "./taxaOcupacaoRoutes";
import passwordResetRoutes from "./passwordResetRoutes";
import cacheRoutes from "./cacheRoutes";

export const createIndexRouter = (dataSource: DataSource): Router => {
  const router = Router();

  router.get("/", (req, res) => res.status(200).json({ message: "API ON" }));

  // Unified login for both admin and colaboradores
  router.use("/login", AuthRoutes(dataSource));

  // Password Reset Routes (Public)
  router.use("/password-reset", passwordResetRoutes);

  // Cache Management Routes
  router.use("/cache", cacheRoutes);

  // Quantitativo

  router.use("/hospitais", HospitalRoutes(dataSource));
  // Rotas para cargos por hospital
  router.use("/hospitais", CargoHospitalRoutes(dataSource));
  router.use("/unidades", UnidadeRoutes(dataSource));
  router.use(
    "/unidades-nao-internacao",
    UnidadeNaoInternacaoRoutes(dataSource)
  );
  router.use("/unidades-neutras", UnidadeNeutraRoutes(dataSource));
  // Sitios e Posições
  router.use("/sitios", SitioPosicaoRoutes(dataSource));

  // Estatísticas e Relatórios
  router.use("/", EstatisticasRoutes(dataSource));
  router.use("/leitos", LeitoRoutes(dataSource));
  router.use("/cargos", CargoRoutes(dataSource));
  router.use("/avaliacoes", AvaliacaoRoutes(dataSource));
  router.use("/scp-metodos", ScpMetodoRoutes(dataSource));

  router.use("/colaboradores", ColaboradorRoutes(dataSource));
  // Rotas de Pacientes e Internações removidas após migração para sessões por Avaliação
  router.use("/relatorios", RelatoriosRoutes(dataSource));
  router.use("/estatisticas", StatisticsRoutes(dataSource));
  router.use("/parametros", ParametrosUnidadeRoutes(dataSource));
  router.use("/parametros", ParametrosNaoInternacaoRoutes(dataSource));

  // Export Routes
  router.use("/export", ExportRoutes(dataSource));

  // Jobs / utilities
  router.use("/jobs", JobsRoutes(dataSource));

  // Redes, Regiões e Grupos
  router.use("/redes", RedeRoutes(dataSource));
  router.use("/regioes", RegiaoRoutes(dataSource));
  router.use("/grupos", GrupoRoutes(dataSource));
  // Baselines
  router.use("/baselines", BaselineRoutes(dataSource));
  // Snapshot Summary (usar snapshots; sem fallback para Baseline)
  router.use("/", SnapshotSummaryRoutes(dataSource));
  // Questionários
  //router.use("/questionarios", QuestionarioRoutes(dataSource));
  router.use("/qualitative", QualitativeRoutes(dataSource));

  // Coletas

  router.use("/coletas", ColetaRoutes(dataSource));
  router.use("/dimensionamento", DimensionamentoRoutes(dataSource));
  // Controle de período por unidade (travamento / intervalo)
  router.use("/controle-periodo", ControlePeriodoRoutes(dataSource));

  // Taxa de Ocupação Customizada
  router.use("/taxa-ocupacao", TaxaOcupacaoRoutes(dataSource));

  // Hospital Sectors (Internation + Assistance)
  router.use("/hospital-sectors", HospitalSectorsRoutes(dataSource));
  router.use(
    "/hospital-sectors-aggregate",
    HospitalSectorsAggregateRoutes(dataSource)
  );
  // Hospital Sectors Network (Aggregated by Rede/Grupo/Regiao)
  router.use(
    "/hospital-sectors-network",
    HospitalSectorsNetworkRoutes(dataSource)
  );
  // Occupation Analysis (Taxa de Ocupação)
  router.use("/hospital-sectors", OccupationAnalysisRoutes(dataSource));
  // Occupation Analysis Network (Aggregated by Rede/Grupo/Regiao)
  router.use(
    "/occupation-analysis-network",
    OccupationAnalysisNetworkRoutes(dataSource)
  );

  // Snapshot
  router.use("/snapshot", snapshotDimensionamentoRoutes(dataSource));
  // Leitos Status (Atualização de estatísticas de leitos)
  router.use("/leitos-status", LeitosStatusRoutes(dataSource));

  return router;
};
