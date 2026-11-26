import { z } from "zod";

const ECHO_MESSAGE_MIN_LENGTH = 1;
const ECHO_MESSAGE_MAX_LENGTH = 200;

export const EchoRequestSchema = z.strictObject({
  message: z.string().trim().min(ECHO_MESSAGE_MIN_LENGTH).max(ECHO_MESSAGE_MAX_LENGTH),
});

export type EchoRequest = z.infer<typeof EchoRequestSchema>;

export const EchoResponseSchema = z.strictObject({
  data: z.strictObject({
    message: z
      .string()
      .min(ECHO_MESSAGE_MIN_LENGTH)
      .max(ECHO_MESSAGE_MAX_LENGTH)
      .refine((value) => value.trim() === value, "Echo response message must be normalized"),
  }),
});

export type EchoResponse = z.infer<typeof EchoResponseSchema>;
