import { AppDataSource } from "../ormconfig";

async function ensureTables() {
  const ds = AppDataSource;
  if (!ds.isInitialized) {
    await ds.initialize();
  }

  // 1) qualitative_category
  await ds.query(`
    CREATE TABLE IF NOT EXISTS public.qualitative_category (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      meta NUMERIC NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL
    );
  `);

  // 2) qualitative_questionnaire
  await ds.query(`
    CREATE TABLE IF NOT EXISTS public.qualitative_questionnaire (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      description TEXT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      questions JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by UUID NULL,
      updated_by UUID NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP WITHOUT TIME ZONE NULL
    );
  `);

  // 3) qualitative_evaluation
  await ds.query(`
    CREATE TABLE IF NOT EXISTS public.qualitative_evaluation (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      evaluator VARCHAR(150) NOT NULL,
      date TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      status VARCHAR(50) NOT NULL DEFAULT 'pendente',
      questionnaire VARCHAR(255) NULL,
      questionnaire_id INTEGER NOT NULL REFERENCES public.qualitative_questionnaire(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      sector_id UUID NOT NULL,
      hospital_id UUID NULL,
      unidade_type VARCHAR(50) NULL,
      calculate_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
      answers JSONB NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP WITHOUT TIME ZONE NULL
    );
  `);

  // Compatibilidade: adiciona colunas caso a tabela já exista no banco
  await ds.query(
    `ALTER TABLE public.qualitative_evaluation ADD COLUMN IF NOT EXISTS hospital_id UUID NULL;`
  );
  await ds.query(
    `ALTER TABLE public.qualitative_evaluation ADD COLUMN IF NOT EXISTS unidade_type VARCHAR(50) NULL;`
  );

  // 4) qualitative_projection
  await ds.query(`
    CREATE TABLE IF NOT EXISTS public.qualitative_projection (
      id SERIAL PRIMARY KEY,
      unidade_id UUID NOT NULL UNIQUE,
      unidade_type VARCHAR(50) NOT NULL,
      status_available VARCHAR(50) NULL,
      hospital_id UUID NOT NULL,
      rates JSONB NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await ds.destroy();
}

ensureTables()
  .then(() => {
    console.log("Qualitative tables ensured (matching backup schema).");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed ensuring qualitative tables:", err);
    process.exit(1);
  });
