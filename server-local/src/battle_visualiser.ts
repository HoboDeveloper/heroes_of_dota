type XY = {
    x: number,
    y: number
}

type Battle = {
    players: Battle_Player[],
    deltas: Battle_Delta[];
    delta_paths: Move_Delta_Paths;
    delta_head: number;
    world_origin: Vec;
    units: Battle_Unit[];
    grid_size: {
        width: number,
        height: number
    };
    camera_dummy: CDOTA_BaseNPC;
}

type Battle_Unit = {
    id: number;
    handle: CDOTA_BaseNPC;
    // TODO Actual battle position is not really necessary and is currently
    // TODO used only for turning unit during fast_forward which can be calculated on the client
    // TODO in world coordinates
    position: XY;
    is_playing_a_delta: boolean;
}

declare let battle: Battle;

const battle_cell_size = 128;

function get_battle_cell_size(): number {
    return battle_cell_size;
}

function get_battle_remote_head(): number {
    return table.maxn(battle.deltas);
}

function find_unit_by_id(id: number): Battle_Unit | undefined {
    return array_find(battle.units, unit => unit.id == id);
}

// TODO utilize this for responsiveness
function pre_visualize_action(action: Turn_Action) {
    switch (action.type) {
        // case Action_Type.attack: {
        //     const unit = find_unit_by_id(action.unit_id);
        //
        //     if (unit && !unit.is_playing_a_delta) {
        //         unit.handle.FaceTowards(battle_position_to_world_position_center(action.to));
        //     }
        //
        //     break;
        // }

        case Action_Type.move: {
            const unit = find_unit_by_id(action.unit_id);

            if (unit && !unit.is_playing_a_delta) {
                // const path = find_grid_path(unit.position, action.to);
                //
                // if (!path) {
                //     print("Couldn't find path");
                //     return;
                // }
                //
                // unit.handle.FaceTowards(battle_position_to_world_position_center(path[0]));
            }

            break;
        }
    }
}

function merge_battle_deltas(head_before_merge: number, deltas: Battle_Delta[]) {
    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    print("Merged", deltas.length, "deltas from head", head_before_merge, "new head", get_battle_remote_head());
}

function merge_delta_paths_from_client(delta_paths: Move_Delta_Paths) {
    for (const delta_index_string in delta_paths) {
        const delta_index = tonumber(delta_index_string);

        battle.delta_paths[delta_index] = from_client_array(delta_paths[delta_index_string]);
    }
}

function battle_position_to_world_position_center(position: { x: number, y: number }): Vec {
    return Vector(
        battle.world_origin.x + position.x * battle_cell_size + battle_cell_size / 2,
        battle.world_origin.y + position.y * battle_cell_size + battle_cell_size / 2
    )
}

function unit_type_to_dota_unit_name(unit_type: Unit_Type) {
    switch (unit_type) {
        case Unit_Type.ursa: return "npc_dota_hero_ursa";
        case Unit_Type.pudge: return "npc_dota_hero_pudge";
        case Unit_Type.sniper: return "npc_dota_hero_sniper";

        default: return unreachable(unit_type);
    }
}

function spawn_unit_for_battle(unit_type: Unit_Type, unit_id: number, at: XY): Battle_Unit {
    const world_location = battle_position_to_world_position_center(at);
    const handle = CreateUnitByName(unit_type_to_dota_unit_name(unit_type), world_location, true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS);
    handle.SetControllableByPlayer(0, true);
    handle.SetBaseMoveSpeed(500);
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});

    const unit = {
        handle: handle,
        id: unit_id,
        position: at,
        is_playing_a_delta: false
    };

    battle.units.push(unit);

    return unit;
}

