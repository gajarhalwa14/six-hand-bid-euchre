from datetime import datetime, timezone
import uuid
from pydantic import field_serializer
from sqlmodel import Field, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(timezone.utc)


class UserBase(SQLModel):
    username: str = Field(min_length=1, max_length=255)
    display_name: str = Field(min_length=1, max_length=64)


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(SQLModel):
    password: str | None = Field(default=None, min_length=8, max_length=128)
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    username: str | None = Field(default=None, min_length=1, max_length=255)


class UserPublic(UserBase):
    user_id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


class GameBase(SQLModel):
    start_time: datetime | None = None
    end_time: datetime | None = None
    winning_team: int | None = None
    winning_score: int | None = None
    losing_score: int | None = None
    total_hands: int | None = None

    @field_serializer("start_time", "end_time")
    def serialize_dates(self, dt: datetime | None) -> str | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.isoformat()


class GameCreate(GameBase):
    pass


class GameUpdate(SQLModel):
    start_time: datetime | None = None
    end_time: datetime | None = None
    winning_team: int | None = None
    winning_score: int | None = None
    losing_score: int | None = None
    total_hands: int | None = None

    @field_serializer("start_time", "end_time")
    def serialize_dates(self, dt: datetime | None) -> str | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.isoformat()


class GamePublic(GameBase):
    game_id: int


class GamesBase(SQLModel):
    data: list[GamePublic]
    count: int


class GamePlayerBase(SQLModel):
    game_id: int
    user_id: uuid.UUID
    seat_index: int
    team: int
    is_winner: bool


class GamePlayerCreate(GamePlayerBase):
    pass


class GamePlayerUpdate(SQLModel):
    game_id: int | None = None
    user_id: uuid.UUID | None = None
    seat_index: int | None = None
    team: int | None = None
    is_winner: bool | None = None


class GamePlayerPublic(GamePlayerBase):
    id: int


class GamePlayersPublic(SQLModel):
    data: list[GamePlayerPublic]
    count: int


class HandBase(SQLModel):
    game_id: int
    hand_number: int
    dealer_seat_index: int
    trump_suit: str = Field(max_length=32)
    contract_team_index: int
    contract_value: int
    contract_type: str = Field(max_length=32)
    winning_team_index: int
    tricks_team0: int
    tricks_team1: int
    points_team0: int
    points_team1: int


class HandCreate(HandBase):
    pass


class HandUpdate(SQLModel):
    game_id: int | None = None
    hand_number: int | None = None
    dealer_seat_index: int | None = None
    trump_suit: str | None = Field(default=None, max_length=32)
    contract_team_index: int | None = None
    contract_value: int | None = None
    contract_type: str | None = Field(default=None, max_length=32)
    winning_team_index: int | None = None
    tricks_team0: int | None = None
    tricks_team1: int | None = None
    points_team0: int | None = None
    points_team1: int | None = None


class HandPublic(HandBase):
    id: int


class HandsPublic(SQLModel):
    data: list[HandPublic]
    count: int
