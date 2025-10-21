;; Flagging System Contract
;; Allows community members to flag inappropriate content for review

;; Flagging System Contract
;; Allows community members to flag inappropriate content for review

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant MIN_TOKEN_BALANCE u1000000) ;; Minimum tokens required to flag (1 token with 6 decimals)

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u300))
(define-constant ERR_CONTENT_NOT_FOUND (err u301))
(define-constant ERR_INVALID_REASON (err u302))
(define-constant ERR_ALREADY_FLAGGED (err u303))
(define-constant ERR_INSUFFICIENT_TOKENS (err u304))
(define-constant ERR_FLAG_NOT_FOUND (err u305))
(define-constant ERR_ALREADY_RESOLVED (err u306))
(define-constant ERR_CANNOT_FLAG_OWN_CONTENT (err u307))

;; Flag reason constants
(define-constant REASON_SPAM "spam")
(define-constant REASON_HARASSMENT "harassment")
(define-constant REASON_HATE_SPEECH "hate-speech")
(define-constant REASON_MISINFORMATION "misinformation")
(define-constant REASON_COPYRIGHT "copyright")
(define-constant REASON_INAPPROPRIATE "inappropriate")
(define-constant REASON_OTHER "other")

;; Data variables
(define-data-var flag-counter uint u0)

;; Data maps
(define-map flags 
  {flag-id: uint} 
  {
    content-id: uint,
    reporter: principal,
    reason: (string-ascii 100),
    description: (string-ascii 500),
    timestamp: uint,
    resolved: bool,
    resolution: (optional (string-ascii 50))
  }
)

(define-map content-flags 
  {content-id: uint, reporter: principal} 
  uint
)

(define-map content-flag-count uint uint)
(define-map reporter-flag-count principal uint)

;; Submit a flag for content
(define-public (flag-content (content-id uint) (reason (string-ascii 100)) (description (string-ascii 500)))
  (let ((flag-id (+ (var-get flag-counter) u1))
        (current-block-height stacks-block-height))
    (begin
      ;; Check if content exists (call content registry)
      (asserts! (contract-call? .content-registry content-exists content-id) ERR_CONTENT_NOT_FOUND)
      
      ;; Check if user has minimum token balance
      (asserts! (>= (unwrap-panic (contract-call? .governance-token get-balance tx-sender)) MIN_TOKEN_BALANCE) ERR_INSUFFICIENT_TOKENS)
      
      ;; Validate reason
      (asserts! (or 
        (is-eq reason REASON_SPAM)
        (is-eq reason REASON_HARASSMENT)
        (is-eq reason REASON_HATE_SPEECH)
        (is-eq reason REASON_MISINFORMATION)
        (is-eq reason REASON_COPYRIGHT)
        (is-eq reason REASON_INAPPROPRIATE)
        (is-eq reason REASON_OTHER)
      ) ERR_INVALID_REASON)
      
      ;; Check if user hasn't already flagged this content
      (asserts! (is-none (map-get? content-flags {content-id: content-id, reporter: tx-sender})) ERR_ALREADY_FLAGGED)
      
      ;; Check if user is not the content author
      (asserts! (not (contract-call? .content-registry is-content-author content-id tx-sender)) ERR_CANNOT_FLAG_OWN_CONTENT)
      
      ;; Create flag record
      (map-set flags 
        {flag-id: flag-id}
        {
          content-id: content-id,
          reporter: tx-sender,
          reason: reason,
          description: description,
          timestamp: current-block-height,
          resolved: false,
          resolution: none
        }
      )
      
      ;; Update mappings
      (map-set content-flags {content-id: content-id, reporter: tx-sender} flag-id)
      (var-set flag-counter flag-id)
      
      ;; Update flag counts
      (let ((current-content-flags (default-to u0 (map-get? content-flag-count content-id)))
            (current-reporter-flags (default-to u0 (map-get? reporter-flag-count tx-sender))))
        (map-set content-flag-count content-id (+ current-content-flags u1))
        (map-set reporter-flag-count tx-sender (+ current-reporter-flags u1))
      )
      
      ;; Update content status to flagged if this is the first flag
      (if (is-eq (get-content-flag-count content-id) u1)
        (try! (contract-call? .content-registry update-content-status content-id "flagged"))
        true
      )
      
      ;; Emit event
      (print {
        action: "flag-content",
        flag-id: flag-id,
        content-id: content-id,
        reporter: tx-sender,
        reason: reason,
        description: description,
        timestamp: current-block-height
      })
      
      (ok flag-id)
    )
  )
)

;; Resolve a flag (only authorized contracts)
(define-public (resolve-flag (flag-id uint) (resolution (string-ascii 50)))
  (let ((flag-data (unwrap! (map-get? flags {flag-id: flag-id}) ERR_FLAG_NOT_FOUND)))
    (begin
      ;; Check if flag is not already resolved
      (asserts! (not (get resolved flag-data)) ERR_ALREADY_RESOLVED)
      
      ;; Only allow authorized contracts to resolve flags
      (asserts! (or 
        (is-eq tx-sender CONTRACT_OWNER)
        (is-eq contract-caller (as-contract tx-sender))
      ) ERR_UNAUTHORIZED)
      
      ;; Update flag as resolved
      (map-set flags 
        {flag-id: flag-id}
        (merge flag-data {
          resolved: true,
          resolution: (some resolution)
        })
      )
      
      ;; Emit event
      (print {
        action: "resolve-flag",
        flag-id: flag-id,
        content-id: (get content-id flag-data),
        resolution: resolution,
        resolved-by: tx-sender
      })
      
      (ok true)
    )
  )
)

;; Get flag by ID
(define-read-only (get-flag (flag-id uint))
  (map-get? flags {flag-id: flag-id})
)

;; Get flag ID for content and reporter
(define-read-only (get-flag-id (content-id uint) (reporter principal))
  (map-get? content-flags {content-id: content-id, reporter: reporter})
)

;; Check if user has flagged content
(define-read-only (has-user-flagged-content (content-id uint) (reporter principal))
  (is-some (map-get? content-flags {content-id: content-id, reporter: reporter}))
)

;; Get content flag count
(define-read-only (get-content-flag-count (content-id uint))
  (default-to u0 (map-get? content-flag-count content-id))
)

;; Get reporter flag count
(define-read-only (get-reporter-flag-count (reporter principal))
  (default-to u0 (map-get? reporter-flag-count reporter))
)

;; Get total flag count
(define-read-only (get-total-flag-count)
  (var-get flag-counter)
)

;; Check if flag exists
(define-read-only (flag-exists (flag-id uint))
  (is-some (map-get? flags {flag-id: flag-id}))
)

;; Check if flag is resolved
(define-read-only (is-flag-resolved (flag-id uint))
  (match (map-get? flags {flag-id: flag-id})
    flag-data (get resolved flag-data)
    false
  )
)

;; Get flag resolution
(define-read-only (get-flag-resolution (flag-id uint))
  (match (map-get? flags {flag-id: flag-id})
    flag-data (get resolution flag-data)
    none
  )
)

;; Get contract owner
(define-read-only (get-contract-owner)
  CONTRACT_OWNER
)

;; Check if content has any flags
(define-read-only (has-content-flags (content-id uint))
  (> (get-content-flag-count content-id) u0)
)

;; Get minimum token balance required for flagging
(define-read-only (get-min-token-balance)
  MIN_TOKEN_BALANCE
)
