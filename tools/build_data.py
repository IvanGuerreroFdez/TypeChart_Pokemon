#!/usr/bin/env python3
"""Builds static JSON data files for the web app from PokeAPI's raw CSV dumps.

Run once (data is static game data, no need to re-run unless updating gens):
    python3 tools/build_data.py
"""
import csv
import json
import os

RAW = os.path.join(os.path.dirname(__file__), "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "data")
ES = "7"  # local_language_id for Spanish

os.makedirs(OUT, exist_ok=True)


def read_csv(name):
    with open(os.path.join(RAW, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------
types_rows = read_csv("types.csv")
types_rows = [t for t in types_rows if int(t["id"]) <= 18 or t["identifier"] in ("fairy",)]
types_rows = [t for t in types_rows if t["identifier"] not in ("shadow", "unknown")]

type_names_es = {}
for r in read_csv("type_names.csv"):
    if r["local_language_id"] == ES:
        type_names_es[r["type_id"]] = r["name"]

types_by_id = {t["id"]: t["identifier"] for t in types_rows}
types_out = [
    {"id": int(t["id"]), "slug": t["identifier"], "name": type_names_es.get(t["id"], t["identifier"].capitalize())}
    for t in types_rows
]
types_out.sort(key=lambda t: t["id"])

with open(os.path.join(OUT, "types.json"), "w", encoding="utf-8") as f:
    json.dump(types_out, f, ensure_ascii=False)

valid_type_ids = {str(t["id"]) for t in types_out}

# ---------------------------------------------------------------------------
# Type efficacy chart -> matrix[attackerId][defenderId] = multiplier (float)
# ---------------------------------------------------------------------------
chart = {str(t["id"]): {str(d["id"]): 1.0 for d in types_out} for t in types_out}
for r in read_csv("type_efficacy.csv"):
    atk, dfn = r["damage_type_id"], r["target_type_id"]
    if atk in chart and dfn in chart[atk]:
        chart[atk][dfn] = int(r["damage_factor"]) / 100.0

with open(os.path.join(OUT, "type_chart.json"), "w", encoding="utf-8") as f:
    json.dump(chart, f, ensure_ascii=False)

# ---------------------------------------------------------------------------
# Species names (Spanish) + flags
# ---------------------------------------------------------------------------
species_names_es = {}
for r in read_csv("pokemon_species_names.csv"):
    if r["local_language_id"] == ES:
        species_names_es[r["pokemon_species_id"]] = r["name"]

species_rows = {r["id"]: r for r in read_csv("pokemon_species.csv")}

# ---------------------------------------------------------------------------
# Pokemon types (pokemon_id -> [type_id,...] ordered by slot)
# ---------------------------------------------------------------------------
poke_types = {}
for r in read_csv("pokemon_types.csv"):
    if r["type_id"] not in valid_type_ids:
        continue
    poke_types.setdefault(r["pokemon_id"], []).append((int(r["slot"]), int(r["type_id"])))
for pid in poke_types:
    poke_types[pid] = [t for _, t in sorted(poke_types[pid])]

# ---------------------------------------------------------------------------
# Canonical (official) Mega Evolution and Gigantamax species, to filter out
# fan-made / unofficial extra "-mega" rows that exist in the raw dataset.
# ---------------------------------------------------------------------------
OFFICIAL_MEGA_SPECIES = {
    "venusaur", "charizard", "blastoise", "beedrill", "pidgeot", "alakazam",
    "slowbro", "gengar", "kangaskhan", "pinsir", "gyarados", "aerodactyl",
    "mewtwo", "ampharos", "scizor", "heracross", "houndoom", "tyranitar",
    "sceptile", "blaziken", "swampert", "gardevoir", "sableye", "mawile",
    "aggron", "medicham", "manectric", "sharpedo", "camerupt", "altaria",
    "banette", "absol", "glalie", "salamence", "metagross", "latias",
    "latios", "lopunny", "garchomp", "lucario", "abomasnow", "gallade",
    "audino", "diancie", "rayquaza", "steelix",
}

# ---------------------------------------------------------------------------
# Build the master Pokemon list (default species forms + official alternate
# forms: regional variants, megas, gigantamax, etc.)
# ---------------------------------------------------------------------------
form_suffix_es = {
    "mega": "Mega", "mega-x": "Mega X", "mega-y": "Mega Y",
    "gmax": "Gigamax",
    "alola": "de Alola", "galar": "de Galar", "hisui": "de Hisui", "paldea": "de Paldea",
    "totem": "Totem", "totem-alola": "Totem de Alola",
    "origin": "Forma Origen", "altered": "Forma Alterada",
    "sky": "Forma Cielo", "land": "Forma Tierra",
    "therian": "Forma Tótem", "incarnate": "Forma Corpórea",
    "attack": "Forma Ataque", "defense": "Forma Defensa", "speed": "Forma Velocidad",
    "plant": "Tronco Planta", "sandy": "Tronco Arena", "trash": "Tronco Basura",
    "heat": "Calor", "wash": "Lavadora", "frost": "Hielo", "fan": "Ventilador", "mow": "Cortacésped",
    "female": "Hembra", "male": "Macho",
    "small": "Pequeña", "large": "Grande", "super": "Súper", "average": "Promedio",
    "pirouette": "Forma Pirueta", "zen": "Forma Zen", "zen-galar": "Forma Zen de Galar",
    "rainy": "Forma Lluvia", "sunny": "Forma Sol", "snowy": "Forma Nieve",
    "ash": "Forma Cenizas",
    "school": "Forma Banco", "solo": "Forma Solitaria",
    "dusk": "Forma Ocaso", "midnight": "Forma Medianoche", "dawn": "Forma Alba",
    "complete": "Forma Completa", "10-percent": "Forma 10%", "50-percent": "Forma 50%",
    "crowned": "Forma Trono", "eternamax": "Eternamax",
    "hangry": "Hambrienta", "noice": "Nohielo", "ice": "Hielo",
    "low-key": "Bajo Perfil", "amped": "Subidón",
    "single-strike": "Estilo Único", "rapid-strike": "Estilo Fluido",
    "hero": "Forma Heroica", "droopy": "Lánguida", "stretchy": "Elástica", "curly": "Rizada",
    "blue-striped": "Rayas Azules", "red-striped": "Rayas Rojas", "white-striped": "Rayas Blancas",
    "f": "Hembra", "m": "Macho", "standard": "Estándar",
    "natural": "Forma Natural", "resolute": "Forma Resoluta",
    "bug": "Forma Bicho", "fairy": "Forma Hada", "poison": "Forma Veneno",
    "fighting": "Forma Lucha", "psychic": "Forma Psíquico", "flying": "Forma Volador",
    "ghost": "Forma Fantasma", "fire": "Forma Fuego", "water": "Forma Agua",
    "electric": "Forma Eléctrico", "grass": "Forma Planta", "ground": "Forma Tierra",
    "rock": "Forma Roca", "dark": "Forma Siniestro", "steel": "Forma Acero",
    "dragon": "Forma Dragón", "normal-galar": "Forma Galar",
    "noctowl": "Noctowl", "starter": "Inicial",
    "urshifu-single-strike-gmax": "Estilo Único, Gigamax",
    "urshifu-rapid-strike-gmax": "Estilo Fluido, Gigamax",
    "toxtricity-amped-gmax": "Subidón, Gigamax",
    "toxtricity-low-key-gmax": "Bajo Perfil, Gigamax",
}


def display_suffix(form_id):
    parts = form_id.split("-")
    label = form_suffix_es.get(form_id)
    if label:
        return label
    # try last token, then join unknown tokens capitalized as fallback
    if len(parts) > 1:
        tail = "-".join(parts[1:])
        label = form_suffix_es.get(tail)
        if label:
            return label
    return " ".join(p.capitalize() for p in parts[1:]) if len(parts) > 1 else None


pokemon_rows = read_csv("pokemon.csv")
pokemon_by_id = {r["id"]: r for r in pokemon_rows}

pokemon_out = []
seen_slugs = set()
for r in pokemon_rows:
    pid, slug, species_id = r["id"], r["identifier"], r["species_id"]
    if pid not in poke_types:
        continue  # no typing data, skip
    is_mega = "-mega" in slug
    is_gmax = slug.endswith("-gmax")
    if is_mega:
        species_slug = species_rows.get(species_id, {}).get("identifier", "")
        if species_slug not in OFFICIAL_MEGA_SPECIES or not (
            slug == species_slug + "-mega"
            or slug == species_slug + "-mega-x"
            or slug == species_slug + "-mega-y"
        ):
            continue  # drop unofficial fan-made mega entries (e.g. "-mega-z")
    base_name = species_names_es.get(species_id, slug.replace("-", " ").title())
    species_slug = species_rows.get(species_id, {}).get("identifier", slug)
    is_default_form = slug == species_slug
    suffix = None if is_default_form else display_suffix(slug.replace(species_slug + "-", species_slug + "-", 1) if slug.startswith(species_slug) else slug)
    if not is_default_form and slug.startswith(species_slug + "-"):
        form_token = slug[len(species_slug) + 1:]
        suffix = display_suffix(species_slug + "-" + form_token) or display_suffix(form_token)
        if suffix is None:
            suffix = " ".join(p.capitalize() for p in form_token.split("-"))
    display_name = base_name if is_default_form else f"{base_name} ({suffix})"
    if slug in seen_slugs:
        continue
    seen_slugs.add(slug)
    pokemon_out.append({
        "id": int(pid),
        "slug": slug,
        "speciesSlug": species_slug,
        "name": display_name,
        "types": poke_types[pid],
        "isMega": is_mega,
        "isGmax": is_gmax,
        "isDefault": is_default_form,
        "sprite": f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{pid if int(pid) < 10000 else species_id}.png",
    })

pokemon_out.sort(key=lambda p: p["id"])

with open(os.path.join(OUT, "pokemon.json"), "w", encoding="utf-8") as f:
    json.dump(pokemon_out, f, ensure_ascii=False)

print(f"Pokemon entries: {len(pokemon_out)}")

# ---------------------------------------------------------------------------
# Moves
# ---------------------------------------------------------------------------
move_names_es = {}
for r in read_csv("move_names.csv"):
    if r["local_language_id"] == ES:
        move_names_es[r["move_id"]] = r["name"]

damage_classes = {r["id"]: r["identifier"] for r in read_csv("move_damage_class.csv")}

moves_out = []
moves_by_id = {}
for r in read_csv("moves.csv"):
    if r["type_id"] not in valid_type_ids:
        continue
    mid = r["id"]
    entry = {
        "id": int(mid),
        "slug": r["identifier"],
        "name": move_names_es.get(mid, r["identifier"].replace("-", " ").title()),
        "type": int(r["type_id"]),
        "class": damage_classes.get(r["damage_class_id"], "status"),
        "power": int(r["power"]) if r["power"] else None,
        "accuracy": int(r["accuracy"]) if r["accuracy"] else None,
        "pp": int(r["pp"]) if r["pp"] else None,
    }
    moves_out.append(entry)
    moves_by_id[mid] = entry

with open(os.path.join(OUT, "moves.json"), "w", encoding="utf-8") as f:
    json.dump(moves_out, f, ensure_ascii=False)

print(f"Move entries: {len(moves_out)}")

# ---------------------------------------------------------------------------
# Movepool: pokemon_id -> sorted unique list of move ids learnable in any
# official version group (level-up, TM, tutor, egg...).
# ---------------------------------------------------------------------------
movepool = {}
with open(os.path.join(RAW, "pokemon_moves.csv"), newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for r in reader:
        pid, mid = r["pokemon_id"], r["move_id"]
        if mid not in moves_by_id:
            continue
        s = movepool.setdefault(pid, set())
        s.add(int(mid))

valid_pokemon_ids = {str(p["id"]) for p in pokemon_out}
movepool_out = {pid: sorted(list(s)) for pid, s in movepool.items() if pid in valid_pokemon_ids}

with open(os.path.join(OUT, "movepool.json"), "w", encoding="utf-8") as f:
    json.dump(movepool_out, f, ensure_ascii=False)

print(f"Movepool entries: {len(movepool_out)}")

# ---------------------------------------------------------------------------
# Bundle everything into a single JS file (window.GAME_DATA) so the app
# works straight from the filesystem (file://) with no server/CORS needed.
# ---------------------------------------------------------------------------
js_path = os.path.join(os.path.dirname(__file__), "..", "js", "data.js")
os.makedirs(os.path.dirname(js_path), exist_ok=True)
with open(js_path, "w", encoding="utf-8") as f:
    f.write("// Auto-generated by tools/build_data.py — do not edit by hand.\n")
    f.write("window.GAME_DATA = ")
    json.dump({
        "types": types_out,
        "typeChart": chart,
        "pokemon": pokemon_out,
        "moves": moves_out,
        "movepool": movepool_out,
    }, f, ensure_ascii=False)
    f.write(";\n")

print("Wrote js/data.js")
print("Done.")
