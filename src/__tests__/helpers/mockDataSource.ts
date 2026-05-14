/**
 * Cria um DataSource TypeORM totalmente mockado.
 *
 * Qualquer chamada a getRepository() devolve um repositório genérico com
 * jest.fn() em todos os métodos comuns. Passe `overrides` para substituir
 * o comportamento de um entity específico (chave = entity.name).
 *
 * Exemplo:
 *   createMockDataSource({
 *     Colaborador: { findOne: jest.fn().mockResolvedValue(mockUser) },
 *   })
 */
export function createQueryBuilderMock(overrides: Record<string, jest.Mock> = {}) {
  const base: Record<string, jest.Mock> = {
    where: jest.fn(),
    andWhere: jest.fn(),
    orWhere: jest.fn(),
    leftJoinAndSelect: jest.fn(),
    innerJoinAndSelect: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    limit: jest.fn(),
    take: jest.fn(),
    skip: jest.fn(),
    setParameter: jest.fn(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  // Todos os métodos de encadeamento devolvem o próprio objeto
  const chainable = [
    "where", "andWhere", "orWhere", "leftJoinAndSelect", "innerJoinAndSelect",
    "select", "addSelect", "orderBy", "addOrderBy", "limit", "take", "skip", "setParameter",
  ];
  chainable.forEach((m) => base[m].mockReturnValue(base));
  return base;
}

export function createMockRepo(overrides: Record<string, jest.Mock> = {}) {
  const qb = createQueryBuilderMock();
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    findBy: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    create: jest.fn((dto: unknown) => dto),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    ...overrides,
  };
}

export function createMockDataSource(
  repoOverrides: Record<string, Partial<ReturnType<typeof createMockRepo>>> = {},
  queryResults: unknown[] = []
) {
  const cache = new Map<string, ReturnType<typeof createMockRepo>>();

  const getRepository = jest.fn((entity: unknown) => {
    const name =
      typeof entity === "function"
        ? (entity as { name: string }).name
        : String(entity);

    if (!cache.has(name)) {
      const overrides = (repoOverrides[name] ?? {}) as Record<string, jest.Mock>;
      cache.set(name, createMockRepo(overrides));
    }
    return cache.get(name)!;
  });

  const queryIterator = queryResults[Symbol.iterator]
    ? queryResults[Symbol.iterator]()
    : [][Symbol.iterator]();

  const query = jest.fn().mockImplementation(() => {
    const next = queryIterator.next();
    return Promise.resolve(next.done ? [] : next.value);
  });

  return {
    getRepository,
    query,
    isInitialized: true,
    manager: {
      transaction: jest.fn(async (cb: (em: unknown) => Promise<unknown>) => cb({})),
    },
  };
}

export type MockDataSource = ReturnType<typeof createMockDataSource>;
