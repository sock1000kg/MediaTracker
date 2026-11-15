export interface DemoPick {
    mediaTypeName: "anime" | "manga" | "game" | "music" | "tv"
    provider: "anilist" | "tmdb" | "rawg" | "lastfm"
    lookup: {
        id?: number | string
        query?: string
        artist?: string
        title?: string
        album?: string
        kind?: "album" | "track" | "anime" | "manga" | "show" | "season"
        seasonNumber?: number
        year?: number
    }
    log: {
        status: "completed" | "in progress" | "wishlist" | "dropped"
        rating?: number | null
        notes?: string | null
        loggedAt: string
        startedAt?: string | null
        finishedAt?: string | null
        tags?: string[]
    }
    collections?: string[]
}

export interface DemoCollectionDefinition {
    name: string
    description: string
    ranked: boolean
}

export const DEMO_COLLECTIONS: DemoCollectionDefinition[] = [
    {
        name: "All-time favourites",
        description: "Ten pieces of art that left an indelible mark across every medium.",
        ranked: true,
    },
    {
        name: "Comfort shelf",
        description: "Warm, gentle companions to return to when the world gets loud.",
        ranked: false,
    },
    {
        name: "Rainy day",
        description: "Quiet, contemplative works best appreciated on slow grey afternoons.",
        ranked: false,
    },
    {
        name: "Up next",
        description: "Anticipated books, films, games and albums currently on the wishlist.",
        ranked: false,
    },
    {
        name: "Shoegaze & dream pop",
        description: "Lush reverb, submerged vocals, and walls of shimmering electric sound.",
        ranked: true,
    },
]

export const DEMO_COLLECTION_EXTRAS: { collection: string; mediaTypeName: "movie"; title: string; year: number }[] = [
    { collection: "All-time favourites", mediaTypeName: "movie", title: "Inception", year: 2010 },
    { collection: "All-time favourites", mediaTypeName: "movie", title: "WALL·E", year: 2008 },
    { collection: "All-time favourites", mediaTypeName: "movie", title: "Whiplash", year: 2014 },
    { collection: "Comfort shelf", mediaTypeName: "movie", title: "WALL·E", year: 2008 },
    { collection: "Comfort shelf", mediaTypeName: "movie", title: "Groundhog Day", year: 1993 },
    { collection: "Rainy day", mediaTypeName: "movie", title: "Ju-on: The Grudge", year: 2002 },
    { collection: "Rainy day", mediaTypeName: "movie", title: "Incantation", year: 2022 },
]

