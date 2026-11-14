import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import EmptyState from "@/components/EmptyState"
import BlueDude from "@/components/BlueDude"
import { PageShell } from "@/components/layout/PageShell"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  fetchCollections,
  fetchCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  addCollectionItem,
  removeCollectionItem,
  reorderCollection,
} from "@/api/collections"
import { moveItem, buildOrderPayload } from "@/lib/collectionHelpers"
import { EMPTY_LINES, pickLoadingLine } from "@/lib/whimsy"
import { CollectionCard } from "@/components/collections/CollectionCard"
import { EditCollectionDialog } from "@/components/collections/EditCollectionDialog"
import { AddLogsDialog } from "@/components/collections/AddLogsDialog"
import { ViewControls } from "@/components/media-view/ViewControls"
import { useStoredView } from "@/hooks/useStoredView"
import { LogRow } from "@/components/logs/LogRow"
import { LogTile } from "@/components/logs/LogTile"
import EntityDialog from "@/components/dialogs/EntityDialog"
import { ConfirmDeleteDialog } from "@/components/dialogs/ConfirmDeleteDialog"
import { LogForm } from "@/forms/LogForm"
import { editLog, deleteLog, deleteWarningLog } from "@/api/logs"
import type {
  CollectionItem,
  CreateCollectionInput,
  DialogName,
  Log,
} from "@/types/mainTypes"

