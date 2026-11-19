import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docsPath = path.resolve(__dirname, "../../../../client/public/docs/providers.html")

describe("Static HTML test (P7, T1)", () => {
    test("providers.html is completely static without scripts or remote font/css links", () => {
        expect(fs.existsSync(docsPath)).toBe(true)
        const html = fs.readFileSync(docsPath, "utf-8")

        // No script tags
        expect(html).not.toMatch(/<script\b[^>]*>/i)

        // No external stylesheet links
        expect(html).not.toMatch(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']https?:\/\//i)

        // No external @import in css
        expect(html).not.toMatch(/@import\s+url\(["']?https?:\/\//i)

        // Meta viewport tag exists
        expect(html).toMatch(/<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*["']/i)
    })
})
