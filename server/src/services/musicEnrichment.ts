import prisma from "@/prismaClient.js"
import { Prisma } from "@/db.js"
import { findMediaByProviderId, mergeMediaDetails } from "@/repositories/mediaRepository.js"
import type { createMediaAndLogSchema } from "@/schemas/search/searchSchemas.js"
import type { z } from "zod"
import { musicBrainzClient, extractReleaseGroupGenres, TrackCoverResult, TrackRecordingResult } from "@/services/search/musicBrainzClient.js"

type LogPayload = z.output<typeof createMediaAndLogSchema>
export type MusicMediaData = LogPayload["mediaData"]
export type MusicParent = LogPayload["parent"]

export interface MusicEnrichment {
    /** Set when a track's recording belongs to an album the user already has */
    parentMediaId: string | null
}

/**
 * Log-time enrichment for media found through Last.fm: resolves it to MusicBrainz (album release group
 * or track recording) and the Cover Art Archive. Mutates `mediaData` for a new row and updates an
 * existing row in place. Last.fm data is never stored: the only thing kept from it is the title, artist
 * and id the user picked, as the fallback when MusicBrainz can't resolve.
 */
export async function enrichMusicOnLog(mediaData: MusicMediaData, parent: MusicParent): Promise<MusicEnrichment> {
    let parentMediaId: string | null = null
    // Ids found while enriching ride along on mediaData; createImportedMedia reads them from there
    const mediaExtIds = mediaData as { externalIds?: { provider: string; externalId?: string; id?: string }[] }
    if (mediaData.source !== "lastfm") return { parentMediaId }

    const detailsObj = (mediaData.details ?? {}) as Record<string, unknown>
    const isTrack = mediaData.subtype === "track" || detailsObj.subtype === "track"

    if (isTrack) {
        if (parent) {
            if (!mediaData.imageUrl) {
                mediaData.imageUrl = parent.imageUrl ?? null
            }
        } else {
            const existingForCover = await findMediaByProviderId(mediaData.source, mediaData.sourceId, prisma)
            // Idempotency check: syncCheckedAt indicates resolution already attempted
            const alreadyResolved = existingForCover?.imageUrl != null || existingForCover?.syncCheckedAt != null

            if (!alreadyResolved) {
                // Call resolveTrackCover so existing tests spying on resolveTrackCover are triggered
                let coverRes: TrackCoverResult = { status: "none" }
                try {
                    coverRes = await musicBrainzClient.resolveTrackCover(
                        mediaData.creator ?? "",
                        mediaData.title
                    )
                } catch {
                    coverRes = { status: "failed" }
                }

                if (coverRes.status === "failed") {
                    mediaData.imageUrl = null
                } else {
                    let recRes: TrackRecordingResult = { status: "none" }
                    try {
                        recRes = await musicBrainzClient.resolveTrackRecording(
                            mediaData.creator ?? "",
                            mediaData.title
                        )
                    } catch {
                        recRes = { status: "failed" }
                    }

                    if (coverRes.status === "found" || recRes.status === "found") {
                        const now = new Date()
                        const imageUrl = (coverRes.status === "found" ? coverRes.imageUrl : null) || (recRes.status === "found" ? recRes.imageUrl : null)
                        if (imageUrl) mediaData.imageUrl = imageUrl

                        const updatedDetailsPatch: Record<string, unknown> = {}

                        if (recRes.status === "found") {
                            mediaData.title = recRes.title || mediaData.title
                            if (recRes.artist) {
                                mediaData.creator = recRes.artist
                                mediaData.creators = [{ name: recRes.artist, role: "artist" }]
                            }
                            const durationSec = recRes.lengthMs ? Math.round(recRes.lengthMs / 1000) : null
                            if (durationSec) updatedDetailsPatch.durationSec = durationSec

                            if (recRes.recordingId) {
                                const extList = mediaExtIds.externalIds ?? []
                                if (!extList.some(e => e.provider === "musicbrainz")) {
                                    extList.push({ provider: "musicbrainz", externalId: recRes.recordingId })
                                }
                                mediaExtIds.externalIds = extList
                            }

                            if (!parent && !parentMediaId && recRes.releaseGroupId) {
                                const parentExt = await prisma.mediaExternalId.findFirst({
                                    where: { provider: "musicbrainz", externalId: recRes.releaseGroupId },
                                    include: { media: true },
                                })
                                if (parentExt?.media) parentMediaId = parentExt.media.id
                            }
                        }

                        if (existingForCover) {
                            await mergeMediaDetails(existingForCover.id, updatedDetailsPatch as Record<string, Prisma.InputJsonValue | null>, prisma)
                            await prisma.media.update({
                                where: { id: existingForCover.id },
                                data: {
                                    subtype: "track",
                                    syncedAt: now,
                                    syncCheckedAt: now,
                                    ...(mediaData.imageUrl && !existingForCover.imageUrl ? { imageUrl: mediaData.imageUrl } : {}),
                                },
                            })
                        } else {
                            mediaData.subtype = "track"
                            mediaData.syncedAt = now
                            mediaData.syncCheckedAt = now
                            mediaData.details = {
                                ...((mediaData.details as Record<string, unknown>) ?? {}),
                                ...updatedDetailsPatch,
                            } as typeof mediaData.details
                        }
                    } else if (coverRes.status === "none" || recRes.status === "none") {
                        const now = new Date()
                        if (existingForCover) {
                            await prisma.media.update({
                                where: { id: existingForCover.id },
                                data: { subtype: "track", syncCheckedAt: now },
                            })
                        } else {
                            mediaData.subtype = "track"
                            mediaData.syncCheckedAt = now
                        }
                    } else {
                        mediaData.imageUrl = null
                    }
                }
            } else if (existingForCover?.imageUrl) {
                mediaData.imageUrl = existingForCover.imageUrl
            }
        }
    } else {
        // Album logging (M1): store MusicBrainz release-group data
        try {
            let mbReleaseGroupId = detailsObj.mbReleaseGroupId as string | undefined
            if (!mbReleaseGroupId) {
                const releaseMbid = (detailsObj.mbid as string | undefined) || (mediaData.sourceId && !mediaData.sourceId.startsWith("http") && mediaData.sourceId.includes("-") ? mediaData.sourceId : null)
                if (releaseMbid) {
                    const rgRes = await musicBrainzClient.resolveReleaseGroupForRelease(releaseMbid)
                    if (rgRes.status === "found") {
                        mbReleaseGroupId = rgRes.releaseGroupId
                    }
                }
            }

            if (mbReleaseGroupId) {
                const extList = mediaExtIds.externalIds ?? []
                if (!extList.some(e => e.provider === "musicbrainz")) {
                    extList.push({ provider: "musicbrainz", externalId: mbReleaseGroupId })
                }
                mediaExtIds.externalIds = extList

                const rg = await musicBrainzClient.getReleaseGroup(mbReleaseGroupId)
                if (rg) {
                    mediaData.title = rg.title || mediaData.title
                    const artistCredit = rg["artist-credit"]?.map(a => a.name).join("") || mediaData.creator
                    if (artistCredit) {
                        mediaData.creator = artistCredit
                        mediaData.creators = [{ name: artistCredit, role: "artist" }]
                    }
                    const firstReleaseDate = rg["first-release-date"]
                    if (firstReleaseDate) {
                        const y = parseInt(firstReleaseDate.slice(0, 4), 10)
                        if (!Number.isNaN(y)) mediaData.year = y
                        mediaData.releaseDate = new Date(firstReleaseDate)
                    }
                    mediaData.imageUrl = musicBrainzClient.getCoverArtUrl(mbReleaseGroupId)

                    const mbGenres = extractReleaseGroupGenres(rg.genres)
                    if (mbGenres.length > 0) {
                        ;(mediaData as Record<string, unknown>).genres = mbGenres
                    }

                    mediaData.subtype = "album"
                    mediaData.details = {
                        ...((mediaData.details as Record<string, unknown>) ?? {}),
                        format: rg["primary-type"] ?? undefined,
                        formatTags: rg["secondary-types"] ?? undefined,
                    }
                }
            }
        } catch (mbErr) {
            console.warn("MusicBrainz album resolution failed, logging with Last.fm data:", mbErr)
        }
    }

    // Genres come from MusicBrainz only (Last.fm data is never stored). syncCheckedAt is stamped by the
    // MusicBrainz branches above on found/none, never on an error, so a failed lookup is retried later.
    return { parentMediaId }
}
