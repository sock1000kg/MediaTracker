import { apiFetch } from "./clientWrapper"
import type {
  CollectionSummary,
  CollectionDetail,
  CreateCollectionInput,
  UpdateCollectionInput,
} from "@/types/mainTypes"

export async function fetchCollections(): Promise<CollectionSummary[]> {
  return apiFetch("/collections")
}

export async function fetchCollection(id: string): Promise<CollectionDetail> {
  return apiFetch(`/collections/${id}`)
}

export async function createCollection(data: CreateCollectionInput): Promise<CollectionDetail> {
  return apiFetch("/collections", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateCollection(
  id: string,
  data: UpdateCollectionInput
): Promise<CollectionDetail> {
  return apiFetch(`/collections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteCollection(id: string): Promise<void> {
  return apiFetch(`/collections/${id}`, {
    method: "DELETE",
  })
}

export async function addCollectionItem(
  collectionId: string,
  logId: string
): Promise<{ collectionId: string; logId: string; position: number }> {
  return apiFetch(`/collections/${collectionId}/items`, {
    method: "POST",
    body: JSON.stringify({ logId }),
  })
}

export async function removeCollectionItem(
  collectionId: string,
  logId: string
): Promise<void> {
  return apiFetch(`/collections/${collectionId}/items/${logId}`, {
    method: "DELETE",
  })
}

export async function reorderCollection(
  collectionId: string,
  logIds: string[]
): Promise<{ message: string }> {
  return apiFetch(`/collections/${collectionId}/order`, {
    method: "PUT",
    body: JSON.stringify({ logIds }),
  })
}
