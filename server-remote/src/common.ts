export interface XY {
    x: number;
    y: number;
}

export function xy(x: number, y: number): XY {
    return { x: x, y: y };
}

export function xy_equal(a: XY, b: XY) {
    return a.x == b.x && a.y == b.y;
}

export function unreachable(x: never): never {
    throw new Error("Didn't expect to get here");
}