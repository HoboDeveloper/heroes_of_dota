export const enum Spawn_Type {
    rune ,
    shop,
    creep,
    tree
}

type Rune_Spawn = {
    type: Spawn_Type.rune
    at: XY
}

type Shop_Spawn = {
    type: Spawn_Type.shop
    at: XY
    facing: XY
}

type Creep_Spawn = {
    type: Spawn_Type.creep
    at: XY
    facing: XY
}

type Tree_Spawn = {
    type: Spawn_Type.tree
    at: XY
}

type Battleground_Spawn = Rune_Spawn | Shop_Spawn | Creep_Spawn | Tree_Spawn;

export type Battleground = {
    grid_size: XY
    deployment_zones: Deployment_Zone[]
    spawns: Battleground_Spawn[]
}

export function forest(): Battleground {
    function creep(x: number, y: number, facing: XY): Creep_Spawn {
        return {
            type: Spawn_Type.creep,
            at: xy(x, y),
            facing: facing
        }
    }

    function shop(x: number, y: number, facing: XY): Shop_Spawn {
        return {
            type: Spawn_Type.shop,
            at: xy(x, y),
            facing: facing
        }
    }

    function tree(x: number, y: number): Tree_Spawn {
        return {
            type: Spawn_Type.tree,
            at: xy(x, y)
        }
    }

    function rune(x: number, y: number): Rune_Spawn {
        return {
            type: Spawn_Type.rune,
            at: xy(x, y)
        }
    }
    
    const grid_size = xy(13, 10);
    const deployment_zone_width = 3;

    const up = xy(0, 1);
    const left = xy(-1, 0);

    return {
        grid_size: grid_size,
        deployment_zones: [
            {
                min_x: 0,
                min_y: 3,
                max_x: deployment_zone_width,
                max_y: grid_size.y - 3,
                face_x: 1,
                face_y: 0
            },
            {
                min_x: grid_size.x - deployment_zone_width,
                min_y: 3,
                max_x: grid_size.x,
                max_y: grid_size.y - 3,
                face_x: -1,
                face_y: 0
            }
        ],
        spawns: [
            rune(6, 6),
            shop(6, 1, up),
            creep(6, 3, left),
            tree(1, 1),
            tree(3, 3)
        ]
    }
}