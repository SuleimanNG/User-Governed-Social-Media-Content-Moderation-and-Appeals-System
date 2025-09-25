# User-Governed Social Media Content Moderation and Appeals System

A decentralized content moderation system built on the Stacks blockchain that empowers users to govern their own social media platform through democratic decision-making.

## Overview

This project implements a user-governed content moderation system where:
- Users can post content
- Community members can flag inappropriate content
- Decisions are made by a decentralized autonomous organization (DAO)
- Content creators can appeal moderation decisions

All processes are transparent, auditable, and governed by smart contracts.

## Core Components

### 1. Content Registry
Registers and stores references to all user-generated content with immutable records.

### 2. Flagging System
Allows community members to report content that violates platform guidelines.

### 3. Moderation DAO
Enables token holders to vote on content moderation decisions.

### 4. Appeals System
Provides a fair mechanism for content creators to challenge moderation decisions.

### 5. Governance Token
Grants voting power to community members participating in moderation governance.

## How It Works

1. User posts content → Stored in Content Registry
2. Community flags content → Added to Flagging System
3. DAO reviews flagged content → Creates moderation proposal
4. Token holders vote → Content is approved or removed
5. Creator can appeal → Community votes on appeal
6. Final decision is executed → Content status is updated

## Technology Stack

- **Smart Contract Language**: Clarity (Stacks blockchain)
- **Development Framework**: Clarinet
- **Testing**: Vitest with Clarinet SDK
- **Dependencies**: 
  - [@hirosystems/clarinet-sdk](https://www.npmjs.com/package/@hirosystems/clarinet-sdk)
  - [@stacks/transactions](https://www.npmjs.com/package/@stacks/transactions)

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Clarinet CLI

### Installation
```bash
npm install
```

### Testing
```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:report

# Watch mode for development
npm run test:watch
```

## Project Structure
```
├── contracts/          # Smart contracts (to be implemented)
├── settings/           # Configuration files
├── tests/              # Unit tests (to be implemented)
├── Clarinet.toml       # Project configuration
└── package.json        # Dependencies and scripts
```

## Future Implementation

This project is structured and ready for implementation of the five core smart contracts:
1. `content-registry.clar`
2. `flagging-system.clar`
3. `moderation-dao.clar`
4. `appeals.clar`
5. `governance-token.clar`

Each contract will handle a specific aspect of the decentralized content moderation workflow.

## License

This project is licensed under the ISC License.