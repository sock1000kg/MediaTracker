import app from './app.js'

const PORT = process.env.PORT || 5003

app.listen(PORT, () => {
    console.log(`Server has started on port: ${PORT}, DB_URL: ${process.env.DATABASE_URL}`)
})