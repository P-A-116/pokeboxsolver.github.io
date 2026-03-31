export interface Field {
  token: string;
  name: string;
  baseTypes: string[];
}

export const FIELDS: Field[] = [
  {token:"forest",     name:"Forest",     baseTypes:["grass","bug","fairy"]},
  {token:"savanna",    name:"Savanna",    baseTypes:["normal","electric"]},
  {token:"desert",     name:"Desert",     baseTypes:["ground","grass","fire"]},
  {token:"beach",      name:"Beach",      baseTypes:["water","ground","flying"]},
  {token:"river",      name:"River",      baseTypes:["water","grass","bug"]},
  {token:"seafloor",   name:"Seafloor",   baseTypes:["water"]},
  {token:"cave",       name:"Cave",       baseTypes:["ground","poison","rock"]},
  {token:"crag",       name:"Crag",       baseTypes:["poison","fire","dark"]},
  {token:"volcano",    name:"Volcano",    baseTypes:["fire","rock"]},
  {token:"tundra",     name:"Tundra",     baseTypes:["ice","water"]},
  {token:"city",       name:"City",       baseTypes:["poison","normal","fighting"]},
  {token:"sky",        name:"Sky",        baseTypes:["flying","dragon"]},
  {token:"space",      name:"Space",      baseTypes:["psychic","dragon"]},
  {token:"graveyard",  name:"Graveyard",  baseTypes:["ghost","dark","poison","grass"]},
  {token:"factory",    name:"Factory",    baseTypes:["electric","steel"]},
  {token:"cliffside",  name:"Cliffside",  baseTypes:["rock","ground","dragon"]},
  {token:"dojo",       name:"Dojo",       baseTypes:["fighting"]},
  {token:"dreamscape", name:"Dreamscape", baseTypes:["fairy","psychic"]},
  {token:"temple",     name:"Temple",     baseTypes:["dragon","flying"]},
];

export const FIELDS_INDEX: Record<string, Field> = Object.fromEntries(
  FIELDS.map(f => [f.token, f])
);
