# Data providers and their terms

MediaTracker gets its catalogue data from outside services. This page lists each one: what we use it for, the rules we follow, what we must not do, and the attribution it requires. Summaries are as of **2026-11-17** and are not legal advice; the linked terms are what counts. Check them again before adding a feature that uses provider data in a new way.

## Ground rules for every provider

- **Non-commercial only.** No ads, paid tiers, selling data or access. Almost every free licence below depends on this.
- **No AI or machine learning on provider data.** Never train, fine-tune or embed provider text (descriptions, reviews, keywords) and never feed it to a chatbot. Recommendation features may use the user's own notes, tags and ratings, and open data (Wikidata, Wikipedia, Open Library, MusicBrainz).
- **No redistribution.** No exports of provider catalogues, no public API or feed that serves their data, no dataset downloads. A user's export of their own journal is fine.
- **On-demand only.** Search when a person searches; fetch details when they log. No crawling, bulk downloads or background catalogue sync.
- **API keys are per application.** One key or token identifies the app, not the person searching. Each instance uses keys its owner (or each user) registered; keys are stored encrypted and never shown again.

## At a glance

| Provider | Used for | Key | Attribution we must show |
|---|---|---|---|
| Open Library | Book search, covers | None | Credit Open Library (we do) |
| Last.fm | Music search, tags | Per-user API key | Credit and link back to Last.fm |
| MusicBrainz | Album tracklists, release ids | None | Credit MusicBrainz (we do) |
| Cover Art Archive | Music covers | None | Credit the Cover Art Archive (Music search credit line) |
| AniList | Anime and manga search, MAL id lookups | None | None required; never use "AniList" in our app's name |
| TMDB | Movies and TV | Per-user API key | TMDB logo + "not endorsed" notice |
| RAWG | Video games | Per-user API key | Live link to RAWG on every page using its data |
| BoardGameGeek | Board games | Per-user app token | Credit BGG by name + "Powered by BGG" logo |
| Google Books | Not active (service kept, UI disabled) | Per-user key | Google's branding rules if ever re-enabled |

---

