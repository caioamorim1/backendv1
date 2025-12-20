import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  OneToOne,
} from "typeorm";
import { UnidadeInternacao } from "./UnidadeInternacao";
import { UnidadeNaoInternacao } from "./UnidadeNaoInternacao";
import { UnidadeNeutra } from "./UnidadeNeutra";
import { Colaborador } from "./Colaborador";
import { Cargo } from "./Cargo";
import { Regiao } from "./Regiao";
import { Baseline } from "./Baseline";
import { Rede } from "./Rede";
import { Grupo } from "./Grupo";

export enum TipoHospital {
  PUBLICO = "PUBLICO",
  PRIVADO = "PRIVADO",
  FILANTROPICO = "FILANTROPICO",
  OUTROS = "OUTROS",
}

export enum GestaoHospital {
  GESTAO_DIRETA = "GESTAO_DIRETA",
  ORGANIZACAO_SOCIAL = "ORGANIZACAO_SOCIAL",
  GESTAO_TERCEIRIZADA = "GESTAO_TERCEIRIZADA",
}

export enum PerfilHospital {
  GERAL = "GERAL",
  ESPECIALIZADO = "ESPECIALIZADO",
  ENSINO_UNIVERSITARIO = "ENSINO_UNIVERSITARIO",
  REFERENCIA_ALTA_COMPLEXIDADE = "REFERENCIA_ALTA_COMPLEXIDADE",
  REFERENCIA_CURTA_PERMANENCIA = "REFERENCIA_CURTA_PERMANENCIA",
  REFERENCIA_LONGA_PERMANENCIA = "REFERENCIA_LONGA_PERMANENCIA",
}

export enum ComplexidadeHospital {
  BAIXA = "BAIXA",
  MEDIA = "MEDIA",
  ALTA = "ALTA",
  MEDIA_ALTA = "MEDIA_ALTA",
  BAIXA_MEDIA = "BAIXA_MEDIA",
}

@Entity("hospitais")
export class Hospital {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255 })
  nome!: string;

  @Column({ type: "varchar", length: 20, nullable: true, unique: true })
  cnpj!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  endereco!: string;

  @Column({ type: "varchar", length: 40, nullable: true })
  telefone!: string;

  @Column({
    type: "enum",
    enum: TipoHospital,
    nullable: true,
  })
  tipo?: TipoHospital;

  @Column({
    type: "enum",
    enum: GestaoHospital,
    nullable: true,
  })
  gestao?: GestaoHospital;

  @Column({
    type: "enum",
    enum: PerfilHospital,
    nullable: true,
  })
  perfil?: PerfilHospital;

  @Column({
    type: "enum",
    enum: ComplexidadeHospital,
    nullable: true,
  })
  complexidade?: ComplexidadeHospital;

  @Column({ type: "integer", nullable: true, name: "numero_total_leitos" })
  numeroTotalLeitos?: number;

  @Column({ type: "integer", nullable: true, name: "numero_leitos_uti" })
  numeroLeitosUTI?: number;

  @Column({ type: "integer", nullable: true, name: "numero_salas_cirurgicas" })
  numeroSalasCirurgicas?: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  foto?: string;

  @OneToMany(() => Colaborador, (c) => c.hospital)
  colaboradores!: Colaborador[];

  @OneToMany(() => Cargo, (cargo) => cargo.hospital)
  cargos!: Cargo[];

  @OneToOne(() => Baseline, (baseline) => baseline.hospital, {
    nullable: true,
    cascade: true,
  })
  baseline!: Baseline;

  @OneToMany(() => UnidadeInternacao, (ui) => ui.hospital)
  unidades!: UnidadeInternacao[];

  @OneToMany(() => UnidadeNaoInternacao, (uni) => uni.hospital)
  unidadesNaoInternacao!: UnidadeNaoInternacao[];

  @OneToMany(() => UnidadeNeutra, (un) => un.hospital)
  unidadesNeutras!: UnidadeNeutra[];

  @ManyToOne(() => Regiao, (r) => r.hospitais, { nullable: true })
  regiao?: Regiao;

  @ManyToOne(() => Rede, { nullable: true })
  rede?: Rede;

  @ManyToOne(() => Grupo, { nullable: true })
  grupo?: Grupo;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
