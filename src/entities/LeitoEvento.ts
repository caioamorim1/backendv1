import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  JoinColumn,
} from "typeorm";
import { Leito } from "./Leito";

export enum LeitoEventoTipo {
  // ciclo de ocupação
  OCUPACAO_INICIADA = "OCUPACAO_INICIADA",
  OCUPACAO_FINALIZADA = "OCUPACAO_FINALIZADA",

  // ciclo de sessão/avaliação
  AVALIACAO_CRIADA = "AVALIACAO_CRIADA",
  AVALIACAO_ATUALIZADA = "AVALIACAO_ATUALIZADA",
  SESSAO_LIBERADA = "SESSAO_LIBERADA",
  SESSAO_EXPIRADA = "SESSAO_EXPIRADA",

  // reservado para próximos passos (alta/transferência)
  ALTA = "ALTA",
  TRANSFERENCIA = "TRANSFERENCIA",
}

@Entity("leito_eventos")
@Index(["leito", "dataHora"])
@Index(["unidadeId", "dataHora"])
@Index(["hospitalId", "dataHora"])
export class LeitoEvento {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Leito, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "leito_id" })
  leito!: Leito;

  @Column({ type: "enum", enum: LeitoEventoTipo })
  tipo!: LeitoEventoTipo;

  // Momento do evento (UTC no banco)
  @Column({ name: "data_hora", type: "timestamptz" })
  dataHora!: Date;

  // Snapshots/contexto (para auditoria e facilitar queries futuras)
  @Column({ name: "unidade_id", type: "uuid", nullable: true })
  unidadeId!: string | null;

  @Column({ name: "hospital_id", type: "uuid", nullable: true })
  hospitalId!: string | null;

  @Column({ name: "leito_numero", type: "varchar", length: 50, nullable: true })
  leitoNumero!: string | null;

  // Vínculos opcionais
  @Column({ name: "avaliacao_id", type: "uuid", nullable: true })
  avaliacaoId!: string | null;

  @Column({ name: "historico_ocupacao_id", type: "uuid", nullable: true })
  historicoOcupacaoId!: string | null;

  // Autor (quando existe)
  @Column({ name: "autor_id", type: "uuid", nullable: true })
  autorId!: string | null;

  @Column({ name: "autor_nome", type: "varchar", length: 180, nullable: true })
  autorNome!: string | null;

  // Campo livre para motivo (alta, transferência, bloqueio, etc.)
  @Column({ type: "text", nullable: true })
  motivo!: string | null;

  // Payload flexível para evoluir sem migration (ex.: scp, classificação, totalPontos, etc.)
  @Column({ type: "jsonb", nullable: true })
  payload!: Record<string, any> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
