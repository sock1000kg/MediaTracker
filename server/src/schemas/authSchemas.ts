import { z } from "zod"
import { sanitizeUsername, sanitizeDisplayName, checkPasswordStrength } from "@/utilities"

// username schema
export const usernameSchema = z
    .preprocess((val: string | null | undefined) => {
            return sanitizeUsername(val)
    }, z
    .string({ message: "Username must be at least 3 characters and at most 50" })
)

// password schema
export const passwordSchema = z
    .string()
    .min(8, { message: "Password must contain at least 8 characters" })
    .refine((val) => checkPasswordStrength(val), {
        message: "Password must contain at least 8 characters, including 1 uppercase, 1 lowercase, 1 number, 1 special character"
    })

// displayName schema
export const displayNameSchema = z
    .preprocess((val: string | null | undefined) => {
            return sanitizeDisplayName(val)
    }, z
    .string({ message: "Username must be at least 3 characters and at most 50" })
)

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
