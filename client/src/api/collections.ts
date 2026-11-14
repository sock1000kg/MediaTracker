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

export async function fetchCollection(id: number): Promise<CollectionDetail> {
  return apiFetch(`/collections/${id}`)
}

export async function createCollection(data: CreateCollectionInput): Promise<CollectionDetail> {
  return apiFetch("/collections", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function updateCollection(
  id: number,
  data: UpdateCollectionInput
): Promise<CollectionDetail> {
  return apiFetch(`/collections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export async function deleteCollection(id: number): Promise<void> {
  return apiFetch(`/collections/${id}`, {
    method: "DELETE",
  })
}

export async function addCollectionItem(
  collectionId: number,
  logId: number
): Promise<{ collectionId: number; logId: number; position: number }> {
  return apiFetch(`/collections/${collectionId}/items`, {
    method: "POST",
    body: JSON.stringify({ logId }),
  })
}

export async function removeCollectionItem(
  collectionId: number,
  logId: number
): Promise<void> {
  return apiFetch(`/collections/${collectionId}/items/${logId}`, {
    method: "DELETE",
  })
}

export async function reorderCollection(
  collectionId: number,
  logIds: number[]
): Promise<{ message: string }> {
  return apiFetch(`/collections/${collectionId}/order`, {
    method: "PUT",
    body: JSON.stringify({ logIds }),
  })
}