export default function CollectionsSection() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [addLogsDialogOpen, setAddLogsDialogOpen] = useState(false)
  const [announcement, setAnnouncement] = useState("")

  // Log editing & deleting
  const [openLogDialog, setOpenLogDialog] = useState<DialogName>(null)
  const [targetLog, setTargetLog] = useState<Log | null>(null)

  // View mode persisted under collections.view (default "list")
  const [view, setView] = useStoredView("collections.view")

  // Focus retention ref
  const focusPendingRef = useRef<{ logId: number; action: string } | null>(null)

  // Local optimistic items for the active collection detail view
  const [optimisticItems, setOptimisticItems] = useState<CollectionItem[] | null>(null)

  // Query collections list
  const {
    data: collections = [],
    isLoading: isListLoading,
  } = useQuery({
    queryKey: ["collections"],
    queryFn: fetchCollections,
  })

  // Query active collection detail
  const {
    data: activeCollection,
    isLoading: isDetailLoading,
    error: detailError,
  } = useQuery({
    queryKey: ["collection", selectedId],
    queryFn: () => fetchCollection(selectedId!),
    enabled: selectedId != null,
  })

  // Keep optimisticItems in sync with fetched activeCollection
  useEffect(() => {
    if (activeCollection) {
      setOptimisticItems(activeCollection.items)
    } else {
      setOptimisticItems(null)
    }
  }, [activeCollection])

  // Restore focus after optimistic reorder
  useEffect(() => {
    if (focusPendingRef.current) {
      const { logId, action } = focusPendingRef.current
      focusPendingRef.current = null
      requestAnimationFrame(() => {
        const btn = document.querySelector<HTMLButtonElement>(
          `button[data-log-id="${logId}"][data-action="${action}"]`
        )
        btn?.focus()
      })
    }
  }, [optimisticItems])

  // Mutations
  const createMutation = useMutation({
    mutationFn: (values: CreateCollectionInput) => createCollection(values),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      setSelectedId(created.id)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (values: CreateCollectionInput) => {
      if (!selectedId) throw new Error("No collection selected")
      return updateCollection(selectedId, values)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      queryClient.invalidateQueries({ queryKey: ["collection", selectedId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error("No collection selected")
      return deleteCollection(selectedId)
    },
    onSuccess: () => {
      setDeleteDialogOpen(false)
      setSelectedId(null)
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async ({
      collectionId,
      items,
    }: {
      collectionId: number
      items: CollectionItem[]
    }) => {
      const payload = buildOrderPayload(items)
      return reorderCollection(collectionId, payload.logIds)
    },
    onError: (_err, _vars, context: { previousItems?: CollectionItem[] } | undefined) => {
      if (context?.previousItems) {
        setOptimisticItems(context.previousItems)
      }
      queryClient.invalidateQueries({ queryKey: ["collection", selectedId] })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      queryClient.invalidateQueries({ queryKey: ["collection", selectedId] })
    },
  })

  const editLogMutation = useMutation({
    mutationFn: editLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", selectedId] })
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
      queryClient.invalidateQueries({ queryKey: ["tags"] })
      setOpenLogDialog(null)
    },
  })

  const deleteLogMutation = useMutation({
    mutationFn: deleteLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collection", selectedId] })
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
      queryClient.invalidateQueries({ queryKey: ["tags"] })
      setOpenLogDialog(null)
    },
  })

  const handleEditClick = (log: Log) => {
    setTargetLog(log)
    setOpenLogDialog("logForm")
  }

  const handleDeleteClick = (log: Log) => {
    setTargetLog(log)
    setOpenLogDialog("deleteConfirm")
  }

  const renderLogForm = useCallback(
    (
      formData: Partial<Log>,
      setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>
    ) => {
      if (!targetLog) return null
      return <LogForm formData={formData} setFormData={setFormData} targetMedia={targetLog.media} />
    },
    [targetLog]
  )

  const handleMove = (index: number, newIndex: number, action: string) => {
    if (!selectedId || !optimisticItems) return
    if (newIndex < 0 || newIndex >= optimisticItems.length || index === newIndex) return

    const item = optimisticItems[index]
    const previousItems = optimisticItems
    const nextItems = moveItem(optimisticItems, index, newIndex)

    // Save pending focus target
    focusPendingRef.current = { logId: item.log.id, action }

    // Update optimistic list
    setOptimisticItems(nextItems)

    // Announce polite live message (1-based position)
    setAnnouncement(`Moved ${item.log.media.title} to position ${newIndex + 1}`)

    // Run mutation with rollback context
    reorderMutation.mutate(
      { collectionId: selectedId, items: nextItems },
      // @ts-expect-error tanstack react-query mutation options context
      { previousItems }
    )
  }

  const handleRemoveItem = async (logId: number) => {
    if (!selectedId) return
    try {
      await removeCollectionItem(selectedId, logId)
      queryClient.invalidateQueries({ queryKey: ["collection", selectedId] })
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    } catch {
      // handled by react-query
    }
  }

  const handleApplyLogsDiff = async (diff: { added: number[]; removed: number[] }) => {
    if (!selectedId) return
    for (const id of diff.added) {
      await addCollectionItem(selectedId, id)
    }
    for (const id of diff.removed) {
      await removeCollectionItem(selectedId, id)
    }
    queryClient.invalidateQueries({ queryKey: ["collection", selectedId] })
    queryClient.invalidateQueries({ queryKey: ["collections"] })
    queryClient.invalidateQueries({ queryKey: ["logs"] })
  }

  // Live polite region always mounted
  const liveRegion = (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  )

  // --------------------------------------------------------------------------
  // Detail View
  // --------------------------------------------------------------------------
  if (selectedId != null) {
    if (isDetailLoading) {
      return (
        <PageShell
          back={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedId(null)}
              className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
              aria-label="Back to collections"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to collections
            </Button>
          }
          title="Collection"
        >
          <p className="text-sm text-muted-foreground">{pickLoadingLine()}</p>
        </PageShell>
      )
    }

    if (detailError || !activeCollection) {
      return (
        <PageShell
          back={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedId(null)}
              className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
              aria-label="Back to collections"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to collections
            </Button>
          }
          title="Collection"
        >
          <p className="text-sm text-destructive">Collection not found.</p>
        </PageShell>
      )
    }

    const items = optimisticItems ?? activeCollection.items
    const countLabel = `${items.length} ${items.length === 1 ? "item" : "items"}${
      activeCollection.ranked ? " · Ranked" : ""
    }`

    return (
      <PageShell
        back={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedId(null)}
            className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
            aria-label="Back to collections"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to collections
          </Button>
        }
        title={
          <div>
            <h1 className="font-display text-4xl font-semibold break-words">
              {activeCollection.name}
            </h1>
            <p className="text-xs text-muted-foreground mt-1 tabular-nums">{countLabel}</p>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ViewControls view={view} onView={setView} />
            <Button
              size="sm"
              variant="amber"
              className="rounded-full"
              onClick={() => setAddLogsDialogOpen(true)}
              aria-label="Add logs to collection"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add logs
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => setEditDialogOpen(true)}
              aria-label={`Edit ${activeCollection.name}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
              aria-label={`Delete ${activeCollection.name}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        }
        controls={
          activeCollection.description ? (
            <p className="text-sm text-muted-foreground max-w-2xl break-words">
              {activeCollection.description}
            </p>
          ) : undefined
        }
      >
        {liveRegion}

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border rounded-lg text-center space-y-4">
            <BlueDude size={48} mood="lookDown" />
            <p className="text-sm text-muted-foreground">{EMPTY_LINES.emptyCollection}</p>
            <Button
              variant="amber"
              size="sm"
              className="rounded-full"
              onClick={() => setAddLogsDialogOpen(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add logs
            </Button>
          </div>
        ) : view === "grid" ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
            {items.map((item, index) => (
              <LogTile
                key={item.log.id}
                log={item.log}
                badge={String(index + 1)}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                extraActions={
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      disabled={index === 0}
                      data-log-id={item.log.id}
                      data-action="up"
                      onClick={() => handleMove(index, index - 1, "up")}
                      aria-label={`Move ${item.log.media.title} up`}
                    >
                      <ChevronUp className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      disabled={index === items.length - 1}
                      data-log-id={item.log.id}
                      data-action="down"
                      onClick={() => handleMove(index, index + 1, "down")}
                      aria-label={`Move ${item.log.media.title} down`}
                    >
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                }
                extraMenuItems={
                  <DropdownMenuItem onSelect={() => handleRemoveItem(item.log.id)}>
                    Remove from collection
                  </DropdownMenuItem>
                }
              />
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item, index) => (
              <LogRow
                key={item.log.id}
                log={item.log}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                leading={
                  <div className="flex items-center gap-2">
                    <span
                      className="font-display text-base font-semibold tabular-nums text-muted-foreground min-w-6 text-center"
                      aria-label={`Position ${index + 1}`}
                    >
                      {index + 1}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        disabled={index === 0}
                        data-log-id={item.log.id}
                        data-action="up"
                        onClick={() => handleMove(index, index - 1, "up")}
                        aria-label={`Move ${item.log.media.title} up`}
                      >
                        <ChevronUp className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        disabled={index === items.length - 1}
                        data-log-id={item.log.id}
                        data-action="down"
                        onClick={() => handleMove(index, index + 1, "down")}
                        aria-label={`Move ${item.log.media.title} down`}
                      >
                        <ChevronDown className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                }
                extraMenuItems={
                  <DropdownMenuItem onSelect={() => handleRemoveItem(item.log.id)}>
                    Remove from collection
                  </DropdownMenuItem>
                }
              />
            ))}
          </ul>
        )}

        <EditCollectionDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          initialValues={{
            name: activeCollection.name,
            description: activeCollection.description,
            ranked: activeCollection.ranked,
          }}
          title="Edit collection"
          submitText="Save changes"
          onSubmit={async (values) => {
            await updateMutation.mutateAsync(values)
          }}
        />

        <AddLogsDialog
          open={addLogsDialogOpen}
          onOpenChange={setAddLogsDialogOpen}
          collectionId={activeCollection.id}
          collectionTitle={activeCollection.name}
          initialLogIds={items.map((it) => it.log.id)}
          onApply={handleApplyLogsDiff}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-2">
                <BlueDude size={32} mood="lookAway" />
                <AlertDialogTitle className="font-display font-semibold">
                  Delete collection?
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{activeCollection.name}&rdquo;? Your logs
                will be kept.
              </AlertDialogDescription>
              <p className="font-hand text-muted-foreground">
                it&apos;ll be like it never happened.
              </p>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <EntityDialog
          mode="edit"
          open={openLogDialog === "logForm"}
          onOpenChange={(isOpen) => setOpenLogDialog(isOpen ? "logForm" : null)}
          target={targetLog}
          onSubmit={(formData) => editLogMutation.mutateAsync(formData)}
          renderForm={renderLogForm}
        />

        <ConfirmDeleteDialog
          open={openLogDialog === "deleteConfirm"}
          onOpenChange={(isOpen) => setOpenLogDialog(isOpen ? "deleteConfirm" : null)}
          target={targetLog}
          onWarning={deleteWarningLog}
          onDelete={deleteLogMutation.mutateAsync}
        />
      </PageShell>
    )
  }

  // --------------------------------------------------------------------------
  // Index View (Collections Grid)
  // --------------------------------------------------------------------------
  return (
    <PageShell
      title="Collections"
      actions={
        <Button
          variant="amber"
          size="default"
          className="rounded-full"
          onClick={() => setNewDialogOpen(true)}
          aria-label="Create new collection"
        >
          <Plus className="size-4" aria-hidden="true" />
          New collection
        </Button>
      }
    >
      {liveRegion}

      {isListLoading ? (
        <p className="text-sm text-muted-foreground">{pickLoadingLine()}</p>
      ) : collections.length === 0 ? (
        <EmptyState line={EMPTY_LINES.noCollections} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {collections.map((col) => (
            <CollectionCard
              key={col.id}
              collection={col}
              onSelect={(id) => setSelectedId(id)}
            />
          ))}
        </div>
      )}

      <EditCollectionDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        title="New collection"
        submitText="Create collection"
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values)
        }}
      />
    </PageShell>
  )
}
