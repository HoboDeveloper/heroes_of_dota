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

// TODO array.find doesn't work in TSTL
function array_find<T>(array: Array<T>, predicate: (element: T) => boolean): T | undefined {
    for (let element of array) {
        if (predicate(element)) {
            return element;
        }
    }

    return undefined;
}