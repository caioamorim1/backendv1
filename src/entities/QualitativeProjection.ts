import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("qualitative_projection")
export class QualitativeProjectionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ name: "unidade_id", type: "uuid" })
  unidade_id!: string;

  @Column({ name: "unidade_type", type: "varchar", length: 50 })
  unidade_type!: string;

  @Column({
    name: "status_available",
    type: "varchar",
    length: 50,
    nullable: true,
  })
  status_available!: string | null;

  @Column({ name: "hospital_id", type: "uuid" })
  hospital_id!: string;

  @Column({ type: "jsonb" })
  rates!: any;

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
}
