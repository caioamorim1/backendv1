import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('qualitative_categories')
export class QualitativeCategoryEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'int' })
    meta!: number;
}
