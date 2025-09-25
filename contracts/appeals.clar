;; Appeals Contract
;; Provides appeal mechanism for content creators to challenge moderation decisions

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant APPEAL_VOTING_PERIOD u288) ;; ~48 hours in blocks (assuming 10 min blocks)
(define-constant MIN_APPEAL_TOKENS u2000000) ;; Minimum tokens to create appeal (2 tokens with 6 decimals)
(define-constant APPEAL_QUORUM_PERCENTAGE u1) ;; 1% of total supply needed for appeal quorum

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u500))
(define-constant ERR_APPEAL_NOT_FOUND (err u501))
(define-constant ERR_CONTENT_NOT_REMOVED (err u502))
(define-constant ERR_NOT_CONTENT_AUTHOR (err u503))
(define-constant ERR_APPEAL_ALREADY_EXISTS (err u504))
(define-constant ERR_INSUFFICIENT_TOKENS (err u505))
(define-constant ERR_VOTING_ENDED (err u506))
(define-constant ERR_VOTING_NOT_ENDED (err u507))
(define-constant ERR_ALREADY_VOTED (err u508))
(define-constant ERR_APPEAL_ALREADY_RESOLVED (err u509))
(define-constant ERR_QUORUM_NOT_REACHED (err u510))

;; Data variables
(define-data-var appeal-counter uint u0)

;; Data maps
(define-map appeals 
  {appeal-id: uint} 
  {
    content-id: uint,
    appellant: principal,
    reason: (string-ascii 500),
    evidence: (string-ascii 1000),
    votes-for: uint,
    votes-against: uint,
    start-block: uint,
    end-block: uint,
    resolved: bool,
    result: (optional (string-ascii 20))
  }
)

(define-map appeal-votes 
  {appeal-id: uint, voter: principal} 
  {
    choice: bool, ;; true = restore content, false = uphold removal
    voting-power: uint,
    block-height: uint
  }
)

(define-map content-appeals uint uint) ;; content-id -> appeal-id

;; Create an appeal
(define-public (create-appeal (content-id uint) (reason (string-ascii 500)) (evidence (string-ascii 1000)))
  (let ((appeal-id (+ (var-get appeal-counter) u1))
        (current-block stacks-block-height)
        (end-block (+ current-block APPEAL_VOTING_PERIOD))
        (appellant-balance (unwrap-panic (contract-call? .governance-token get-balance tx-sender))))
    (begin
      ;; Check if appellant has minimum tokens
      (asserts! (>= appellant-balance MIN_APPEAL_TOKENS) ERR_INSUFFICIENT_TOKENS)
      
      ;; Check if content is removed
      (asserts! (contract-call? .content-registry is-content-removed content-id) ERR_CONTENT_NOT_REMOVED)

      ;; Check if user is the content author
      (asserts! (contract-call? .content-registry is-content-author content-id tx-sender) ERR_NOT_CONTENT_AUTHOR)
      
      ;; Check if appeal doesn't already exist for this content
      (asserts! (is-none (map-get? content-appeals content-id)) ERR_APPEAL_ALREADY_EXISTS)
      
      ;; Create appeal
      (map-set appeals 
        {appeal-id: appeal-id}
        {
          content-id: content-id,
          appellant: tx-sender,
          reason: reason,
          evidence: evidence,
          votes-for: u0,
          votes-against: u0,
          start-block: current-block,
          end-block: end-block,
          resolved: false,
          result: none
        }
      )
      
      ;; Update mappings
      (map-set content-appeals content-id appeal-id)
      (var-set appeal-counter appeal-id)
      
      ;; Update content status to appealing
      (try! (contract-call? .content-registry update-content-status content-id "appealing"))
      
      ;; Emit event
      (print {
        action: "create-appeal",
        appeal-id: appeal-id,
        content-id: content-id,
        appellant: tx-sender,
        reason: reason,
        evidence: evidence,
        start-block: current-block,
        end-block: end-block
      })
      
      (ok appeal-id)
    )
  )
)

;; Vote on an appeal
(define-public (vote-on-appeal (appeal-id uint) (choice bool))
  (let ((appeal-data (unwrap! (map-get? appeals {appeal-id: appeal-id}) ERR_APPEAL_NOT_FOUND))
        (voter-balance (unwrap-panic (contract-call? .governance-token get-balance tx-sender)))
        (current-block stacks-block-height))
    (begin
      ;; Check if voting period is active
      (asserts! (<= current-block (get end-block appeal-data)) ERR_VOTING_ENDED)
      (asserts! (>= current-block (get start-block appeal-data)) ERR_VOTING_NOT_ENDED)
      
      ;; Check if user hasn't already voted
      (asserts! (is-none (map-get? appeal-votes {appeal-id: appeal-id, voter: tx-sender})) ERR_ALREADY_VOTED)
      
      ;; Check if user has tokens to vote
      (asserts! (> voter-balance u0) ERR_INSUFFICIENT_TOKENS)
      
      ;; Record vote
      (map-set appeal-votes 
        {appeal-id: appeal-id, voter: tx-sender}
        {
          choice: choice,
          voting-power: voter-balance,
          block-height: current-block
        }
      )
      
      ;; Update appeal vote counts
      (let ((updated-appeal 
              (if choice
                (merge appeal-data {votes-for: (+ (get votes-for appeal-data) voter-balance)})
                (merge appeal-data {votes-against: (+ (get votes-against appeal-data) voter-balance)})
              )))
        (map-set appeals {appeal-id: appeal-id} updated-appeal)
      )
      
      ;; Emit event
      (print {
        action: "vote-on-appeal",
        appeal-id: appeal-id,
        voter: tx-sender,
        choice: choice,
        voting-power: voter-balance,
        block-height: current-block
      })
      
      (ok true)
    )
  )
)

