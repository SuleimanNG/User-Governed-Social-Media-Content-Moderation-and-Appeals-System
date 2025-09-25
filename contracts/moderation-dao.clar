;; Moderation DAO Contract
;; Governance layer for voting on flagged content decisions

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant VOTING_PERIOD u144) ;; ~24 hours in blocks (assuming 10 min blocks)
(define-constant MIN_QUORUM_PERCENTAGE u1) ;; 1% of total supply needed for quorum
(define-constant MIN_PROPOSAL_TOKENS u5000000) ;; Minimum tokens to create proposal (5 tokens with 6 decimals)

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u400))
(define-constant ERR_PROPOSAL_NOT_FOUND (err u401))
(define-constant ERR_VOTING_ENDED (err u402))
(define-constant ERR_VOTING_NOT_ENDED (err u403))
(define-constant ERR_ALREADY_VOTED (err u404))
(define-constant ERR_INSUFFICIENT_TOKENS (err u405))
(define-constant ERR_CONTENT_NOT_FLAGGED (err u406))
(define-constant ERR_PROPOSAL_ALREADY_EXECUTED (err u407))
(define-constant ERR_QUORUM_NOT_REACHED (err u408))
(define-constant ERR_INVALID_VOTE_CHOICE (err u409))

;; Proposal types
(define-constant PROPOSAL_TYPE_REMOVE "remove")
(define-constant PROPOSAL_TYPE_KEEP "keep")

;; Data variables
(define-data-var proposal-counter uint u0)

;; Data maps
(define-map proposals 
  {proposal-id: uint} 
  {
    content-id: uint,
    proposer: principal,
    proposal-type: (string-ascii 20),
    description: (string-ascii 500),
    votes-for: uint,
    votes-against: uint,
    start-block: uint,
    end-block: uint,
    executed: bool,
    result: (optional (string-ascii 20))
  }
)

(define-map votes 
  {proposal-id: uint, voter: principal} 
  {
    choice: bool, ;; true = for, false = against
    voting-power: uint,
    block-height: uint
  }
)

(define-map content-proposals uint uint) ;; content-id -> proposal-id

;; Create a moderation proposal
(define-public (create-proposal (content-id uint) (proposal-type (string-ascii 20)) (description (string-ascii 500)))
  (let ((proposal-id (+ (var-get proposal-counter) u1))
        (current-block stacks-block-height)
        (end-block (+ current-block VOTING_PERIOD))
        (proposer-balance (unwrap-panic (contract-call? .governance-token get-balance tx-sender))))
    (begin
      ;; Check if proposer has minimum tokens
      (asserts! (>= proposer-balance MIN_PROPOSAL_TOKENS) ERR_INSUFFICIENT_TOKENS)
      
      ;; Check if content is flagged
      (asserts! (contract-call? .content-registry is-content-flagged content-id) ERR_CONTENT_NOT_FLAGGED)
      
      ;; Validate proposal type
      (asserts! (or 
        (is-eq proposal-type PROPOSAL_TYPE_REMOVE)
        (is-eq proposal-type PROPOSAL_TYPE_KEEP)
      ) ERR_INVALID_VOTE_CHOICE)
      
      ;; Create proposal
      (map-set proposals 
        {proposal-id: proposal-id}
        {
          content-id: content-id,
          proposer: tx-sender,
          proposal-type: proposal-type,
          description: description,
          votes-for: u0,
          votes-against: u0,
          start-block: current-block,
          end-block: end-block,
          executed: false,
          result: none
        }
      )
      
      ;; Update mappings
      (map-set content-proposals content-id proposal-id)
      (var-set proposal-counter proposal-id)
      
      ;; Emit event
      (print {
        action: "create-proposal",
        proposal-id: proposal-id,
        content-id: content-id,
        proposer: tx-sender,
        proposal-type: proposal-type,
        description: description,
        start-block: current-block,
        end-block: end-block
      })
      
      (ok proposal-id)
    )
  )
)

;; Vote on a proposal
(define-public (vote (proposal-id uint) (choice bool))
  (let ((proposal-data (unwrap! (map-get? proposals {proposal-id: proposal-id}) ERR_PROPOSAL_NOT_FOUND))
        (voter-balance (unwrap-panic (contract-call? .governance-token get-balance tx-sender)))
        (current-block stacks-block-height))
    (begin
      ;; Check if voting period is active
      (asserts! (<= current-block (get end-block proposal-data)) ERR_VOTING_ENDED)
      (asserts! (>= current-block (get start-block proposal-data)) ERR_VOTING_NOT_ENDED)
      
      ;; Check if user hasn't already voted
      (asserts! (is-none (map-get? votes {proposal-id: proposal-id, voter: tx-sender})) ERR_ALREADY_VOTED)
      
      ;; Check if user has tokens to vote
      (asserts! (> voter-balance u0) ERR_INSUFFICIENT_TOKENS)
      
      ;; Record vote
      (map-set votes 
        {proposal-id: proposal-id, voter: tx-sender}
        {
          choice: choice,
          voting-power: voter-balance,
          block-height: current-block
        }
      )
      
      ;; Update proposal vote counts
      (let ((updated-proposal 
              (if choice
                (merge proposal-data {votes-for: (+ (get votes-for proposal-data) voter-balance)})
                (merge proposal-data {votes-against: (+ (get votes-against proposal-data) voter-balance)})
              )))
        (map-set proposals {proposal-id: proposal-id} updated-proposal)
      )
      
      ;; Emit event
      (print {
        action: "vote",
        proposal-id: proposal-id,
        voter: tx-sender,
        choice: choice,
        voting-power: voter-balance,
        block-height: current-block
      })
      
      (ok true)
    )
  )
)

