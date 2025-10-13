import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * Entidade para cache de dimensionamento
 *
 * Armazena resultados calculados de dimensionamento para otimizar consultas
 * do dashboard agregado. Cache é invalidado automaticamente após período configurado.
 */
@Entity("dimensionamento_cache")
@Index(["unidadeId", "tipoUnidade"])
@Index(["hospitalId"])
@Index(["updatedAt"])
export class DimensionamentoCache {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /**
   * ID do hospital (para queries rápidas por hospital)
   */
  @Column({ type: "uuid" })
  hospitalId!: string;

  /**
   * ID da unidade (internação OU não-internação)
   */
  @Column({ type: "uuid" })
  unidadeId!: string;

  /**
   * Tipo de unidade
   */
  @Column({
    type: "varchar",
    length: 50,
  })
  tipoUnidade!: "INTERNACAO" | "NAO_INTERNACAO";

  /**
   * Dados completos do dimensionamento calculado
   *
   * Para INTERNACAO:
   * {
   *   tabela: [
   *     {
   *       cargoNome: string,
   *       quantidadeAtual: number,
   *       quantidadeProjetada: number,
   *       custoPorFuncionario: number,
   *       isScpCargo: boolean
   *     }
   *   ],
   *   dimensionamento: { ... }
   * }
   *
   * Para NAO_INTERNACAO:
   * {
   *   tabela: [
   *     {
   *       id: string,        // sitio ID
   *       nome: string,      // sitio nome
   *       cargos: [
   *         {
   *           cargoNome: string,
   *           quantidadeAtual: number,
   *           quantidadeProjetada: number,
   *           custoPorFuncionario: number,
   *           isScpCargo: boolean
   *         }
   *       ]
   *     }
   *   ],
   *   dimensionamento: {
   *     pessoalEnfermeiroArredondado: number,
   *     pessoalTecnicoArredondado: number,
   *     ...
   *   }
   * }
   */
  @Column({
    type: "jsonb",
    nullable: false,
  })
  dados!: any;

  /**
   * Hash MD5 dos parâmetros que geraram o cálculo
   * Usado para detectar se inputs mudaram e cache precisa ser invalidado
   */
  @Column({ type: "varchar", length: 32, nullable: true })
  hashParametros?: string;

  /**
   * Data de criação do cache
   */
  @CreateDateColumn()
  createdAt!: Date;

  /**
   * Data da última atualização do cache
   */
  @UpdateDateColumn()
  updatedAt!: Date;

  /**
   * Metadados adicionais para debugging
   */
  @Column({
    type: "jsonb",
    nullable: true,
  })
  metadata?: {
    versaoCalculo?: string;
    tempoCalculoMs?: number;
    quantidadeRegistros?: number;
  };
}
