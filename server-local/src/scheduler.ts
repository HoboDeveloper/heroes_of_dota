declare let scheduler: Scheduler;

if (!scheduler) {
    scheduler = {
        tasks: new Map<Coroutine<any>, Task>()
    };
}

type Scheduler = {
    tasks: Map<Coroutine<any>, Task>;
}

type Task = {
    is_waiting: boolean;
}

type Fork = {
    has_finished: boolean
}

function update_scheduler() {
    scheduler.tasks.forEach((task, routine) => {
        if (task.is_waiting) {
            task.is_waiting = false;

            const [execution_result, possible_error] = coroutine.resume(routine);

            if (execution_result == false) {
                print("Error when executing coroutine");
                print(debug.traceback(routine));
                print("", possible_error);

                log_chat_debug_message(`Error when executing coroutine: ${possible_error}`);
            }
        }

        if (coroutine.status(routine) == Coroutine_Status.dead) {
            scheduler.tasks.delete(routine);
        }
    });
}

function fork(code: () => void): Fork {
    const task: Task = {
        is_waiting: false
    };

    const fork: Fork = {
        has_finished: false
    };

    const routine = coroutine.create(() => {
        code();
        fork.has_finished = true;
    });

    scheduler.tasks.set(routine, task);

    coroutine.resume(routine);

    return fork;
}

function wait_one_frame() {
    const routine = coroutine.running();
    const task = scheduler.tasks.get(routine as Coroutine<any>);

    if (task && routine) {
        task.is_waiting = true;

        coroutine.yield(routine);
    } else {
        throw "Not in a fork";
    }
}

function wait(time: number) {
    if (time == 0) {
        log_message("Can't wait for 0! Defaulting to 1 frame wait");
        wait_one_frame();
        return;
    }

    const start_time = GameRules.GetGameTime();

    wait_until(() => GameRules.GetGameTime() - start_time >= time);
}

function wait_until(condition: () => boolean) {
    while (!condition()) {
        wait_one_frame();
    }
}

function wait_for_all_forks(forks: Fork[]) {
    wait_until(() => forks.every(fork => fork.has_finished));
}

function guarded_wait_until(limit_seconds: number, condition: () => boolean): boolean {
    const start_time = GameRules.GetGameTime();

    while (true) {
        if (GameRules.GetGameTime() - start_time >= limit_seconds) {
            return true;
        }

        if (condition()) {
            return false;
        }

        wait_one_frame();
    }
}