## Open Library
**Terms:** [openlibrary.org/developers/api](https://openlibrary.org/developers/api)
- **Rules:** identify every request with a `User-Agent` that includes a contact email (we send `MediaTracker/<version> (<CONTACT_EMAIL>)`; keep `CONTACT_EMAIL` set). Identified requests get 3 req/s, anonymous 1 req/s.
- **Don't:** use it as a bulk data backend or for high-traffic commercial services; bulk-download metadata through the API (use their monthly dumps instead).
- **Attribution:** none formally required; we credit Open Library on Book search.

## Last.fm
**Terms:** [last.fm/api/tos](https://www.last.fm/api/tos)
- **Rules:** non-commercial use only (§3.1); credit Last.fm and link back to its catalogue pages (§2.7, §4.2.2); keep at most 100 MB of Last.fm data stored at any time and cache per the response headers (§4.3.4); respect their rate limits (§4.4).
- **Don't:** **use Last.fm images or album art**: they're excluded from the licence (§5.1.8). Music covers come from the Cover Art Archive instead. Don't sublicense the data, identify or contact Last.fm users from it, or subject it to derogatory treatment.
- **On termination:** delete Last.fm data (§9.3).
- **Attribution:** "Music data from Last.fm" with a link, plus per-item links.

## MusicBrainz
**Terms:** [musicbrainz.org/doc/MusicBrainz_API](https://musicbrainz.org/doc/MusicBrainz_API) and [rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- **Rules:** at most **1 request per second**; a meaningful `User-Agent` with contact info. Core data is CC0; some supplementary data (e.g. tags, annotations) is CC BY-NC-SA.
- **Don't:** exceed the rate limit or send requests without a User-Agent.
- **Attribution:** not required for CC0 core data; album tracklists from MusicBrainz show "Tracklist from MusicBrainz".

## Cover Art Archive
**About:** [coverartarchive.org](https://coverartarchive.org) (run by MetaBrainz with the Internet Archive)
- **Rules:** link images through `coverartarchive.org/release/<mbid>/front-250` URLs; expect 404 when a release has no front image (the client falls back to the lettered cover).
- **Note:** the artwork itself belongs to its rights holders; the archive makes it available for this kind of display. Don't re-host or sell the images.
- **Attribution:** credit the Cover Art Archive: Music search's credit line reads "Data from Last.fm · covers from the Cover Art Archive".

## AniList
**Terms:** [AniList API terms of use](https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/terms-of-use), [rate limiting](https://docs.anilist.co/guide/rate-limiting)
- **Rules:** free for non-commercial use (and commercial under $150/month revenue); 90 requests/minute with a burst limiter (sometimes degraded to 30/minute).
- **Don't:** use the API as a backup or data-storage service; hoard or mass-collect data; put "AniList" or "AniChart" in the app's name (if ever used, it must say "unofficial" / "for AniList").
- **Known grey area:** AniList bars competing "list or tracker services" unless they provide "significant sustained integration/syncing" with AniList accounts, or are authorised on request. MediaTracker is a self-hosted, invite-only, multi-media journal, like other open-source trackers that use AniList without sync. AniList sync was considered and dropped (2026-11-17); if AniList ever objects, ask them directly or revisit sync.
- **Attribution:** none required; we credit AniList on Anime & manga search.

## TMDB (The Movie Database)
**Terms:** [themoviedb.org/api-terms-of-use](https://www.themoviedb.org/api-terms-of-use), [logos and attribution](https://www.themoviedb.org/about/logos-attribution)
- **Rules:** non-commercial under the standard licence (commercial needs a written agreement, §2); **don't cache TMDB data for more than 6 months** (§1.C): the daily `tmdb.refresh` job re-fetches it, or purges description and image when no key holder exists or TMDB returns 404.
- **Don't:** sell, lease or sublicense the API or TMDB content; make derivatives of TMDB content; use TMDB as an image host for ads or graphics; use TMDB content for training, or in connection with, a machine-learning or AI-based application (TMDB reserves this right); run excessive bandwidth.
- **On termination:** promptly delete all TMDB content, including cached content (§1.D).
- **Attribution:** the TMDB logo (we use "Alt short (blue)" from their logo page, unmodified, less prominent than our own branding) **and** the notice "This product uses the TMDB API but is not endorsed or certified by TMDB." Shown on Movie and TV search, in Settings → API Keys, and in the README.

## RAWG
**Terms:** [rawg.io/apidocs](https://rawg.io/apidocs)
- **Rules:** free for personal and hobby projects (commercial use free under 100,000 monthly active users, otherwise a paid plan); the free plan allows 20,000 requests per month.
- **Don't:** redistribute the data, resell it, or make it available to other businesses.
- **Attribution:** **an active hyperlink to RAWG on every page that uses RAWG data** (Game search credit and each item's "View on RAWG" link).

## BoardGameGeek
**Terms:** [Using the XML API](https://boardgamegeek.com/using_the_xml_api), [XML API Terms of Use](https://boardgamegeek.com/wiki/page/XML_API_Terms_of_Use)
- **Rules:** a registered **application token** is required (`Authorization: Bearer <token>`, host `boardgamegeek.com` without `www`). Tokens belong to an application, not a person; register as **non-commercial**, describing the app honestly. Licence is "solely for strictly non-commercial purposes". Space requests out (about one every few seconds), and batch `thing` lookups (max 20 ids).
- **Don't:** **modify the data**: descriptions and ratings are stored exactly as received and only formatted for display; use the API or any site data to **train an AI or LLM**; use it commercially without a separate licence (ads, paid features, merchandise, even supporting a non-profit event count as commercial); interfere with BGG's servers; hotlink-heavy image use (prefer their own image URLs sparingly).
- **Attribution:** credit **BoardGameGeek** by name **and** show the **"Powered by BGG" logo** (their file, unmodified; we show it on a white plate so it reads in dark mode). Shown on Game search in board games mode.

## Google Books (not active)
- The server still has a Google Books service and accepts a `google_books` key, but book search uses Open Library and the UI for it is disabled.
- If re-enabled: follow Google's [API terms](https://developers.google.com/terms) and [branding guidelines](https://developers.google.com/books/branding) ("Powered by Google" attribution, no caching beyond what they allow).

## Not APIs (user-uploaded files)

The Goodreads, MyAnimeList and Letterboxd imports read **export files the user uploads**. We don't call those services' APIs. Goodreads book pages are only linked to by URL.

## Planned, not used yet

For cross-media recommendations, only open sources are planned, plus the user's own data:
- **Wikidata** ([CC0](https://www.wikidata.org/wiki/Wikidata:Licensing)): structured links (genre, main subject, "based on", series) and provider ids. Free to use; query the API politely with a User-Agent.
- **Wikipedia** ([CC BY-SA 4.0](https://en.wikipedia.org/wiki/Wikipedia:Copyrights)): plot and premise text for embeddings. Credit Wikipedia; share-alike applies to anything we republish (internal ranking only is the plan).
- Self-hosted embedding models only, opt-in, off on the public demo. Never embed TMDB, BGG, Last.fm or RAWG text.
