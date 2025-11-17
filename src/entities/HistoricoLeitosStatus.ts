import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { UnidadeInternacao } from "./UnidadeInternacao";

@Entity("historicos_leitos_status")
@Index(["unidade", "data"])
export class HistoricoLeitosStatus {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UnidadeInternacao, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "unidade_id" })
  unidade!: UnidadeInternacao;

  @Column({ name: "data", type: "timestamptz" })
  data!: Date;

  @Column({ name: "bed_count", type: "int", default: 0 })
  bedCount!: number;

  @Column({ name: "minimum_care", type: "int", default: 0 })
  minimumCare!: number;

  @Column({ name: "intermediate_care", type: "int", default: 0 })
  intermediateCare!: number;

  @Column({ name: "high_dependency", type: "int", default: 0 })
  highDependency!: number;

  @Column({ name: "semi_intensive", type: "int", default: 0 })
  semiIntensive!: number;

  @Column({ name: "intensive", type: "int", default: 0 })
  intensive!: number;

  @Column({ name: "evaluated", type: "int", default: 0 })
  evaluated!: number;

  @Column({ name: "vacant", type: "int", default: 0 })
  vacant!: number;

  @Column({ name: "inactive", type: "int", default: 0 })
  inactive!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
