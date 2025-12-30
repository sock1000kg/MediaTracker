import app from '@/app.js' 

const PORT: number = Number(process.env.PORT) || 5000

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server has started on port: ${PORT}, DB_URL: ${process.env.DATABASE_URL}`)
    })
}