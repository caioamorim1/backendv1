import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity({ name: "projetado_final_internacao" })
@Index(["unidadeId", "cargoId"], { unique: true })
export class ProjetadoFinalInternacao {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  hospitalId!: string;

  @Column({ type: "uuid" })
  unidadeId!: string;

  @Column({ type: "uuid" })
  cargoId!: string;

  @Column({ type: "int", default: 0 })
  projetadoFinal!: number;

  @Column({ type: "text", default: "" })
  observacao!: string;

  @Column({ type: "varchar", length: 50, default: "nao_iniciado" })
  status!: string;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;
}
