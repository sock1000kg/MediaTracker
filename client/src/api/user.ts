import { apiFetch, apiFetchOk } from "./clientWrapper"
import { fallbackExportName, parseContentDispositionFilename } from "@/lib/contentDisposition"
import type { Preferences, PreferencesPatch, UserProfile } from "@/types/user"

export type ExportFormat = "json" | "csv"

export function fetchMe(): Promise<UserProfile> {
  return apiFetch("/users/me")
}

export function updateProfile(displayName: string): Promise<UserProfile> {
  return apiFetch("/users/me", { method: "PATCH", body: JSON.stringify({ displayName }) })
}

export async function changePassword(body: { currentPassword: string; newPassword: string }): Promise<{ accessToken: string }> {
  const res = await apiFetch<{ accessToken: string }>("/users/me/password", {
    method: "PUT",
    credentials: "include", // the new refresh cookie must be stored cross-origin
    body: JSON.stringify(body),
  })
  try {
    if (res?.accessToken) localStorage.setItem("accessToken", res.accessToken)
  } catch {
    // storage unavailable
  }
  return res
}

export function fetchPreferences(): Promise<Preferences> {
  return apiFetch("/users/me/preferences")
}

export function updatePreferences(patch: PreferencesPatch): Promise<Preferences> {
  return apiFetch("/users/me/preferences", { method: "PATCH", body: JSON.stringify(patch) })
}

export async function exportData(format: ExportFormat): Promise<string> {
  const res = await apiFetchOk(`/users/me/export?format=${format}`)
  const blob = await res.blob()
  const filename =
    parseContentDispositionFilename(res.headers.get("Content-Disposition")) ?? fallbackExportName(format)

  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
  return filename
}

export function deleteAccount(body: { password: string; confirmUsername: string }): Promise<unknown> {
  return apiFetch("/users/me", { method: "DELETE", credentials: "include", body: JSON.stringify(body) })
}
