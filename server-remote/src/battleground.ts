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
    function xy(x: number, y: number): XY {
        return { x: x, y: y };
    }

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
    const down = xy(0, -1);
    const left = xy(-1, 0);

    return {
        grid_size: grid_size,
        deployment_zones: [
            {
                min_x: 0,
                min_y: 5,
                max_x: deployment_zone_width,
                max_y: grid_size.y - 1,
                face_x: 1,
                face_y: 0
            },
            {
                min_x: grid_size.x - deployment_zone_width,
                min_y: 1,
                max_x: grid_size.x,
                max_y: grid_size.y - 5,
                face_x: -1,
                face_y: 0
            }
        ],
        spawns: [
            tree(0, 2),
            tree(2, 2),
            tree(3, 0),
            tree(8, 1),
            tree(1, 2),
            tree(0, 1),
            tree(1, 0),
            tree(0, 0),
            tree(10, 6),
            tree(11, 6),
            tree(12, 7),
            tree(4, 3),
            tree(4, 9),
            tree(4, 8),
            shop(6, 1, up),
            shop(6, 8, down),
            creep(10, 8, left),
            rune(1, 1),
        ]
    }
}