;; Execute a proposal after voting ends
(define-public (execute-proposal (proposal-id uint))
  (let ((proposal-data (unwrap! (map-get? proposals {proposal-id: proposal-id}) ERR_PROPOSAL_NOT_FOUND))
        (total-supply (unwrap-panic (contract-call? .governance-token get-total-supply)))
        (current-block stacks-block-height))
    (begin
      ;; Check if voting period has ended
      (asserts! (> current-block (get end-block proposal-data)) ERR_VOTING_NOT_ENDED)
      
      ;; Check if proposal hasn't been executed
      (asserts! (not (get executed proposal-data)) ERR_PROPOSAL_ALREADY_EXECUTED)
      
      ;; Calculate quorum
      (let ((total-votes (+ (get votes-for proposal-data) (get votes-against proposal-data)))
            (required-quorum (/ (* total-supply MIN_QUORUM_PERCENTAGE) u10000)))
        
        ;; Check if quorum is reached
        (asserts! (>= total-votes required-quorum) ERR_QUORUM_NOT_REACHED)
        
        ;; Determine result
        (let ((result (if (> (get votes-for proposal-data) (get votes-against proposal-data)) "approved" "rejected")))
          
          ;; Update proposal as executed
          (map-set proposals 
            {proposal-id: proposal-id}
            (merge proposal-data {
              executed: true,
              result: (some result)
            })
          )
          
          ;; Execute the decision based on proposal type and result
          (if (and (is-eq result "approved") (is-eq (get proposal-type proposal-data) PROPOSAL_TYPE_REMOVE))
            (try! (contract-call? .content-registry update-content-status (get content-id proposal-data) "removed"))
            (if (and (is-eq result "approved") (is-eq (get proposal-type proposal-data) PROPOSAL_TYPE_KEEP))
              (try! (contract-call? .content-registry update-content-status (get content-id proposal-data) "active"))
              true
            )
          )
          
          ;; Emit event
          (print {
            action: "execute-proposal",
            proposal-id: proposal-id,
            content-id: (get content-id proposal-data),
            result: result,
            votes-for: (get votes-for proposal-data),
            votes-against: (get votes-against proposal-data),
            total-votes: total-votes,
            executed-by: tx-sender
          })
          
          (ok result)
        )
      )
    )
  )
)

;; Read-only functions

;; Get proposal by ID
(define-read-only (get-proposal (proposal-id uint))
  (map-get? proposals {proposal-id: proposal-id})
)

;; Get vote by proposal and voter
(define-read-only (get-vote (proposal-id uint) (voter principal))
  (map-get? votes {proposal-id: proposal-id, voter: voter})
)

;; Get proposal for content
(define-read-only (get-content-proposal (content-id uint))
  (map-get? content-proposals content-id)
)

;; Check if proposal exists
(define-read-only (proposal-exists (proposal-id uint))
  (is-some (map-get? proposals {proposal-id: proposal-id}))
)

;; Check if voting is active
(define-read-only (is-voting-active (proposal-id uint))
  (match (map-get? proposals {proposal-id: proposal-id})
    proposal-data (and
      (>= stacks-block-height (get start-block proposal-data))
      (<= stacks-block-height (get end-block proposal-data))
    )
    false
  )
)

;; Check if proposal is executed
(define-read-only (is-proposal-executed (proposal-id uint))
  (match (map-get? proposals {proposal-id: proposal-id})
    proposal-data (get executed proposal-data)
    false
  )
)

;; Get total proposal count
(define-read-only (get-total-proposal-count)
  (var-get proposal-counter)
)

;; Get voting period
(define-read-only (get-voting-period)
  VOTING_PERIOD
)

;; Get minimum quorum percentage
(define-read-only (get-min-quorum-percentage)
  MIN_QUORUM_PERCENTAGE
)

;; Get minimum proposal tokens
(define-read-only (get-min-proposal-tokens)
  MIN_PROPOSAL_TOKENS
)

;; Get contract owner
(define-read-only (get-contract-owner)
  CONTRACT_OWNER
)
