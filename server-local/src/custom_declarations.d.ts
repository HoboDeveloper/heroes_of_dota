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
    /** @TupleReturn */
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

declare function SendOverheadEventMessage(player: CDOTAPlayer, messageType: Overhead_Event_Type, unit: CDOTA_BaseNPC, value: number, sourcePlayer: CDOTAPlayer): void;

/** @CompileMembersOnly */
declare enum Overhead_Event_Type {
    OVERHEAD_ALERT_LAST_HIT_CLOSE,
    OVERHEAD_ALERT_HEAL,
    OVERHEAD_ALERT_DEATH,
    OVERHEAD_ALERT_DAMAGE,
    OVERHEAD_ALERT_MISS,
    OVERHEAD_ALERT_XP,
    OVERHEAD_ALERT_LAST_HIT_MISS,
    OVERHEAD_ALERT_BONUS_POISON_DAMAGE,
    OVERHEAD_ALERT_INCOMING_DAMAGE,
    OVERHEAD_ALERT_MANA_LOSS,
    OVERHEAD_ALERT_DENY,
    OVERHEAD_ALERT_BLOCK,
    OVERHEAD_ALERT_DISABLE_RESIST,
    OVERHEAD_ALERT_BLOCKED,
}