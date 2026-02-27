# Six Hand Multiplayer Bid Euchre

## Overview

- Online Multiplyaer card game with 6 players
- Option to join a random room or create a room with a room code
- Allow rooms to be private or public
- If public, anyone can join
- If private, only players with the room code can join
- If there are not enough players, bots will substitute in to play until more players join
- For private lobbies, the room code is displayed on the screen for the host to share
- Allow players to join a game in progress if there are empty seats
- If a player leaves the game, their seat will be taken by a bot
- If a player rejoins the game and their hasn't been replaced yet, they will take their seat back
- Players are randomly assigned seats at the table for public lobbies
- For private lobbies, players can choose their seats or randomize

## Game Rules
- **Players**: 6 (2 teams of 3).
- **Deck**: Double Euchre (9-A x2).
- **Bidding**:
  - 3, 4, 5, 6, 7, 8: Normal bids (Suit, High, Low).
  - Shoot (9): Bidder discards 2, partners pass 1 each. Score +12/-12.
  - Alone (10): Bidder plays alone with 8 cards. Partners sit out. Score +24/-24.
- **Scoring**:
  - Make bid: Score tricks taken (Normal). Shoot: +12. Alone: +24.
  - Fail bid: Subtract bid amount (Shoot -12, Alone -24).
  - Opponents: Always score tricks taken.
  - Game Value: 32 Points.
- **Ranking**:
  - Suit: Right Bower > Left Bower > A > K > Q > J > 10 > 9.
  - High: A > K > Q > J > 10 > 9.
  - Low: 9 > 10 > J > Q > K > A (Inverted).
  - Duplicate Cards: First played wins.