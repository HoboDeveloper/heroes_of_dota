declare function GetDedicatedServerKey(version: string): string;

declare namespace json {
    function decode(input: string): object;
    function encode(input: object): string;
}

declare interface Coroutine<T> {}

declare const enum Coroutine_Status {
    suspended = "suspended",
    running = "running",
    dead = "dead"
}

declare namespace coroutine {
    function create<T>(code: () => T): Coroutine<T>;
    function yield<T>(coroutine: Coroutine<T>, result?: T): T;
    /** !TupleReturn */
    function resume<T>(coroutine: Coroutine<T>, result?: T): [T | boolean, string | undefined];
    function running<T>(): Coroutine<T> | undefined;
    function status<T>(coroutine: Coroutine<T>): Coroutine_Status
}

declare namespace debug {
    function traceback(routine?: Coroutine<any>): string;
}

declare namespace string {
    function format(format: string, ...messages: any[]): string;
}