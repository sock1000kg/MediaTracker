export {}

//Request shaping
declare global {
  namespace Express {
    interface Request {
      userId?: number 
    }
  }
}
