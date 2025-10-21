;; Content Registry Contract
;; Manages registration and status of user-generated content

;; Constants
(define-constant CONTRACT_OWNER tx-sender)

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u200))
(define-constant ERR_CONTENT_NOT_FOUND (err u201))
(define-constant ERR_INVALID_CID (err u202))
(define-constant ERR_CONTENT_ALREADY_EXISTS (err u203))
(define-constant ERR_INVALID_STATUS (err u204))
(define-constant ERR_NOT_CONTENT_AUTHOR (err u205))

;; Content status constants
(define-constant STATUS_ACTIVE "active")
(define-constant STATUS_FLAGGED "flagged")
(define-constant STATUS_REMOVED "removed")
(define-constant STATUS_APPEALING "appealing")
(define-constant STATUS_ARCHIVED "archived")

;; Archive constants (Phase 3)
(define-constant ARCHIVE_AFTER_BLOCKS u525600) ;; ~1 year in blocks (assuming 10 min blocks)

;; Data variables
(define-data-var content-counter uint u0)

;; Data maps
(define-map contents 
  {id: uint} 
  {
    author: principal,
    cid: (string-ascii 100),
    created-at: uint,
    status: (string-ascii 20),
    title: (string-ascii 200),
    category: (string-ascii 50)
  }
)

(define-map content-by-cid (string-ascii 100) uint)
(define-map author-content-count principal uint)

;; Register new content
(define-public (register-content (cid (string-ascii 100)) (title (string-ascii 200)) (category (string-ascii 50)))
  (let ((content-id (+ (var-get content-counter) u1))
        (current-block-height stacks-block-height))
    (begin
      ;; Validate inputs
      (asserts! (> (len cid) u0) ERR_INVALID_CID)
      (asserts! (> (len title) u0) ERR_INVALID_CID)
      (asserts! (is-none (map-get? content-by-cid cid)) ERR_CONTENT_ALREADY_EXISTS)
      
      ;; Create content record
      (map-set contents 
        {id: content-id}
        {
          author: tx-sender,
          cid: cid,
          created-at: current-block-height,
          status: STATUS_ACTIVE,
          title: title,
          category: category
        }
      )
      
      ;; Update mappings
      (map-set content-by-cid cid content-id)
      (var-set content-counter content-id)
      
      ;; Update author content count
      (let ((current-count (default-to u0 (map-get? author-content-count tx-sender))))
        (map-set author-content-count tx-sender (+ current-count u1))
      )
      
      ;; Emit event
      (print {
        action: "register-content",
        content-id: content-id,
        author: tx-sender,
        cid: cid,
        title: title,
        category: category,
        created-at: current-block-height
      })
      
      (ok content-id)
    )
  )
)

;; Update content status (only authorized contracts)
(define-public (update-content-status (content-id uint) (new-status (string-ascii 20)))
  (let ((content-data (unwrap! (map-get? contents {id: content-id}) ERR_CONTENT_NOT_FOUND)))
    (begin
      ;; Validate status
      (asserts! (or 
        (is-eq new-status STATUS_ACTIVE)
        (is-eq new-status STATUS_FLAGGED)
        (is-eq new-status STATUS_REMOVED)
        (is-eq new-status STATUS_APPEALING)
      ) ERR_INVALID_STATUS)
      
      ;; Only allow certain contracts to update status
      ;; Allow contract owner, content author, and other contracts in the system
      (asserts! (or
        (is-eq tx-sender CONTRACT_OWNER)
        (is-eq tx-sender (get author content-data))
        (is-eq contract-caller .flagging-system)
        (is-eq contract-caller .moderation-dao)
        (is-eq contract-caller .appeals)
      ) ERR_UNAUTHORIZED)
      
      ;; Update content status
      (map-set contents 
        {id: content-id}
        (merge content-data {status: new-status})
      )
      
      ;; Emit event
      (print {
        action: "update-content-status",
        content-id: content-id,
        old-status: (get status content-data),
        new-status: new-status,
        updated-by: tx-sender
      })
      
      (ok true)
    )
  )
)

;; Get content by ID
(define-read-only (get-content (content-id uint))
  (map-get? contents {id: content-id})
)

;; Get content ID by CID
(define-read-only (get-content-id-by-cid (cid (string-ascii 100)))
  (map-get? content-by-cid cid)
)

;; Get content by CID
(define-read-only (get-content-by-cid (cid (string-ascii 100)))
  (match (map-get? content-by-cid cid)
    content-id (map-get? contents {id: content-id})
    none
  )
)

;; Check if content exists
(define-read-only (content-exists (content-id uint))
  (is-some (map-get? contents {id: content-id}))
)

;; Get content status
(define-read-only (get-content-status (content-id uint))
  (match (map-get? contents {id: content-id})
    content-data (some (get status content-data))
    none
  )
)

;; Get content author
(define-read-only (get-content-author (content-id uint))
  (match (map-get? contents {id: content-id})
    content-data (some (get author content-data))
    none
  )
)

;; Check if user is content author
(define-read-only (is-content-author (content-id uint) (user principal))
  (match (map-get? contents {id: content-id})
    content-data (is-eq user (get author content-data))
    false
  )
)

;; Get author content count
(define-read-only (get-author-content-count (author principal))
  (default-to u0 (map-get? author-content-count author))
)

;; Get total content count
(define-read-only (get-total-content-count)
  (var-get content-counter)
)

;; Get contract owner
(define-read-only (get-contract-owner)
  CONTRACT_OWNER
)

;; Check if content is active
(define-read-only (is-content-active (content-id uint))
  (match (get-content-status content-id)
    status (is-eq status STATUS_ACTIVE)
    false
  )
)

;; Check if content is flagged
(define-read-only (is-content-flagged (content-id uint))
  (match (get-content-status content-id)
    status (is-eq status STATUS_FLAGGED)
    false
  )
)

;; Check if content is removed
(define-read-only (is-content-removed (content-id uint))
  (match (get-content-status content-id)
    status (is-eq status STATUS_REMOVED)
    false
  )
)

;; Check if content is appealing
(define-read-only (is-content-appealing (content-id uint))
  (match (get-content-status content-id)
    status (is-eq status STATUS_APPEALING)
    false
  )
)

;; Archive data map (Phase 3)
(define-map archived-content
  {content-id: uint}
  {
    archived-at: uint,
    reason: (string-ascii 100)
  }
)

;; Archive content (Phase 3)
(define-public (archive-content (content-id uint) (reason (string-ascii 100)))
  (let ((content-data (unwrap! (map-get? contents {id: content-id}) ERR_CONTENT_NOT_FOUND)))
    (begin
      (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
      (asserts! (> (len reason) u0) ERR_INVALID_STATUS)

      ;; Archive the content
      (map-set archived-content
        {content-id: content-id}
        {
          archived-at: stacks-block-height,
          reason: reason
        }
      )

      ;; Update content status to archived
      (map-set contents
        {id: content-id}
        (merge content-data {status: STATUS_ARCHIVED})
      )

      (print {action: "archive-content", content-id: content-id, reason: reason, archived-at: stacks-block-height})
      (ok true)
    )
  )
)

;; Get archived content info (Phase 3)
(define-read-only (get-archived-content (content-id uint))
  (map-get? archived-content {content-id: content-id})
)

;; Check if content is archived (Phase 3)
(define-read-only (is-content-archived (content-id uint))
  (match (get-content-status content-id)
    status (is-eq status STATUS_ARCHIVED)
    false
  )
)
