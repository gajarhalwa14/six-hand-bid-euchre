import uuid

from fastapi import APIRouter, HTTPException, Query

from app.crud import hash_password
from app.schema import (
    GameCreate,
    GamePlayerCreate,
    GamePlayerPublic,
    GamePlayersPublic,
    GamePlayerUpdate,
    GamePublic,
    GamesBase,
    GameUpdate,
    HandCreate,
    HandPublic,
    HandsPublic,
    HandUpdate,
    UserCreate,
    UserPublic,
    UserUpdate,
    UsersPublic,
)
from database import SupabaseDep

router = APIRouter()


@router.get("/")
def read_root():
    return {"Hello": "World"}


@router.get("/users", response_model=UsersPublic)
def list_users(supabase: SupabaseDep, limit: int = Query(100, ge=1, le=1000)):
    res = supabase.table("users").select("*", count="exact").limit(limit).execute()
    return {"data": res.data or [], "count": res.count or 0}


@router.get("/users/{user_id}", response_model=UserPublic)
def get_user_by_id(user_id: uuid.UUID, supabase: SupabaseDep):
    res = supabase.table("users").select("*").eq("user_id", str(user_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return res.data[0]


@router.get("/users/by-username/{username}", response_model=UserPublic)
def get_user_by_username(username: str, supabase: SupabaseDep):
    res = supabase.table("users").select("*").eq("username", username).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return res.data[0]


@router.post("/users", response_model=UserPublic)
def create_user(user_in: UserCreate, supabase: SupabaseDep):
    res = supabase.table("users").select("*").eq("username", user_in.username).execute()
    if res.data:
        raise HTTPException(status_code=400, detail="Username is taken")
    user_data = user_in.model_dump(exclude={"password"})
    user_data["hashed_password"] = hash_password(user_in.password)
    result = supabase.table("users").insert(user_data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create user")
    return result.data[0]


@router.patch("/users/{user_id}", response_model=UserPublic)
def update_user(user_id: uuid.UUID, user_in: UserUpdate, supabase: SupabaseDep):
    update_data = user_in.model_dump(exclude_unset=True, exclude_none=True, exclude={"password"})
    if user_in.password is not None:
        update_data["hashed_password"] = hash_password(user_in.password)

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    res = supabase.table("users").update(update_data).eq("user_id", str(user_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return res.data[0]


@router.delete("/users/{user_id}")
def delete_user(user_id: uuid.UUID, supabase: SupabaseDep):
    res = supabase.table("users").delete().eq("user_id", str(user_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="User not found")
    return {"deleted": True, "user_id": user_id}


@router.get("/games", response_model=GamesBase)
def list_games(supabase: SupabaseDep, limit: int = Query(100, ge=1, le=1000)):
    res = supabase.table("games").select("*", count="exact").limit(limit).execute()
    return {"data": res.data or [], "count": res.count or 0}


@router.post("/games", response_model=GamePublic)
def add_game(game_in: GameCreate, supabase: SupabaseDep):
    game_data = game_in.model_dump(mode="json", exclude_none=True)
    res = supabase.table("games").insert(game_data).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to add game")
    return res.data[0]


@router.get("/games/{game_id}", response_model=GamePublic)
def get_game(game_id: int, supabase: SupabaseDep):
    res = supabase.table("games").select("*").eq("game_id", game_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Game not found")
    return res.data[0]

@router.patch("/games/{game_id}", response_model=GamePublic)
def update_game(game_id: int, game_in: GameUpdate, supabase: SupabaseDep):
    update_data = game_in.model_dump(mode="json", exclude_unset=True, exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    res = supabase.table("games").update(update_data).eq("game_id", game_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Game not found")
    return res.data[0]


@router.delete("/games/{game_id}")
def delete_game(game_id: int, supabase: SupabaseDep):
    res = supabase.table("games").delete().eq("game_id", game_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Game not found")
    return {"deleted": True, "game_id": game_id}


@router.get("/game-players", response_model=GamePlayersPublic)
def list_game_players(
    supabase: SupabaseDep,
    game_id: int | None = None,
    user_id: uuid.UUID | None = None,
    limit: int = Query(100, ge=1, le=1000),
):
    query = supabase.table("game_players").select("*", count="exact")
    if game_id is not None:
        query = query.eq("game_id", game_id)
    if user_id is not None:
        query = query.eq("user_id", str(user_id))
    res = query.limit(limit).execute()
    return {"data": res.data or [], "count": res.count or 0}


@router.get("/game-players/{player_id}", response_model=GamePlayerPublic)
def get_game_player(player_id: int, supabase: SupabaseDep):
    res = supabase.table("game_players").select("*").eq("id", player_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Game player not found")
    return res.data[0]


@router.post("/game-players", response_model=GamePlayerPublic)
def create_game_player(game_player_in: GamePlayerCreate, supabase: SupabaseDep):
    payload = game_player_in.model_dump(mode="json", exclude_none=True)
    res = supabase.table("game_players").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create game player")
    return res.data[0]


@router.patch("/game-players/{player_id}", response_model=GamePlayerPublic)
def update_game_player(player_id: int, game_player_in: GamePlayerUpdate, supabase: SupabaseDep):
    update_data = game_player_in.model_dump(mode="json", exclude_unset=True, exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    res = supabase.table("game_players").update(update_data).eq("id", player_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Game player not found")
    return res.data[0]


@router.delete("/game-players/{player_id}")
def delete_game_player(player_id: int, supabase: SupabaseDep):
    res = supabase.table("game_players").delete().eq("id", player_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Game player not found")
    return {"deleted": True, "id": player_id}


@router.get("/hands", response_model=HandsPublic)
def list_hands(
    supabase: SupabaseDep,
    game_id: int | None = None,
    limit: int = Query(100, ge=1, le=1000),
):
    query = supabase.table("hands").select("*", count="exact")
    if game_id is not None:
        query = query.eq("game_id", game_id)
    res = query.order("hand_number").limit(limit).execute()
    return {"data": res.data or [], "count": res.count or 0}


@router.get("/hands/{hand_id}", response_model=HandPublic)
def get_hand(hand_id: int, supabase: SupabaseDep):
    res = supabase.table("hands").select("*").eq("id", hand_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Hand not found")
    return res.data[0]


@router.post("/hands", response_model=HandPublic)
def create_hand(hand_in: HandCreate, supabase: SupabaseDep):
    payload = hand_in.model_dump(mode="json", exclude_none=True)
    res = supabase.table("hands").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create hand")
    return res.data[0]


@router.patch("/hands/{hand_id}", response_model=HandPublic)
def update_hand(hand_id: int, hand_in: HandUpdate, supabase: SupabaseDep):
    update_data = hand_in.model_dump(mode="json", exclude_unset=True, exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    res = supabase.table("hands").update(update_data).eq("id", hand_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Hand not found")
    return res.data[0]


@router.delete("/hands/{hand_id}")
def delete_hand(hand_id: int, supabase: SupabaseDep):
    res = supabase.table("hands").delete().eq("id", hand_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Hand not found")
    return {"deleted": True, "id": hand_id}
