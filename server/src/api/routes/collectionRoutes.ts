import express from "express"
import {
    getCollections,
    getCollectionById,
    createCollection,
    updateCollection,
    deleteCollection,
    addItemToCollection,
    removeItemFromCollection,
    reorderCollection,
} from "@/api/controllers/collectionController.js"

const router = express.Router()

router.get("/", getCollections)
router.post("/", createCollection)
router.get("/:id", getCollectionById)
router.patch("/:id", updateCollection)
router.delete("/:id", deleteCollection)
router.post("/:id/items", addItemToCollection)
router.delete("/:id/items/:logId", removeItemFromCollection)
router.put("/:id/order", reorderCollection)

export default router
