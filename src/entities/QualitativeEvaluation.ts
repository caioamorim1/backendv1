import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("qualitative_evaluation")
export class QualitativeEvaluationEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "varchar", length: 150 })
  evaluator!: string;

  @Column({ type: "timestamp", default: () => "NOW()" })
  date!: Date;

  @Column({ type: "varchar", length: 50, default: "pendente" })
  status!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  questionnaire!: string | null;

  @Column({ name: "questionnaire_id", type: "int" })
  questionnaire_id!: number;

  @Column({ name: "sector_id", type: "uuid" })
  sector_id!: string;

  @Column({ name: "hospital_id", type: "uuid", nullable: true })
  hospital_id!: string | null;

  @Column({ name: "unidade_type", type: "varchar", length: 50, nullable: true })
  unidade_type!: string | null;

  @Column({
    name: "calculate_rate",
    type: "numeric",
    precision: 6,
    scale: 2,
    default: 0,
  })
  calculate_rate!: number;

  @Column({ type: "jsonb", nullable: true })
  answers!: any;

  @CreateDateColumn({
    name: "created_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  created_at!: Date;

  @UpdateDateColumn({
    name: "updated_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  updated_at!: Date;

  @Column({ name: "deleted_at", type: "timestamp", nullable: true })
  deleted_at!: Date | null;
}
