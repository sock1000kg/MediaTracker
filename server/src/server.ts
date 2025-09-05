import app from './app' 

const PORT: number = Number(process.env.PORT) || 5003

app.listen(PORT, () => {
    console.log(`Server has started on port: ${PORT}, DB_URL: ${process.env.DATABASE_URL}`)
})