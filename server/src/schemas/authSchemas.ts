import { z } from "zod"
import { sanitizeUsername, sanitizeDisplayName, checkPasswordStrength } from "@/utilities"

// username schema
export const usernameSchema = z
    .string()
    .min(3, { message: "Username must be at least 3 characters" })
    .transform((val) => sanitizeUsername(val) ?? "")
    .refine((val) => val.trim().length > 0, { message: "Username is required and can not contain spaces" })

// password schema
export const passwordSchema = z
    .string()
    .min(8, { message: "Password must contain at least 8 characters" })
    .refine((val) => checkPasswordStrength(val), {
        message: "Password must contain at least 8 characters, including 1 uppercase, 1 lowercase, 1 number, 1 special character"
    })

// displayName schema
export const displayNameSchema = z
    .string()
    .min(3, { message: "Username must be at least 3 characters" })
    .transform((val) => sanitizeDisplayName(val) ?? "")
    .refine((val) => val.trim().length > 0, { message: "Display name is required" })

export const registerSchema = z.object({
    username: usernameSchema,
    password: passwordSchema,
    displayName: displayNameSchema
})

export const loginSchema = z.object({
    username: usernameSchema,
    password: passwordSchema
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
