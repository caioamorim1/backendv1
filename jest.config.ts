import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/__tests__"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  clearMocks: true,
  // Roda antes de cada arquivo de teste, ANTES de qualquer import, para fixar envs de teste
  setupFiles: ["<rootDir>/src/__tests__/setup.ts"],
  // Suppress noisy console output from services during tests
  silent: false,
  verbose: true,
};

export default config;
