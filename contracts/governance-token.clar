;; Governance Token Contract
;; SIP-010 compliant fungible token for voting power in the content moderation system

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant TOKEN_NAME "Content Moderation Governance Token")
(define-constant TOKEN_SYMBOL "CMGT")
(define-constant TOKEN_DECIMALS u6)
(define-constant INITIAL_SUPPLY u1000000000000) ;; 1 million tokens with 6 decimals

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_INSUFFICIENT_BALANCE (err u101))
(define-constant ERR_INVALID_AMOUNT (err u102))
(define-constant ERR_TRANSFER_FAILED (err u103))
(define-constant ERR_ALREADY_INITIALIZED (err u104))
(define-constant ERR_NOT_INITIALIZED (err u105))

;; Data variables
(define-data-var token-initialized bool false)
(define-data-var total-supply uint u0)

;; Define the fungible token
(define-fungible-token governance-token INITIAL_SUPPLY)

;; Data maps
(define-map allowances {owner: principal, spender: principal} uint)

;; SIP-010 trait implementation
(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 32) uint))
    (get-decimals () (response uint uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)

;; Initialize the token (can only be called once)
(define-public (initialize)
  (begin
    (asserts! (not (var-get token-initialized)) ERR_ALREADY_INITIALIZED)
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (var-set token-initialized true)
    (var-set total-supply INITIAL_SUPPLY)
    (try! (ft-mint? governance-token INITIAL_SUPPLY CONTRACT_OWNER))
    (print {action: "initialize", total-supply: INITIAL_SUPPLY, owner: CONTRACT_OWNER})
    (ok true)
  )
)

;; SIP-010 Functions

;; Transfer tokens
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (var-get token-initialized) ERR_NOT_INITIALIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (is-eq tx-sender sender) ERR_UNAUTHORIZED)
    (let ((sender-balance (get-balance-of sender)))
      (asserts! (>= sender-balance amount) ERR_INSUFFICIENT_BALANCE)
      (try! (ft-transfer? governance-token amount sender recipient))
      (print {action: "transfer", amount: amount, sender: sender, recipient: recipient, memo: memo})
      (ok true)
    )
  )
)

;; Get token name
(define-read-only (get-name)
  (ok TOKEN_NAME)
)

;; Get token symbol
(define-read-only (get-symbol)
  (ok TOKEN_SYMBOL)
)

;; Get token decimals
(define-read-only (get-decimals)
  (ok TOKEN_DECIMALS)
)

;; Get balance of a principal
(define-read-only (get-balance (account principal))
  (ok (get-balance-of account))
)

;; Get total supply
(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

;; Get token URI (not implemented)
(define-read-only (get-token-uri)
  (ok none)
)

;; Helper Functions

;; Get balance of a principal (internal)
(define-read-only (get-balance-of (account principal))
  (ft-get-balance governance-token account)
)

;; Mint tokens (only owner)
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (var-get token-initialized) ERR_NOT_INITIALIZED)
    (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_UNAUTHORIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (let ((new-total-supply (+ (var-get total-supply) amount)))
      (var-set total-supply new-total-supply)
      (try! (ft-mint? governance-token amount recipient))
      (print {action: "mint", amount: amount, recipient: recipient, new-total-supply: new-total-supply})
      (ok true)
    )
  )
)

;; Burn tokens (only token holder)
(define-public (burn (amount uint))
  (begin
    (asserts! (var-get token-initialized) ERR_NOT_INITIALIZED)
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (let ((sender-balance (get-balance-of tx-sender)))
      (asserts! (>= sender-balance amount) ERR_INSUFFICIENT_BALANCE)
      (let ((new-total-supply (- (var-get total-supply) amount)))
        (var-set total-supply new-total-supply)
        (try! (ft-burn? governance-token amount tx-sender))
        (print {action: "burn", amount: amount, burner: tx-sender, new-total-supply: new-total-supply})
        (ok true)
      )
    )
  )
)

;; Check if token is initialized
(define-read-only (is-initialized)
  (var-get token-initialized)
)

;; Get contract owner
(define-read-only (get-contract-owner)
  CONTRACT_OWNER
)