export const DEMO_PICKS: DemoPick[] = [
    // ==========================================
    // GAMES (RAWG) - 10 picks
    // ==========================================
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 58764, title: "Outer Wilds" },
        log: {
            status: "completed",
            rating: 100,
            notes: "No game has ever made me feel so small and yet so intensely curious at the same time.\nThe dread of hearing the sun go quiet, standing on an ancient ruin watching sand cascade through caverns, and finally piecing together the timeline of a dead civilization across light-minutes.\nIt respects your intelligence in a way almost nothing else in modern gaming does.\nAn absolute masterpiece that I wish I could wipe my memory to experience completely blind again.",
            loggedAt: "2024-03-02T22:45:00.000Z",
            startedAt: "2024-02-01T15:00:00.000Z",
            finishedAt: "2024-03-02T22:45:00.000Z",
            tags: ["masterpiece", "2am"],
        },
        collections: ["All-time favourites"],
    },
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 262382, title: "Disco Elysium" },
        log: {
            status: "completed",
            rating: 99,
            notes: "Woke up on the carpet, couldn't find my shoes, and proceeded to debate political theory with my necktie.\nKim Kitsuragi is the most patient partner in video game history.\nThe sheer density of the writing and worldbuilding in Revachol is staggering, funny, and deeply tragic all at once.\nLeft me staring at the credits for twenty minutes in silence.",
            loggedAt: "2024-07-15T23:30:00.000Z",
            startedAt: "2024-04-10T18:00:00.000Z",
            finishedAt: "2024-07-15T23:30:00.000Z",
            tags: ["masterpiece", "slow burn"],
        },
        collections: ["All-time favourites"],
    },
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 9767, title: "Hollow Knight" },
        log: {
            status: "completed",
            rating: 95,
            notes: "City of Tears theme playing while looking out the glass window. Christopher Larkin's score carried the whole journey.",
            loggedAt: "2024-10-18T21:00:00.000Z",
            startedAt: "2024-08-20T14:00:00.000Z",
            finishedAt: "2024-10-18T21:00:00.000Z",
            tags: ["masterpiece"],
        },
    },
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 22121, title: "Celeste" },
        log: {
            status: "completed",
            rating: 92,
            notes: "Tough platforming with so much warmth in its heart. You really do breathe with the feather.",
            loggedAt: "2024-12-28T18:30:00.000Z",
            startedAt: "2024-12-01T12:00:00.000Z",
            finishedAt: "2024-12-28T18:30:00.000Z",
            tags: ["comfort"],
        },
        collections: ["Comfort shelf"],
    },
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 304247, title: "A Short Hike" },
        log: {
            status: "completed",
            rating: 90,
            notes: "Gliding down from Hawk Peak on a breezy Saturday morning. The definition of charming.",
            loggedAt: "2025-02-16T16:00:00.000Z",
            startedAt: "2025-02-15T13:00:00.000Z",
            finishedAt: "2025-02-16T16:00:00.000Z",
            tags: ["comfort", "cozy"],
        },
        collections: ["Comfort shelf"],
    },
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 17010, title: "Kentucky Route Zero" },
        log: {
            status: "in progress",
            rating: null,
            notes: "Haunting magical realism on a slow back road.",
            loggedAt: "2026-09-12T20:00:00.000Z",
            startedAt: "2026-09-12T20:00:00.000Z",
        },
    },
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 46508, title: "Return of the Obra Dinn" },
        log: {
            status: "wishlist",
            rating: null,
            loggedAt: "2025-05-10T14:00:00.000Z",
        },
        collections: ["Up next"],
    },
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 274755, title: "Hades" },
        log: {
            status: "in progress",
            rating: 88,
            notes: "Can't stop doing 'just one more run' before bed.",
            loggedAt: "2026-10-02T22:00:00.000Z",
            startedAt: "2026-10-02T22:00:00.000Z",
        },
    },
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 29236, title: "Tunic" },
        log: {
            status: "wishlist",
            rating: null,
            loggedAt: "2025-08-01T15:00:00.000Z",
        },
        collections: ["Up next"],
    },
    {
        mediaTypeName: "game",
        provider: "rawg",
        lookup: { id: 10141, title: "NieR:Automata" },
        log: {
            status: "dropped",
            rating: 60,
            notes: "Loved the music and premise, but couldn't get into the combat flow on keyboard.",
            loggedAt: "2025-11-20T19:00:00.000Z",
            startedAt: "2025-11-10T16:00:00.000Z",
        },
    },

    // ==========================================
    // MUSIC ALBUMS (Last.fm) - 12 picks
    // ==========================================
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "my bloody valentine", title: "Loveless" },
        log: {
            status: "completed",
            rating: 100,
            notes: "The golden standard of texture. Turn it all the way up until your room buzzes.",
            loggedAt: "2024-01-18T22:00:00.000Z",
            startedAt: "2024-01-18T21:10:00.000Z",
            finishedAt: "2024-01-18T22:00:00.000Z",
            tags: ["masterpiece", "shoegaze"],
        },
        collections: ["All-time favourites", "Shoegaze & dream pop"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Slowdive", title: "Souvlaki" },
        log: {
            status: "completed",
            rating: 97,
            notes: "Alison into Machine Gun into 40 Days. Flawless front half.",
            loggedAt: "2024-03-05T20:45:00.000Z",
            startedAt: "2024-03-05T20:00:00.000Z",
            finishedAt: "2024-03-05T20:45:00.000Z",
            tags: ["shoegaze", "comfort"],
        },
        collections: ["Rainy day", "Shoegaze & dream pop"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Cocteau Twins", title: "Heaven or Las Vegas" },
        log: {
            status: "completed",
            rating: 96,
            notes: "Elizabeth Fraser singing glossolalia over shimmering Guthrie chords. Pure bliss.",
            loggedAt: "2024-05-15T18:40:00.000Z",
            startedAt: "2024-05-15T18:00:00.000Z",
            finishedAt: "2024-05-15T18:40:00.000Z",
            tags: ["shoegaze", "comfort"],
        },
        collections: ["Shoegaze & dream pop"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Sigur Rós", title: "Ágætis byrjun" },
        log: {
            status: "completed",
            rating: 93,
            notes: "Bowed electric guitar echoing like an arctic breeze.",
            loggedAt: "2024-07-22T23:15:00.000Z",
            startedAt: "2024-07-22T22:00:00.000Z",
            finishedAt: "2024-07-22T23:15:00.000Z",
            tags: ["slow burn"],
        },
        collections: ["Shoegaze & dream pop"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Radiohead", title: "In Rainbows" },
        log: {
            status: "completed",
            rating: 98,
            notes: "Warmest record they ever made. Weird Fishes / Arpeggi is transcendent.",
            loggedAt: "2024-09-10T21:45:00.000Z",
            startedAt: "2024-09-10T21:00:00.000Z",
            finishedAt: "2024-09-10T21:45:00.000Z",
            tags: ["masterpiece", "rewatch"],
        },
        collections: ["All-time favourites"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Frank Ocean", title: "Blonde" },
        log: {
            status: "dropped",
            rating: null,
            notes: "Recognize the songwriting craft, just never quite resonated with my usual rotation.",
            loggedAt: "2024-11-29T14:00:00.000Z",
            startedAt: "2024-11-28T20:00:00.000Z",
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Talk Talk", title: "Spirit of Eden" },
        log: {
            status: "wishlist",
            rating: null,
            loggedAt: "2025-01-10T16:00:00.000Z",
        },
        collections: ["Up next"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Sufjan Stevens", title: "Carrie & Lowell" },
        log: {
            status: "completed",
            rating: 94,
            notes: "Devastatingly quiet and fragile acoustic songs. Fourth of July broke my heart.",
            loggedAt: "2025-03-12T22:45:00.000Z",
            startedAt: "2025-03-12T22:00:00.000Z",
            finishedAt: "2025-03-12T22:45:00.000Z",
            tags: ["cried"],
        },
        collections: ["Rainy day"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Joanna Newsom", title: "Have One on Me" },
        log: {
            status: "wishlist",
            rating: null,
            loggedAt: "2025-06-01T12:00:00.000Z",
        },
        collections: ["Up next"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "The Avalanches", title: "Since I Left You" },
        log: {
            status: "in progress",
            rating: null,
            loggedAt: "2026-11-05T17:00:00.000Z",
            startedAt: "2026-11-05T17:00:00.000Z",
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Nick Drake", title: "Pink Moon" },
        log: {
            status: "completed",
            rating: 91,
            notes: "Under thirty minutes of just a voice and an acoustic guitar. Simple perfection.",
            loggedAt: "2025-10-10T23:30:00.000Z",
            startedAt: "2025-10-10T23:00:00.000Z",
            finishedAt: "2025-10-10T23:30:00.000Z",
            tags: ["comfort", "2am"],
        },
        collections: ["Comfort shelf"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "album", artist: "Macintosh Plus", title: "Floral Shoppe" },
        log: {
            status: "dropped",
            rating: 40,
            notes: "Fun as a piece of internet lore, but not something I listen to front-to-back.",
            loggedAt: "2025-12-15T15:00:00.000Z",
            startedAt: "2025-12-14T20:00:00.000Z",
        },
    },

    // ==========================================
    // MUSIC TRACKS (Last.fm)
    // ==========================================
    // Loveless tracks
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "my bloody valentine", album: "Loveless", title: "Only Shallow" },
        log: {
            status: "completed",
            rating: 100,
            notes: "Four snare hits and then the earth shatters under distorted fuzz.",
            loggedAt: "2024-01-18T22:05:00.000Z",
            startedAt: "2024-01-18T22:00:00.000Z",
            finishedAt: "2024-01-18T22:05:00.000Z",
            tags: ["shoegaze"],
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "my bloody valentine", album: "Loveless", title: "Loomer" },
        log: {
            status: "completed",
            rating: 92,
            notes: "Hazy, sun-drenched swirl of noise and muffled vocals.",
            loggedAt: "2024-01-18T22:10:00.000Z",
            startedAt: "2024-01-18T22:05:00.000Z",
            finishedAt: "2024-01-18T22:10:00.000Z",
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "my bloody valentine", album: "Loveless", title: "Touched" },
        log: {
            status: "completed",
            rating: 84,
            notes: "A brief, unsettling instrumental interlude that bridges the noise perfectly.",
            loggedAt: "2024-01-18T22:12:00.000Z",
            startedAt: "2024-01-18T22:10:00.000Z",
            finishedAt: "2024-01-18T22:12:00.000Z",
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "my bloody valentine", album: "Loveless", title: "To Here Knows When" },
        log: {
            status: "completed",
            rating: 97,
            notes: "A wall of ocean waves made out of inverted tremolo arms.",
            loggedAt: "2024-01-18T22:18:00.000Z",
            startedAt: "2024-01-18T22:12:00.000Z",
            finishedAt: "2024-01-18T22:18:00.000Z",
            tags: ["shoegaze"],
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "my bloody valentine", album: "Loveless", title: "When You Sleep" },
        log: {
            status: "completed",
            rating: 100,
            notes: "One of the catchiest pop melodies hidden underneath an avalanche of sound.",
            loggedAt: "2024-01-18T22:23:00.000Z",
            startedAt: "2024-01-18T22:18:00.000Z",
            finishedAt: "2024-01-18T22:23:00.000Z",
            tags: ["masterpiece", "shoegaze"],
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "my bloody valentine", album: "Loveless", title: "I Only Said" },
        log: {
            status: "completed",
            rating: 95,
            notes: "That looped vocal hook echoing through the distortion is hypnotic.",
            loggedAt: "2024-01-18T22:30:00.000Z",
            startedAt: "2024-01-18T22:23:00.000Z",
            finishedAt: "2024-01-18T22:30:00.000Z",
        },
    },
    // Souvlaki tracks
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "Slowdive", album: "Souvlaki", title: "Alison" },
        log: {
            status: "completed",
            rating: 99,
            notes: "Listen close and don't be stoned. Flawless dream pop anthem.",
            loggedAt: "2024-03-05T20:50:00.000Z",
            startedAt: "2024-03-05T20:45:00.000Z",
            finishedAt: "2024-03-05T20:50:00.000Z",
            tags: ["shoegaze", "comfort"],
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "Slowdive", album: "Souvlaki", title: "Machine Gun" },
        log: {
            status: "completed",
            rating: 94,
            notes: "Lush vocal harmonies draped in delays.",
            loggedAt: "2024-03-05T20:55:00.000Z",
            startedAt: "2024-03-05T20:50:00.000Z",
            finishedAt: "2024-03-05T20:55:00.000Z",
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "Slowdive", album: "Souvlaki", title: "40 Days" },
        log: {
            status: "completed",
            rating: 97,
            notes: "The emotional core of the record. That chorus hits right in the chest.",
            loggedAt: "2024-03-05T21:00:00.000Z",
            startedAt: "2024-03-05T20:55:00.000Z",
            finishedAt: "2024-03-05T21:00:00.000Z",
            tags: ["shoegaze"],
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "Slowdive", album: "Souvlaki", title: "Sing" },
        log: {
            status: "completed",
            rating: 90,
            notes: "Co-written with Brian Eno, ambient and hauntingly minimal rhythm.",
            loggedAt: "2024-03-05T21:05:00.000Z",
            startedAt: "2024-03-05T21:00:00.000Z",
            finishedAt: "2024-03-05T21:05:00.000Z",
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "Slowdive", album: "Souvlaki", title: "Here She Comes" },
        log: {
            status: "completed",
            rating: 92,
            notes: "Gentle acoustic guitar with Neil Halstead's whispery delivery.",
            loggedAt: "2024-03-05T21:10:00.000Z",
            startedAt: "2024-03-05T21:05:00.000Z",
            finishedAt: "2024-03-05T21:10:00.000Z",
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "Slowdive", album: "Souvlaki", title: "Souvlaki Space Station" },
        log: {
            status: "completed",
            rating: 98,
            notes: "Space-rock dub delay bliss. The bass line carries you into orbit.",
            loggedAt: "2024-03-05T21:16:00.000Z",
            startedAt: "2024-03-05T21:10:00.000Z",
            finishedAt: "2024-03-05T21:16:00.000Z",
            tags: ["shoegaze"],
        },
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "Slowdive", album: "Souvlaki", title: "When the Sun Hits" },
        log: {
            status: "completed",
            rating: 98,
            notes: "That sudden explosion of distortion at 0:48 gives me goosebumps every single time.",
            loggedAt: "2024-03-05T21:20:00.000Z",
            startedAt: "2024-03-05T21:16:00.000Z",
            finishedAt: "2024-03-05T21:20:00.000Z",
            tags: ["shoegaze"],
        },
        collections: ["Shoegaze & dream pop"],
    },
    {
        mediaTypeName: "music",
        provider: "lastfm",
        lookup: { kind: "track", artist: "Aphex Twin", title: "Avril 14th" },
        log: {
            status: "completed",
            rating: 95,
            notes: "A gentle prepared piano melody that feels like watching rain tap against a dark window.",
            loggedAt: "2024-04-12T23:45:00.000Z",
            startedAt: "2024-04-12T23:40:00.000Z",
            finishedAt: "2024-04-12T23:45:00.000Z",
            tags: ["comfort", "2am"],
        },
        collections: ["Rainy day"],
    },

    // ==========================================
    // TV SHOWS & SEASONS (TMDB) - 6 picks
    // ==========================================
    {
        mediaTypeName: "tv",
        provider: "tmdb",
        lookup: { id: 60625, kind: "season", seasonNumber: 1, title: "Rick and Morty" },
        log: {
            status: "completed",
            rating: 90,
            notes: "Inventive sci-fi chaos right out of the gate. Rixty Minutes is a classic.",
            loggedAt: "2024-02-10T21:00:00.000Z",
            startedAt: "2024-02-01T20:00:00.000Z",
            finishedAt: "2024-02-10T21:00:00.000Z",
            tags: ["animation", "sci-fi"],
        },
    },
    {
        mediaTypeName: "tv",
        provider: "tmdb",
        lookup: { id: 60625, kind: "season", seasonNumber: 3, title: "Rick and Morty" },
        log: {
            status: "completed",
            rating: 88,
            notes: "Pickle Rick and The Ricklantis Mixup are peak episodes.",
            loggedAt: "2024-05-15T22:00:00.000Z",
            startedAt: "2024-05-10T19:00:00.000Z",
            finishedAt: "2024-05-15T22:00:00.000Z",
            tags: ["animation", "sci-fi"],
        },
    },
    {
        mediaTypeName: "tv",
        provider: "tmdb",
        lookup: { id: 136283, kind: "season", seasonNumber: 1, title: "The Bear" },
        log: {
            status: "completed",
            rating: 94,
            notes: "Relentless kitchen tension with an extraordinary soundtrack. Episode 7 is a masterclass.",
            loggedAt: "2024-07-20T21:30:00.000Z",
            startedAt: "2024-07-18T19:00:00.000Z",
            finishedAt: "2024-07-20T21:30:00.000Z",
            tags: ["drama", "chef"],
        },
    },
    {
        mediaTypeName: "tv",
        provider: "tmdb",
        lookup: { id: 95396, kind: "season", seasonNumber: 1, title: "Severance" },
        log: {
            status: "in progress",
            rating: 92,
            notes: "Intriguing corporate dystopia. The finale buildup is incredible.",
            loggedAt: "2024-08-01T20:00:00.000Z",
            startedAt: "2024-08-01T19:00:00.000Z",
            tags: ["sci-fi", "mystery"],
        },
    },
    {
        mediaTypeName: "tv",
        provider: "tmdb",
        lookup: { id: 94605, kind: "season", seasonNumber: 1, title: "Arcane" },
        log: {
            status: "completed",
            rating: 96,
            notes: "Breathtaking painterly animation and emotional character arcs.",
            loggedAt: "2024-04-10T22:00:00.000Z",
            startedAt: "2024-04-01T20:00:00.000Z",
            finishedAt: "2024-04-10T22:00:00.000Z",
            tags: ["animation", "masterpiece"],
        },
        collections: ["All-time favourites"],
    },
    {
        mediaTypeName: "tv",
        provider: "tmdb",
        lookup: { id: 1396, kind: "show", title: "Breaking Bad" },
        log: {
            status: "completed",
            rating: null,
            notes: "One of the greatest complete television dramas ever made. Revisit pending.",
            loggedAt: "2024-01-15T21:00:00.000Z",
            startedAt: "2023-11-01T19:00:00.000Z",
            finishedAt: "2024-01-15T21:00:00.000Z",
            tags: ["drama", "crime"],
        },
    },
]
