import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { UnidadeInternacao } from "./UnidadeInternacao";

@Entity("taxas_ocupacao_customizadas")
export class TaxaOcupacaoCustomizada {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "unidade_id" })
  unidadeId!: string;

  @ManyToOne(() => UnidadeInternacao, { onDelete: "CASCADE" })
  @JoinColumn({ name: "unidade_id" })
  unidade!: UnidadeInternacao;

  @Column({ type: "decimal", precision: 5, scale: 2 })
  taxa!: number; // Taxa de ocupação em porcentagem (0-100)

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
