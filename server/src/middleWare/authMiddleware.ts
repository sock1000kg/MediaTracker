import jwt, { JwtPayload } from 'jsonwebtoken'

import { Request, Response, NextFunction } from 'express'

function authMiddleWare(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization']
    const token = authHeader?.split(' ')[1]; // Extract token after 'Bearer'

    if (!token) return res.status(401).json({ message: 'No token provided' })

    jwt.verify(token, process.env.JWT_KEY_SECRET!, (error, decoded) => {
        if (error || !decoded) return res.status(401).json({ message: 'Invalid token' })
        req.userId = Number(( decoded as JwtPayload).id) // now req.userId is a number
        next()
    })
} 

export default authMiddleWare