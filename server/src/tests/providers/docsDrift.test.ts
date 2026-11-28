import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { PROVIDER_REGISTRY } from "@/providers/registry.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docsPath = path.resolve(__dirname, "../../../../client/public/docs/providers.html")

describe("Docs drift test (P7, T1)", () => {
    test("providers.html matches PROVIDER_REGISTRY rates and storage rules", () => {
        expect(fs.existsSync(docsPath)).toBe(true)
        const html = fs.readFileSync(docsPath, "utf-8")

        for (const entry of Object.values(PROVIDER_REGISTRY)) {
            // Check provider display name is present
            expect(html.toLowerCase()).toContain(entry.displayName.toLowerCase())

            // Check rate display matches
            expect(html).toContain(entry.rateDisplay)

            // Check storage rule matches
            if (typeof entry.storageRule === "string") {
                expect(html).toContain(entry.storageRule)
            } else if ("refresh-after-days" in entry.storageRule) {
                expect(html).toContain(String(entry.storageRule["refresh-after-days"]))
            }
        }
    })
})