function pudge_hook(main_player: Main_Player, pudge: Battle_Unit, target: XY, effect: Ability_Effect_Pudge_Hook) {
    function is_hook_hit(
        effect: Ability_Effect_Pudge_Hook_Deltas_Hit | Ability_Effect_Pudge_Hook_Deltas_Missed
    ): effect is Ability_Effect_Pudge_Hook_Deltas_Hit {
        return effect.hit as any as number == 1; // Panorama passes booleans this way, meh
    }

    if (!pudge) {
        log_chat_debug_message("Error, Pudge not found");
        return;
    }

    const hook_offset = Vector(0, 0, 96);
    const pudge_origin = pudge.handle.GetAbsOrigin() + hook_offset as Vec;
    const particle_path = "particles/units/heroes/hero_pudge/pudge_meathook.vpcf";
    const travel_direction = Vector(target.x - pudge.position.x, target.y - pudge.position.y).Normalized();
    const travel_speed = 1600;

    let travel_target: XY;

    if (is_hook_hit(effect.result)) {
        const [damage] = from_client_tuple(effect.result.deltas);
        const target = find_unit_by_id(damage.target_unit_id);

        if (!target) {
            log_chat_debug_message("Error, Pudge DAMAGE TARGET not found");
            return;
        }

        travel_target = target.position;
    } else {
        travel_target = effect.result.final_point;
    }

    turn_unit_towards_target(pudge, target);

    pudge.handle.StartGesture(GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_1);

    wait(0.15);

    const distance_to_travel = battle_cell_size * Math.max(Math.abs(travel_target.x - pudge.position.x), Math.abs(travel_target.y - pudge.position.y));
    const time_to_travel = distance_to_travel / travel_speed;

    const chain = ParticleManager.CreateParticle(particle_path, ParticleAttachment_t.PATTACH_CUSTOMORIGIN, pudge.handle);
    ParticleManager.SetParticleControlEnt(chain, 0, pudge.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, "attach_weapon_chain_rt", pudge_origin, true);
    ParticleManager.SetParticleControl(chain, 1, pudge_origin + travel_direction * distance_to_travel as Vec);
    ParticleManager.SetParticleControl(chain, 2, Vector(travel_speed, distance_to_travel, 64));
    ParticleManager.SetParticleControl(chain, 3, Vector(time_to_travel * 2, 0, 0));
    ParticleManager.SetParticleControl(chain, 4, Vector(1, 0, 0));
    ParticleManager.SetParticleControl(chain, 5, Vector(0, 0, 0));
    // TODO incorrect definition
    //@ts-ignore
    ParticleManager.SetParticleControlEnt(chain, 7, pudge.handle, ParticleAttachment_t.PATTACH_CUSTOMORIGIN, undefined, pudge.handle.GetOrigin(), true);

    if (is_hook_hit(effect.result)) {
        const [damage, move] = from_client_tuple(effect.result.deltas);
        const target = find_unit_by_id(damage.target_unit_id);

        if (!target) {
            log_chat_debug_message("Error, Pudge DAMAGE TARGET not found");
            return;
        }

        wait(time_to_travel);

        play_delta(main_player, damage);

        const move_target = find_unit_by_id(move.unit_id);

        if (!move_target) {
            log_chat_debug_message("Error, Pudge MOVE TARGET not found");
            return;
        }

        const impact_path = "particles/units/heroes/hero_pudge/pudge_meathook_impact.vpcf";
        const impact = ParticleManager.CreateParticle(impact_path, ParticleAttachment_t.PATTACH_CUSTOMORIGIN, move_target.handle);
        ParticleManager.SetParticleControlEnt(impact, 0, move_target.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, "attach_hitloc", Vector(), true);
        ParticleManager.ReleaseParticleIndex(impact);

        ParticleManager.SetParticleControlEnt(chain, 1, move_target.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, "attach_hitloc", move_target.handle.GetOrigin() + hook_offset as Vec, true);

        const travel_start_time = GameRules.GetGameTime();
        const target_world_position = battle_position_to_world_position_center(move.to_position);
        const travel_position_start = move_target.handle.GetAbsOrigin();
        const travel_position_finish = GetGroundPosition(Vector(target_world_position.x, target_world_position.y), move_target.handle);

        while (true) {
            const now = GameRules.GetGameTime();
            const progress = Math.min(1, (now - travel_start_time) / time_to_travel);
            const travel_position = (travel_position_finish - travel_position_start) * progress + travel_position_start as Vec;

            move_target.handle.SetAbsOrigin(travel_position);

            if (now >= travel_start_time + time_to_travel) {
                break;
            }

            wait_one_frame();
        }

        move_target.position = move.to_position;
    } else {
        wait(time_to_travel);

        ParticleManager.SetParticleControl(chain, 1, pudge_origin);

        wait(time_to_travel);
    }

    pudge.handle.FadeGesture(GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_1);

    ParticleManager.ReleaseParticleIndex(chain);
}

