import prisma from "@/prismaClient"
import { User, MediaType } from "@prisma/client"

//USERS
export async function createUser(
    username: string,
    displayName: string,
    hashedPassword: string
): Promise<User> {
    const existingUser = await prisma.user.findUnique({ where: { username } })
    if (existingUser) throw new Error("Username already taken")

    return prisma.user.create({
        data: { 
            username, 
            displayName, 
            password: hashedPassword },
    })
}

export async function findUserByUsername(username: string): Promise<User & { mediaType: MediaType[] }> {
    const user = await prisma.user.findUnique({
        where: {
            username 
        },
        include: { 
            mediaType: true 
        },
    })
    if (!user) throw new Error("Cannot find user")
    return user
}