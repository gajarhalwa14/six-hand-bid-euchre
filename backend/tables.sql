-- Create users table
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL UNIQUE,
  hashed_password VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL
);

-- Create games table
CREATE TABLE IF NOT EXISTS games (
  game_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  start_time TIMESTAMP NULL,
  end_time TIMESTAMP NULL,
  winning_team SMALLINT NULL,
  winning_score INT NULL,
  losing_score INT NULL,
  total_hands INT NULL
);

-- Create game_players table
CREATE TABLE IF NOT EXISTS game_players (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  game_id BIGINT NOT NULL,
  user_id UUID NOT NULL,
  seat_index INT NOT NULL,
  team SMALLINT NOT NULL,
  is_winner BOOLEAN NOT NULL,
  CONSTRAINT fk_gp_game FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  CONSTRAINT fk_gp_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT uq_gp_game_seat UNIQUE (game_id, seat_index)
);

-- Create hands   table
CREATE TABLE IF NOT EXISTS hands   (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  game_id BIGINT NOT NULL,
  hand_number INT NOT NULL,
  dealer_seat_index INT NOT NULL,
  trump_suit VARCHAR(32) NOT NULL,
  contract_team_index SMALLINT NOT NULL,
  contract_value INT NOT NULL,
  contract_type VARCHAR(32) NOT NULL,
  winning_team_index SMALLINT NOT NULL,
  tricks_team0 INT NOT NULL,
  tricks_team1 INT NOT NULL,
  points_team0 INT NOT NULL,
  points_team1 INT NOT NULL,
  CONSTRAINT fk_h_game FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
  CONSTRAINT uq_h_game_hand UNIQUE (game_id, hand_number)
);
