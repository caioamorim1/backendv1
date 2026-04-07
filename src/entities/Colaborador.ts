import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Hospital } from "./Hospital";

@Entity("colaboradores")
export class Colaborador {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Hospital, (hospital) => hospital.colaboradores, {
    nullable: true,
  })
  hospital?: Hospital;

  @Column({ type: "varchar", length: 160 })
  nome!: string;

  @Column({ type: "varchar", length: 255, unique: true, nullable: true })
  email!: string;

  @Column({
    type: "enum",
    enum: [
      "ADMIN",
      "AVALIADOR",
      "GESTOR_TATICO_TEC_ADM",
      "GESTOR_TATICO_TECNICO",
      "GESTOR_TATICO_ADM",
      "GESTOR_ESTRATEGICO_HOSPITAL",
      "GESTOR_ESTRATEGICO_REDE",
      // Legado (pode existir no banco; mantido para compatibilidade)
      "ADMIN_GLOBAL",
      "GESTOR_ESTRATEGICO",
      "GESTOR_TATICO",
      "GESTOR",
      "CONSULTOR",
      "COMUM",
    ],
    default: "AVALIADOR",
  })
  permissao!:
    | "ADMIN"
    | "AVALIADOR"
    | "GESTOR_TATICO_TEC_ADM"
    | "GESTOR_TATICO_TECNICO"
    | "GESTOR_TATICO_ADM"
    | "GESTOR_ESTRATEGICO_HOSPITAL"
    | "GESTOR_ESTRATEGICO_REDE"
    // Legado
    | "ADMIN_GLOBAL"
    | "GESTOR_ESTRATEGICO"
    | "GESTOR_TATICO"
    | "GESTOR"
    | "CONSULTOR"
    | "COMUM";

  @Column({ type: "varchar", length: 18, unique: true, nullable: true })
  cpf?: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  coren?: string;

  // senha (hash)
  @Column({ type: "varchar", length: 255, nullable: true })
  senha!: string | null;

  // Se true, exige troca de senha no próximo login (primeiro acesso)
  @Column({ type: "boolean", default: true })
  mustChangePassword!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
