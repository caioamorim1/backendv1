import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from "typeorm";
import { Hospital } from "./Hospital";
import { UnidadeInternacao } from "./UnidadeInternacao";
import { UnidadeNaoInternacao } from "./UnidadeNaoInternacao";
import { Cargo } from "./Cargo";
import { Admin } from "./Admin";

/**
 * Entidade para armazenar snapshots históricos do dimensionamento
 *
 * Escopo flexível:
 * - Pode ser snapshot de TODO O HOSPITAL
 * - Pode ser snapshot de UMA UNIDADE específica
 * - Pode ser snapshot de UM CARGO em uma unidade
 */
@Entity("snapshots_dimensionamento")
@Index(["hospitalId", "dataHora"])
@Index(["unidadeInternacaoId", "dataHora"])
@Index(["unidadeNaoInternacaoId", "dataHora"])
@Index(["escopo", "dataHora"])
export class SnapshotDimensionamento {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ===== ESCOPO DO SNAPSHOT =====

  /**
   * Define o escopo do snapshot:
   * - HOSPITAL: Snapshot de todo o hospital
   * - UNIDADE: Snapshot de uma unidade específica
   * - CARGO_UNIDADE: Snapshot de um cargo em uma unidade
   */
  @Column({
    type: "varchar",
    length: 50,
  })
  escopo!: "HOSPITAL" | "UNIDADE" | "CARGO_UNIDADE";

  /**
   * Tipo de unidade (se aplicável)
   */
  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
  })
  tipoUnidade?: "INTERNACAO" | "NAO_INTERNACAO";

  // ===== RELACIONAMENTOS =====

  /**
   * Hospital do snapshot (sempre presente)
   */
  @Column({ type: "uuid" })
  hospitalId!: string;

  @ManyToOne(() => Hospital)
  @JoinColumn({ name: "hospitalId" })
  hospital!: Hospital;

  /**
   * Unidade de internação (opcional - quando escopo é UNIDADE ou CARGO_UNIDADE)
   */
  @Column({ type: "uuid", nullable: true })
  unidadeInternacaoId?: string;

  @ManyToOne(() => UnidadeInternacao, { nullable: true })
  @JoinColumn({ name: "unidadeInternacaoId" })
  unidadeInternacao?: UnidadeInternacao;

  /**
   * Unidade de não internação (opcional - quando escopo é UNIDADE ou CARGO_UNIDADE)
   */
  @Column({ type: "uuid", nullable: true })
  unidadeNaoInternacaoId?: string;

  @ManyToOne(() => UnidadeNaoInternacao, { nullable: true })
  @JoinColumn({ name: "unidadeNaoInternacaoId" })
  unidadeNaoInternacao?: UnidadeNaoInternacao;

  /**
   * Cargo específico (opcional - quando escopo é CARGO_UNIDADE)
   */
  @Column({ type: "uuid", nullable: true })
  cargoId?: string;

  @ManyToOne(() => Cargo, { nullable: true })
  @JoinColumn({ name: "cargoId" })
  cargo?: Cargo;

  // ===== METADADOS DO SNAPSHOT =====

  /**
   * Data e hora do snapshot (timezone: America/Sao_Paulo)
   */
  @CreateDateColumn({ type: "timestamp with time zone" })
  dataHora!: Date;

  /**
   * Tipo de ação que gerou o snapshot
   */
  @Column({
    type: "varchar",
    length: 50,
  })
  acao!: "SNAPSHOT_MANUAL" | "SNAPSHOT_AUTOMATICO" | "AUDITORIA";

  /**
   * Usuário que criou o snapshot (se manual)
   */
  @Column({ type: "uuid", nullable: true })
  usuarioId?: string;

  @ManyToOne(() => Admin, { nullable: true })
  @JoinColumn({ name: "usuarioId" })
  usuario?: Admin;

  /**
   * Observação/motivo do snapshot
   */
  @Column({ type: "text", nullable: true })
  observacao?: string;

  // ===== DADOS DO SNAPSHOT =====

  /**
   * Snapshot completo em JSON
   *
   * Estrutura depende do escopo:
   *
   * HOSPITAL:
   * {
   *   hospital: { id, nome, ... },
   *   unidades: [
   *     {
   *       unidade: { id, nome, tipo, ... },
   *       dimensionamento: { ... }
   *     }
   *   ],
   *   totais: {
   *     totalProfissionais: number,
   *     totalProfissionaisNecessarios: number,
   *     custoTotal: number,
   *     ...
   *   }
   * }
   *
   * UNIDADE:
   * {
   *   unidade: { id, nome, tipo, ... },
   *   dimensionamento: {
   *     agregados: { ... },
   *     tabela: [ ... ]
   *   }
   * }
   *
   * CARGO_UNIDADE:
   * {
   *   cargo: { id, nome, ... },
   *   unidade: { id, nome, tipo, ... },
   *   dimensionamento: { ... }
   * }
   */
  @Column({
    type: "jsonb",
    nullable: false,
  })
  dados!: any;

  /**
   * Resumo rápido para queries (desnormalizado para performance)
   */
  @Column({
    type: "jsonb",
    nullable: true,
  })
  resumo?: {
    totalProfissionais?: number;
    totalProfissionaisNecessarios?: number;
    deficit?: number;
    custoTotal?: number;
    taxaOcupacao?: number;
    // Outros campos relevantes para buscas rápidas
  };

  /**
   * Hash MD5 dos dados para detectar duplicatas
   */
  @Column({ type: "varchar", length: 32, nullable: true })
  hashDados?: string;

  /**
   * Indica se este snapshot está selecionado para uso/comparação
   */
  @Column({ type: "boolean", default: false })
  selecionado!: boolean;
}

// ===== TIPOS AUXILIARES =====

/**
 * Tipo para criar snapshot de hospital completo
 */
export interface SnapshotHospitalCompleto {
  hospital: {
    id: string;
    nome: string;
  };
  unidades: {
    unidade: {
      id: string;
      nome: string;
      tipo: "INTERNACAO" | "NAO_INTERNACAO";
    };
    dimensionamento: any; // Dados completos do dimensionamento
  }[];
  totais: {
    totalProfissionais: number;
    totalProfissionaisNecessarios: number;
    deficit: number;
    custoTotal: number;
  };
}

/**
 * Tipo para criar snapshot de unidade
 */
export interface SnapshotUnidade {
  unidade: {
    id: string;
    nome: string;
    tipo: "INTERNACAO" | "NAO_INTERNACAO";
  };
  dimensionamento: any; // Dados completos do dimensionamento
}

/**
 * Tipo para criar snapshot de cargo em unidade
 */
export interface SnapshotCargoUnidade {
  cargo: {
    id: string;
    nome: string;
  };
  unidade: {
    id: string;
    nome: string;
    tipo: "INTERNACAO" | "NAO_INTERNACAO";
  };
  dimensionamento: any; // Dados completos do dimensionamento daquele cargo
}
