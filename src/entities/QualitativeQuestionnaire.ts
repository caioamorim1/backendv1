import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("qualitative_questionnaire")
export class QualitativeQuestionnaireEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 150 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "int", default: 1 })
  version!: number;

  @Column({ type: "jsonb" })
  questions!: any;

  @Column({ name: "is_active", type: "boolean", default: true })
  is_active!: boolean;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  created_by!: string | null;

  @Column({ name: "updated_by", type: "uuid", nullable: true })
  updated_by!: string | null;

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
