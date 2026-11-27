import express from "express"
import {
    getLetters,
    getLetterSummary,
    createLetter,
    openLetter,
    deleteLetter,
} from "@/api/controllers/letterController.js"

const router = express.Router()

router.get("/", getLetters)
router.get("/summary", getLetterSummary)
router.post("/", createLetter)
router.post("/:id/open", openLetter)
router.delete("/:id", deleteLetter)
// No edit route on purpose: a sealed letter can't be changed

export default router
