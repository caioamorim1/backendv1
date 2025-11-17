import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { CargoUnidade } from "./CargoUnidade";
import { SitioFuncional } from "./SitioFuncional";

@Entity("cargos_sitio")
export class CargoSitio {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "cargo_unidade_id" })
  cargoUnidadeId!: string;

  @Column({ name: "sitio_id" })
  sitioId!: string;

  @Column({ type: "int", default: 1 })
  quantidade_funcionarios!: number;

  @Column({ type: "timestamptz", nullable: true })
  quantidade_atualizada_em?: Date;

  // Distribuição por turnos - Segunda a Sexta
  @Column({ type: "int", nullable: true })
  seg_sex_manha?: number;

  @Column({ type: "int", nullable: true })
  seg_sex_tarde?: number;

  @Column({ type: "int", nullable: true })
  seg_sex_noite1?: number; // 19h às 01h

  @Column({ type: "int", nullable: true })
  seg_sex_noite2?: number; // 01h às 07h

  // Distribuição por turnos - Sábado e Domingo
  @Column({ type: "int", nullable: true })
  sab_dom_manha?: number;

  @Column({ type: "int", nullable: true })
  sab_dom_tarde?: number;

  @Column({ type: "int", nullable: true })
  sab_dom_noite1?: number; // 19h às 01h

  @Column({ type: "int", nullable: true })
  sab_dom_noite2?: number; // 01h às 07h

  @ManyToOne(() => CargoUnidade, (cu) => cu.id, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "cargo_unidade_id" })
  cargoUnidade!: CargoUnidade;

  @ManyToOne(() => SitioFuncional, (s) => s.id, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "sitio_id" })
  sitio!: SitioFuncional;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