function play_ground_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, effect: Ability_Effect, target: XY) {
    switch (effect.ability_id) {
        case Ability_Id.basic_attack: {
            if (effect.delta) {
                turn_unit_towards_target(unit, target);

                const time_remaining = unit_play_activity(unit, get_ability_activity(effect.ability_id));

                play_delta(main_player, effect.delta);
                wait(time_remaining * 0.95);
            }

            break;
        }

        case Ability_Id.pudge_hook: {
            pudge_hook(main_player, unit, target, effect);
            break;
        }

        default: {
            // TODO uncomment that when this compiles, so far we don't have enough ability effects
            // log_chat_debug_message(`Error: ground target ability ${effect.ability_id} not found`);
        }
    }
}

function play_unit_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, effect: Ability_Effect, target: Battle_Unit) {
    turn_unit_towards_target(unit, target.position);

    const time_remaining = unit_play_activity(unit, get_ability_activity(effect.ability_id));

    switch (effect.ability_id) {
        default: {
            log_chat_debug_message(`Error: unit target ability ${effect.ability_id} not found`);
        }
    }

    wait(time_remaining * 0.95);
}

function play_no_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, effect: Ability_Effect) {
    const time_remaining = unit_play_activity(unit, get_ability_activity(effect.ability_id));

    switch (effect.ability_id) {
        default: {
            log_chat_debug_message(`Error: no target ability ${effect.ability_id} not found`);
        }
    }

    wait(time_remaining * 0.95);
}

function get_ability_activity(id: Ability_Id): GameActivity_t {
    switch (id) {
        case Ability_Id.basic_attack: return GameActivity_t.ACT_DOTA_ATTACK;
        case Ability_Id.pudge_hook: return GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_1;
        case Ability_Id.pudge_rot: return GameActivity_t.ACT_DOTA_CAST_ABILITY_ROT;
        case Ability_Id.pudge_flesh_heap: return GameActivity_t.ACT_DOTA_IDLE;
        case Ability_Id.pudge_dismember: return GameActivity_t.ACT_DOTA_CAST_ABILITY_4;
        case Ability_Id.sniper_shrapnel: return GameActivity_t.ACT_DOTA_CAST_ABILITY_1;

        default: return unreachable(id);
    }
}

function turn_unit_towards_target(unit: Battle_Unit, towards: XY) {
    const towards_world_position = battle_position_to_world_position_center(towards);
    const desired_forward = ((towards_world_position - unit.handle.GetAbsOrigin()) * Vector(1, 1, 0) as Vec).Normalized();

    {
        // TODO guarded_wait_until
        const guard_hit = guarded_wait_until(3, () => {
            unit.handle.FaceTowards(towards_world_position);

            return desired_forward.Dot(unit.handle.GetForwardVector()) > 0.95;
        });

        if (guard_hit) {
            log_chat_debug_message(`Failed waiting on FaceTowards`);
        }
    }
    /*while (true) {
        unit.handle.FaceTowards(attacked_world_position);

        if (desired_forward.Dot(unit.handle.GetForwardVector()) > 0.95) {
            break;
        }

        wait_one_frame();
    }*/
}

function unit_play_activity(unit: Battle_Unit, activity: GameActivity_t): number {
    unit.handle.StopFacing();
    unit.handle.Stop();
    unit.handle.ForcePlayActivityOnce(activity);

    const sequence = unit.handle.GetSequence();
    const sequence_duration = unit.handle.SequenceDuration(sequence);
    const start_time = GameRules.GetGameTime();

    while (GameRules.GetGameTime() - start_time < sequence_duration * 0.4) {
        if (unit.handle.GetSequence() != sequence) {
            unit.handle.ForcePlayActivityOnce(activity);
        }

        wait_one_frame();
    }

    const time_passed = GameRules.GetGameTime() - start_time;

    return sequence_duration - time_passed;
}

