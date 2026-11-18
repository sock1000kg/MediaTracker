import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { PROVIDER_REGISTRY } from "@/providers/registry.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(__dirname, __dirname.includes("/dist/") ? "../../../" : "../../")
const srcRoot = path.resolve(serverDir, "src")

function walkDir(dir: string, fileList: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === "tests" || entry.name === "generated" || entry.name === "dist" || entry.name === "node_modules") {
                continue
            }
            walkDir(fullPath, fileList)
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
            fileList.push(fullPath)
        }
    }
    return fileList
}

describe("Direct fetch scan (P2, T1)", () => {
    test("server/src files never call global fetch directly against any provider registry host", () => {
        const allFiles = walkDir(srcRoot)
        const providerFetchFile = path.resolve(srcRoot, "providers/providerFetch.ts")
        const candidateFiles = allFiles.filter(f => path.resolve(f) !== providerFetchFile)

        // Extract all registry hosts
        const registryHosts = new Set<string>()
        for (const entry of Object.values(PROVIDER_REGISTRY)) {
            if (entry.host) {
                registryHosts.add(entry.host.toLowerCase())
            }
        }
        // Known provider domains
        registryHosts.add("themoviedb.org")
        registryHosts.add("api.themoviedb.org")
        registryHosts.add("rawg.io")
        registryHosts.add("api.rawg.io")
        registryHosts.add("boardgamegeek.com")
        registryHosts.add("ws.audioscrobbler.com")
        registryHosts.add("last.fm")
        registryHosts.add("musicbrainz.org")
        registryHosts.add("coverartarchive.org")
        registryHosts.add("openlibrary.org")
        registryHosts.add("graphql.anilist.co")
        registryHosts.add("anilist.co")

        const violations: string[] = []

        for (const filePath of candidateFiles) {
            const content = fs.readFileSync(filePath, "utf-8")
            const lines = content.split("\n")

            lines.forEach((line, index) => {
                // If a line calls fetch(
                if (/\bfetch\s*\(/.test(line)) {
                    // Check if line or adjacent lines mention any registry host
                    const context = lines.slice(Math.max(0, index - 5), Math.min(lines.length, index + 6)).join(" ").toLowerCase()
                    for (const host of registryHosts) {
                        if (context.includes(host)) {
                            violations.push(
                                `File ${path.relative(srcRoot, filePath)}:${index + 1} calls fetch directly against host '${host}'; use providerFetch(provider, ...) instead`
                            )
                        }
                    }
                }
            })
        }

        expect(violations).toEqual([])
    })
})
