import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import { UnidadeInternacao } from "./UnidadeInternacao";

@Entity("unidades_periodo_controle")
export class UnidadePeriodoControle {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UnidadeInternacao, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "unidade_id" })
  unidade!: UnidadeInternacao;

  @Column({ type: "boolean", default: false })
  travado!: boolean;

  // Datas de controle (somente data, sem horário)
  @Column({ name: "data_inicial", type: "date" })
  dataInicial!: string; // formato YYYY-MM-DD

  @Column({ name: "data_final", type: "date" })
  dataFinal!: string; // formato YYYY-MM-DD

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
