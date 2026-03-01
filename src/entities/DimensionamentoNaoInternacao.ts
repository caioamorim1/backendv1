import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * Persiste o resultado calculado do dimensionamento para unidades de NÃO-INTERNAÇÃO.
 *
 * Granularidade: uma linha por (unidade × sítio × cargo).
 * Atualizada automaticamente toda vez que `calcularParaNaoInternacao` é chamado.
 *
 * Fórmula resumida:
 *   KM_enf = (periodoTrabalho / jornadaEnf) × (fatorBase + indiceSeguranca)
 *   KM_tec = (periodoTrabalho / jornadaTec) × (fatorBase + indiceSeguranca)
 *   quantidadeCalculada(enfermeiro) = round(KM_enf × totalHorasENFSitio)
 *   quantidadeCalculada(tecnico)    = round(KM_tec × totalHorasTECSitio)
 *   outros cargos                   = quantidade atual (sem alteração)
 */
@Entity({ name: "dimensionamento_nao_internacao" })
@Index(["unidadeId", "sitioId", "cargoId"], { unique: true })
export class DimensionamentoNaoInternacao {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  hospitalId!: string;

  @Column({ type: "uuid" })
  unidadeId!: string;

  @Column({ type: "uuid" })
  sitioId!: string;

  @Column({ type: "uuid" })
  cargoId!: string;

  /** Quantidade de profissionais calculada pelo dimensionamento */
  @Column({ type: "int", default: 0 })
  quantidadeCalculada!: number;

  /** KM de enfermagem da unidade usado neste cálculo */
  @Column({ type: "decimal", precision: 10, scale: 6, default: 0 })
  kmEnfermeiro!: number;

  /** KM de técnico da unidade usado neste cálculo */
  @Column({ type: "decimal", precision: 10, scale: 6, default: 0 })
  kmTecnico!: number;

  /** Total de horas ENF distribuídas no sítio (soma de turnos × dias) */
  @Column({ type: "int", default: 0 })
  totalHorasEnfSitio!: number;

  /** Total de horas TEC distribuídas no sítio (soma de turnos × dias) */
  @Column({ type: "int", default: 0 })
  totalHorasTecSitio!: number;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;
}
