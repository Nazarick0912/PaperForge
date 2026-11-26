import { fileURLToPath } from "node:url";
import { z } from "zod";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

const portSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "PORT must be an integer between 1 and 65535")
  .transform((value) => Number.parseInt(value, 10))
  .pipe(z.number().int().min(1).max(65535))
  .default(DEFAULT_PORT);

const envSchema = z.object({
  HOST: z
    .literal(LOOPBACK_HOST, {
      error: `HOST must be ${LOOPBACK_HOST} during this local-only prototype`,
    })
    .default(LOOPBACK_HOST),
  PORT: portSchema,
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppEnv = z.infer<typeof envSchema>;
export type NodeEnv = AppEnv["NODE_ENV"];

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid environment configuration: ${issues.join("; ")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

export function resolveApiEnvFilePath(): string {
  return fileURLToPath(new URL("../../.env", import.meta.url));
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function loadApiEnvFile(envFilePath: string = resolveApiEnvFilePath()): boolean {
  try {
    process.loadEnvFile(envFilePath);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function parseEnv(rawEnv: Record<string, string | undefined>): AppEnv {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join(".") : "environment";
      return `${field}: ${issue.message}`;
    });
    throw new EnvValidationError(issues);
  }

  return result.data;
}
