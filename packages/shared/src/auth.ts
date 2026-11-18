import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(1).max(128),
});

export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: publicUserSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
