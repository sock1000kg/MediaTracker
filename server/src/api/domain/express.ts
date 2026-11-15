export {}

//Request shaping
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string
      file?: Express.Multer.File
    }
  }
}
