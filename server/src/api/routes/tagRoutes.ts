import express from "express"
import {
    getTags,
    createTag,
    renameTag,
    deleteTag,
} from "@/api/controllers/tagController.js"

const router = express.Router()

router.get("/", getTags)
router.post("/", createTag)
router.patch("/:id", renameTag)
router.delete("/:id", deleteTag)

export default router
