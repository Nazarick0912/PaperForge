import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "INVALID_JSON",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "INTERNAL_ERROR",
  "RATE_LIMITED",
  "HTTP_ERROR",
]);

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: ApiErrorCodeSchema,
    message: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, "Error message must not be empty"),
  }),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
