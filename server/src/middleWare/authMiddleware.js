import jwt from 'jsonwebtoken'

function authMiddleWare(req,res,next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]; //Extract token after 'Bearer'

    if(!token) return res.status(401).json({ error: 'No token provided'})

    jwt.verify(token, process.env.JWT_KEY_SECRET, (error, decoded) => {
        if(error) return res.status(401).json({ error: 'Invalid token'})
        req.userId = decoded.id //Put user id into the req
        next()
    })
}

export default authMiddleWare