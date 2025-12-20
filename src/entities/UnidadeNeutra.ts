import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from "typeorm";
import { Hospital } from "./Hospital";

@Entity("unidades_neutras")
export class UnidadeNeutra {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Hospital, (h) => h.unidadesNeutras, {
    nullable: false,
    onDelete: "CASCADE",
  })
  hospital!: Hospital;

  @Column({ type: "varchar", length: 120 })
  nome!: string;

  @Column({ type: "varchar", length: 20, default: "ativo" })
  status!: string; // 'ativo' | 'inativo'

  @Column({ type: "text", nullable: true })
  descricao?: string;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: false })
  custoTotal!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