;; Resolve an appeal after voting ends
(define-public (resolve-appeal (appeal-id uint))
  (let ((appeal-data (unwrap! (map-get? appeals {appeal-id: appeal-id}) ERR_APPEAL_NOT_FOUND))
        (total-supply (unwrap-panic (contract-call? .governance-token get-total-supply)))
        (current-block stacks-block-height))
    (begin
      ;; Check if voting period has ended
      (asserts! (> current-block (get end-block appeal-data)) ERR_VOTING_NOT_ENDED)
      
      ;; Check if appeal hasn't been resolved
      (asserts! (not (get resolved appeal-data)) ERR_APPEAL_ALREADY_RESOLVED)
      
      ;; Calculate quorum
      (let ((total-votes (+ (get votes-for appeal-data) (get votes-against appeal-data)))
            (required-quorum (/ (* total-supply APPEAL_QUORUM_PERCENTAGE) u10000)))
        
        ;; Check if quorum is reached
        (asserts! (>= total-votes required-quorum) ERR_QUORUM_NOT_REACHED)
        
        ;; Determine result
        (let ((result (if (> (get votes-for appeal-data) (get votes-against appeal-data)) "upheld" "rejected")))
          
          ;; Update appeal as resolved
          (map-set appeals 
            {appeal-id: appeal-id}
            (merge appeal-data {
              resolved: true,
              result: (some result)
            })
          )
          
          ;; Execute the decision
          (if (is-eq result "upheld")
            ;; Restore content if appeal is upheld
            (try! (contract-call? .content-registry update-content-status (get content-id appeal-data) "active"))
            ;; Keep content removed if appeal is rejected
            (try! (contract-call? .content-registry update-content-status (get content-id appeal-data) "removed"))
          )
          
          ;; Emit event
          (print {
            action: "resolve-appeal",
            appeal-id: appeal-id,
            content-id: (get content-id appeal-data),
            result: result,
            votes-for: (get votes-for appeal-data),
            votes-against: (get votes-against appeal-data),
            total-votes: total-votes,
            resolved-by: tx-sender
          })
          
          (ok result)
        )
      )
    )
  )
)

;; Read-only functions

;; Get appeal by ID
(define-read-only (get-appeal (appeal-id uint))
  (map-get? appeals {appeal-id: appeal-id})
)

;; Get appeal vote by appeal and voter
(define-read-only (get-appeal-vote (appeal-id uint) (voter principal))
  (map-get? appeal-votes {appeal-id: appeal-id, voter: voter})
)

;; Get appeal for content
(define-read-only (get-content-appeal (content-id uint))
  (map-get? content-appeals content-id)
)

;; Check if appeal exists
(define-read-only (appeal-exists (appeal-id uint))
  (is-some (map-get? appeals {appeal-id: appeal-id}))
)

;; Check if voting is active for appeal
(define-read-only (is-appeal-voting-active (appeal-id uint))
  (match (map-get? appeals {appeal-id: appeal-id})
    appeal-data (and
      (>= stacks-block-height (get start-block appeal-data))
      (<= stacks-block-height (get end-block appeal-data))
    )
    false
  )
)

;; Check if appeal is resolved
(define-read-only (is-appeal-resolved (appeal-id uint))
  (match (map-get? appeals {appeal-id: appeal-id})
    appeal-data (get resolved appeal-data)
    false
  )
)

;; Get total appeal count
(define-read-only (get-total-appeal-count)
  (var-get appeal-counter)
)

;; Get appeal voting period
(define-read-only (get-appeal-voting-period)
  APPEAL_VOTING_PERIOD
)

;; Get minimum appeal tokens
(define-read-only (get-min-appeal-tokens)
  MIN_APPEAL_TOKENS
)

;; Get appeal quorum percentage
(define-read-only (get-appeal-quorum-percentage)
  APPEAL_QUORUM_PERCENTAGE
)

;; Get contract owner
(define-read-only (get-contract-owner)
  CONTRACT_OWNER
)

;; Check if content has an appeal
(define-read-only (has-content-appeal (content-id uint))
  (is-some (map-get? content-appeals content-id))
)
