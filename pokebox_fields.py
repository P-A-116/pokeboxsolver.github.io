"""
POKEBOX FIELD INDEX
Ported from fields.js — biome definitions that drive multi-type GA targeting.
Empty strings in baseTypes are intentional placeholders (ignored at runtime).
"""

# Ordered field definitions, preserving the original JS index order
FIELDS = [
    {"token": "forest",      "name": "Forest",      "baseTypes": ["grass", "bug", "fairy"]},
    {"token": "savanna",     "name": "Savanna",      "baseTypes": ["normal", "electric"]},
    {"token": "desert",      "name": "Desert",       "baseTypes": ["ground", "grass", "fire"]},
    {"token": "beach",       "name": "Beach",        "baseTypes": ["water", "ground", "flying"]},
    {"token": "river",       "name": "River",        "baseTypes": ["water", "grass", "bug"]},
    {"token": "seafloor",    "name": "Seafloor",     "baseTypes": ["water"]},
    {"token": "cave",        "name": "Cave",         "baseTypes": ["ground", "poison", "rock"]},
    {"token": "crag",        "name": "Crag",         "baseTypes": ["poison", "fire", "dark"]},
    {"token": "volcano",     "name": "Volcano",      "baseTypes": ["fire", "rock"]},
    {"token": "tundra",      "name": "Tundra",       "baseTypes": ["ice", "water"]},
    {"token": "city",        "name": "City",         "baseTypes": ["poison", "normal", "fighting"]},
    {"token": "sky",         "name": "Sky",          "baseTypes": ["flying", "dragon"]},
    {"token": "space",       "name": "Space",        "baseTypes": ["psychic", "dragon"]},
    {"token": "graveyard",   "name": "Graveyard",    "baseTypes": ["ghost", "dark", "poison", "grass"]},
    {"token": "factory",     "name": "Factory",      "baseTypes": ["electric", "steel"]},
    {"token": "cliffside",   "name": "Cliffside",    "baseTypes": ["rock", "ground", "dragon"]},
    {"token": "dojo",        "name": "Dojo",         "baseTypes": ["fighting"]},
    {"token": "dreamscape",  "name": "Dreamscape",   "baseTypes": ["fairy", "psychic"]},
    {"token": "temple",      "name": "Temple",       "baseTypes": ["dragon", "flying"]},
]

# Lookup map: token → field dict
FIELDS_BY_TOKEN = {f["token"]: f for f in FIELDS}


def get_field(token: str) -> dict | None:
    """Return the field dict for a token, or None if not found."""
    return FIELDS_BY_TOKEN.get(token)


def field_types(token: str) -> list[str]:
    """Return the non-empty baseTypes for a field token."""
    f = FIELDS_BY_TOKEN.get(token)
    return [t for t in f["baseTypes"] if t] if f else []


def fields_for_api() -> list[dict]:
    """Serialise the field list for the /fields endpoint."""
    return [
        {
            "token":     f["token"],
            "name":      f["name"],
            "baseTypes": [t for t in f["baseTypes"] if t],  # strip empty placeholders
        }
        for f in FIELDS
    ]
