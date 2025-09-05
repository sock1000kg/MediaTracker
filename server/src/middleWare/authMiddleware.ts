import jwt from 'jsonwebtoken'

import { Request, Response, NextFunction } from 'express'

function authMiddleWare(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization']
    const token = authHeader?.split(' ')[1]; // Extract token after 'Bearer'

    if (!token) return res.status(401).json({ error: 'No token provided' })

    jwt.verify(token, process.env.JWT_KEY_SECRET!, (error: any, decoded: any) => {
        if (error) return res.status(401).json({ message: 'Invalid token' })
        req.userId = Number(decoded.id); // now req.userId is a number
        next();
    })
}

export default authMiddleWare