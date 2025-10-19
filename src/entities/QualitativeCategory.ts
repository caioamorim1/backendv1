import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Match repository raw SQL which queries table "qualitative_category" (singular)
@Entity('qualitative_category')
export class QualitativeCategoryEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'text', unique: true })
    name!: string;

    @Column({ type: 'numeric', nullable: true })
    meta!: number | null;

    // Keep auditing columns to match queries like "WHERE deleted_at IS NULL"
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    created_at!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updated_at!: Date;

    @Column({ type: 'timestamptz', nullable: true, name: 'deleted_at' })
    deleted_at!: Date | null;
}
