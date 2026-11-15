import { apiFetch } from "./clientWrapper"
import type { Tag, TagItem } from "@/types/mainTypes"

export async function fetchTags(): Promise<Tag[]> {
  return apiFetch("/tags")
}

export async function createTag(name: string): Promise<TagItem> {
  return apiFetch("/tags", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export async function renameTag(id: number, name: string): Promise<TagItem> {
  return apiFetch(`/tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  })
}

export async function deleteTag(id: number): Promise<void> {
  return apiFetch(`/tags/${id}`, {
    method: "DELETE",
  })
}
