import { describe, expect, it } from '@jest/globals'
import { parseBggXml, mapBggThing } from '@/services/search/bggSearchService.js'
import { bggSearchResponseSchema, bggThingResponseSchema, bggSearchQuerySchema } from '@/schemas/search/bggSchemas.js'
import { searchMediaSchema } from '@/schemas/mediaSchemas.js'

describe('BGG XML Parsing and Mapping', () => {
    it('bggSearchQuerySchema accepts and validates query params', () => {
        expect(bggSearchQuerySchema.parse({ q: ' Catan ' })).toEqual({ q: 'Catan', page: 1 })
        expect(bggSearchQuerySchema.parse({ q: 'Catan', page: '2' })).toEqual({ q: 'Catan', page: 2 })
        expect(bggSearchQuerySchema.safeParse({ q: '' }).success).toBe(false)
        expect(bggSearchQuerySchema.safeParse({}).success).toBe(false)
        expect(bggSearchQuerySchema.safeParse({ q: 'x', page: '0' }).success).toBe(false)
    })

    it('parses BGG search XML into items with primary and alternate names', () => {
        const xml = `
        <items total="2" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
            <item type="boardgame" id="13">
                <name type="primary" value="Catan"/>
                <yearpublished value="1995"/>
            </item>
            <item type="boardgame" id="30754">
                <name type="alternate" value="Catan: Cities &amp; Knights"/>
                <yearpublished value="1998"/>
            </item>
        </items>`

        const raw = parseBggXml(xml)
        const parsed = bggSearchResponseSchema.parse(raw)
        expect(parsed.items?.item).toHaveLength(2)
        expect(parsed.items?.item[0]['@_id']).toBe('13')
        expect(parsed.items?.item[0].name?.[0]['@_value']).toBe('Catan')
    })

    it('maps BGG thing item to SearchResult with designers, categories, rating, and decoded entities', () => {
        const xml = `
        <items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
            <item type="boardgame" id="13">
                <thumbnail>https://cf.geekdo-images.com/thumb.jpg</thumbnail>
                <image>https://cf.geekdo-images.com/image.jpg</image>
                <name type="primary" sortindex="1" value="Catan"/>
                <name type="alternate" sortindex="1" value="Die Siedler von Catan"/>
                <description>In Catan, players trade and build.&#10;&#10;It&apos;s a classic &amp; fun game.</description>
                <yearpublished value="1995"/>
                <minplayers value="3"/>
                <maxplayers value="4"/>
                <playingtime value="120"/>
                <minplaytime value="60"/>
                <maxplaytime value="120"/>
                <link type="boardgamecategory" id="1022" value="Economic"/>
                <link type="boardgamecategory" id="1023" value="Negotiation"/>
                <link type="boardgamedesigner" id="2" value="Klaus Teuber"/>
                <statistics page="1">
                    <ratings>
                        <usersrated value="125000"/>
                        <average value="7.1234"/>
                    </ratings>
                </statistics>
            </item>
        </items>`

        const raw = parseBggXml(xml)
        const parsed = bggThingResponseSchema.parse(raw)
        expect(parsed.items?.item).toHaveLength(1)

        const mapped = mapBggThing(parsed.items!.item[0])
        expect(mapped).toMatchObject({
            mediaType: 'boardgame',
            source: 'bgg',
            sourceId: '13',
            title: 'Catan',
            creator: 'Klaus Teuber',
            year: '1995',
            imageUrl: 'https://cf.geekdo-images.com/image.jpg',
            description: "In Catan, players trade and build.\n\nIt's a classic & fun game.",
            genres: ['Economic', 'Negotiation'],
            details: {
                minPlayers: 3,
                maxPlayers: 4,
                playTimeMin: 120,
                minPlayTimeMin: 60,
                maxPlayTimeMin: 120,
                score: 7.1234,
                scoreScale: 'bgg_10',
            },
        })
    })

    it('handles zero ratings / no votes as null bggRating and fallback thumbnail', () => {
        const xml = `
        <items>
            <item type="boardgame" id="999">
                <thumbnail>http://cf.geekdo-images.com/thumb.jpg</thumbnail>
                <name type="primary" value="Prototype"/>
                <yearpublished value="2025"/>
                <statistics page="1">
                    <ratings>
                        <usersrated value="0"/>
                        <average value="0"/>
                    </ratings>
                </statistics>
            </item>
        </items>`

        const raw = parseBggXml(xml)
        const parsed = bggThingResponseSchema.parse(raw)
        const mapped = mapBggThing(parsed.items!.item[0])
        expect((mapped.details as Record<string, unknown> | null)?.score).toBeUndefined()
        expect(mapped.imageUrl).toBe('https://cf.geekdo-images.com/thumb.jpg')
        expect(mapped.creator).toBeNull()
    })

    it('preserves BGG description with markup, entities, and text longer than 3000 chars unchanged', () => {
        const longText = 'A'.repeat(4000)
        const xmlDesc = `In Catan: &lt;b&gt;Trade&lt;/b&gt; &amp;amp; &lt;i&gt;build&lt;/i&gt;!&lt;br/&gt;&#10;&#10;&lt;p&gt;Paragraph&lt;/p&gt;${longText}`
        const xml = `
        <items>
            <item type="boardgame" id="42">
                <name type="primary" value="Epic Game"/>
                <description>${xmlDesc}</description>
            </item>
        </items>`

        const raw = parseBggXml(xml)
        const parsed = bggThingResponseSchema.parse(raw)
        const mapped = mapBggThing(parsed.items!.item[0])

        expect(mapped.description?.length).toBeGreaterThan(4000)
        expect(mapped.description).toContain('<b>Trade</b> & <i>build</i>!')
        expect(mapped.description).toContain('<p>Paragraph</p>')

        const parsedMedia = searchMediaSchema.parse({
            title: mapped.title,
            mediaType: 'boardgame',
            source: 'bgg',
            sourceId: mapped.sourceId,
            description: mapped.description,
            details: mapped.details,
        })
        expect(parsedMedia.description).toBe(mapped.description)
        expect(parsedMedia.description?.length).toBeGreaterThan(4000)
    })
})
