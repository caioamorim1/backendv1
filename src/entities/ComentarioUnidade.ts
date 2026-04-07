import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { UnidadeInternacao } from "./UnidadeInternacao";
import { Colaborador } from "./Colaborador";

@Entity("comentarios_unidade")
@Index(["unidade", "data"])
export class ComentarioUnidade {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UnidadeInternacao, { nullable: false, onDelete: "CASCADE" })
  unidade!: UnidadeInternacao;

  @ManyToOne(() => Colaborador, { nullable: true, onDelete: "SET NULL" })
  autor!: Colaborador | null;

  /** Dia ao qual o comentário pertence (YYYY-MM-DD) */
  @Column({ type: "date" })
  data!: string;

  @Column({ type: "varchar", length: 1000 })
  texto!: string;

  @CreateDateColumn()
  criadoEm!: Date;

  @UpdateDateColumn()
  atualizadoEm!: Date;
}