function play_delta(main_player: Main_Player, delta: Battle_Delta, head: number = 0) {
    print(`Well delta type is: ${delta.type}`);

    switch (delta.type) {
        case Battle_Delta_Type.unit_spawn: {
            const unit = spawn_unit_for_battle(delta.unit_type, delta.unit_id, delta.at_position);
            unit.is_playing_a_delta = true;

            wait(1);

            unit.is_playing_a_delta = false;

            break;
        }

        case Battle_Delta_Type.unit_move: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                unit.is_playing_a_delta = true;

                const path = battle.delta_paths[head];

                if (!path) {
                    print("Couldn't find path");
                    break;
                }

                unit.position = delta.to_position;

                for (const cell of path) {
                    const world_position = battle_position_to_world_position_center(cell);

                    unit.handle.MoveToPosition(world_position);

                    // TODO guarded_wait_until
                    const guard_hit = guarded_wait_until(3, () => {
                        return (unit.handle.GetAbsOrigin() - world_position as Vec).Length2D() < battle_cell_size / 4;
                    });

                    if (guard_hit) {
                        log_chat_debug_message(`Failed waiting on MoveToPosition ${world_position.x}/${world_position.y}`);
                    }
                }

                unit.is_playing_a_delta = false;
            }

            break;
        }

        case Battle_Delta_Type.unit_attack: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                attacker.is_playing_a_delta = true;

                play_ground_target_ability_delta(main_player, attacker, delta.effect, delta.attacked_position);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Battle_Delta_Type.unit_ground_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                attacker.is_playing_a_delta = true;

                play_ground_target_ability_delta(main_player, attacker, delta.effect, delta.target_position);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Battle_Delta_Type.unit_unit_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (attacker && target) {
                attacker.is_playing_a_delta = true;

                play_unit_target_ability_delta(main_player, attacker, delta.effect, target);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Battle_Delta_Type.unit_use_no_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                attacker.is_playing_a_delta = true;

                play_no_target_ability_delta(main_player, attacker, delta.effect);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Battle_Delta_Type.unit_force_move: {
            const unit = find_unit_by_id(delta.unit_id);
            const to = battle_position_to_world_position_center(delta.to_position);

            if (unit) {
                FindClearSpaceForUnit(unit.handle, to,  true);

                unit.position = delta.to_position;
            }

            break;
        }

        case Battle_Delta_Type.end_turn: {
            break;
        }

        case Battle_Delta_Type.health_change: {
            const unit = find_unit_by_id(delta.target_unit_id);

            if (unit) {
                const player = PlayerResource.GetPlayer(main_player.player_id);

                SendOverheadEventMessage(player, Overhead_Event_Type.OVERHEAD_ALERT_DAMAGE, unit.handle, delta.damage_dealt, player);

                if (delta.new_health == 0) {
                    unit.handle.ForceKill(false);
                }
            }

            break;
        }

        default: unreachable(delta);
    }
}

function load_battle_data() {
    const origin = Entities.FindByName(undefined, "battle_bottom_left").GetAbsOrigin();

    // TODO incorrect definition
    const camera_entity = CreateModifierThinker(
        // @ts-ignore
        undefined,
        undefined,
        "",
        {},
        Vector(),
        DOTATeam_t.DOTA_TEAM_GOODGUYS,
        false
    ) as CDOTA_BaseNPC;

    battle = {
        deltas: [],
        players: [],
        delta_paths: {},
        delta_head: 0,
        world_origin: origin,
        units: [],
        grid_size: {
            width: 0,
            height: 0
        },
        camera_dummy: camera_entity
    };
}

function fast_forward_from_snapshot(main_player: Main_Player, snapshot: Battle_Snapshot) {
    print("Fast forwarding from snapshot, new head", snapshot.delta_head);

    for (const unit of battle.units) {
        unit.handle.RemoveSelf();
    }

    battle.units = snapshot.units.map(unit => {
        const new_unit = spawn_unit_for_battle(unit.type, unit.id, unit.position);

        new_unit.handle.SetForwardVector(Vector(unit.facing.x, unit.facing.y));

        return new_unit;
    });

    battle.delta_head = snapshot.delta_head;

    update_player_state_net_table(main_player);
}