import { apiFetch } from "./clientWrapper"
import type { Letter, LetterSummary, NewLetter } from "@/types/letters"

export async function fetchLetters(): Promise<Letter[]> {
  return apiFetch("/letters")
}

export async function fetchLetterSummary(): Promise<LetterSummary> {
  return apiFetch("/letters/summary")
}

export async function createLetter(letter: NewLetter): Promise<Letter> {
  return apiFetch("/letters", { method: "POST", body: JSON.stringify(letter) })
}

/** The only way to get a letter's text before it has been opened. 409 while it is sealed. */
export async function openLetter(id: string): Promise<Letter> {
  return apiFetch(`/letters/${id}/open`, { method: "POST" })
}

export async function deleteLetter(id: string): Promise<void> {
  return apiFetch(`/letters/${id}`, { method: "DELETE" })
}
