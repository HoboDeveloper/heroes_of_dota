type XY = {
    x: number,
    y: number
}

type Battle = {
    players: Battle_Player[],
    deltas: Delta[];
    delta_paths: Move_Delta_Paths;
    delta_head: number;
    world_origin: Vector;
    units: Battle_Unit[];
    grid_size: {
        width: number,
        height: number
    };
    camera_dummy: CDOTA_BaseNPC;
    modifier_id_to_modifier_data: { [modifier_id: number]: Modifier_Data }
}

type Battle_Unit = Visualizer_Unit_Data & {
    type: Unit_Type;
    handle: CDOTA_BaseNPC_Hero;
    position: XY;
    is_playing_a_delta: boolean;
}

declare const enum Shake {
    weak = 0,
    medium = 1,
    strong = 2
}

type Ranged_Attack_Spec = {
    particle_path: string;
    projectile_speed: number;
    attack_point: number;
    shake_on_attack?: Shake;
    shake_on_impact?: Shake;
}

type Modifier_Data = {
    unit_id: number
    modifier_name: string
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

function manhattan(from: XY, to: XY) {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
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

function merge_battle_deltas(head_before_merge: number, deltas: Delta[]) {
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

function battle_position_to_world_position_center(position: { x: number, y: number }): Vector {
    return Vector(
        battle.world_origin.x + position.x * battle_cell_size + battle_cell_size / 2,
        battle.world_origin.y + position.y * battle_cell_size + battle_cell_size / 2
    )
}

function shake_screen(at: XY, strength: Shake) {
    const at_world = battle_position_to_world_position_center(at);

    switch (strength) {
        case Shake.weak: {
            ScreenShake(at_world, 5, 50, 0.15, 2000, 0, true);
            break;
        }

        case Shake.medium: {
            ScreenShake(at_world, 5, 100, 0.35, 3000, 0, true);
            break;
        }
        
        case Shake.strong: {
            ScreenShake(at_world, 5, 150, 0.75, 4000, 0, true);
            break;
        }

        default: unreachable(strength);
    }
}

function unit_type_to_dota_unit_name(unit_type: Unit_Type) {
    switch (unit_type) {
        case Unit_Type.ursa: return "npc_dota_hero_ursa";
        case Unit_Type.pudge: return "npc_dota_hero_pudge";
        case Unit_Type.sniper: return "npc_dota_hero_sniper";
        case Unit_Type.tidehunter: return "npc_dota_hero_tidehunter";
        case Unit_Type.luna: return "npc_dota_hero_luna";

        default: return unreachable(unit_type);
    }
}

function spawn_unit_for_battle(unit_type: Unit_Type, unit_id: number, at: XY, facing: XY): Battle_Unit {
    const definition = unit_definition_by_type(unit_type);
    const world_location = battle_position_to_world_position_center(at);
    const handle = CreateUnitByName(unit_type_to_dota_unit_name(unit_type), world_location, true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS) as CDOTA_BaseNPC_Hero;
    handle.SetControllableByPlayer(0, true);
    handle.SetBaseMoveSpeed(500);
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});
    handle.SetForwardVector(Vector(facing.x, facing.y));

    const unit: Battle_Unit = {
        handle: handle,
        id: unit_id,
        type: unit_type,
        position: at,
        is_playing_a_delta: false,
        level: 1,
        health: definition.health,
        mana: definition.mana,
        stunned_counter: 0
    };

    battle.units.push(unit);

    return unit;
}

function tracking_projectile_to_unit(source: Battle_Unit, target: Battle_Unit, particle_path: string, speed: number, out_attach: string = "attach_attack1") {
    const fx = ParticleManager.CreateParticle(particle_path, ParticleAttachment_t.PATTACH_CUSTOMORIGIN, source.handle);
    const in_attach = "attach_hitloc";

    ParticleManager.SetParticleControlEnt(fx, 0, source.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, out_attach, Vector(), true);
    ParticleManager.SetParticleControlEnt(fx, 1, target.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, in_attach, Vector(), true);
    ParticleManager.SetParticleControl(fx, 2, Vector(speed, 0, 0));
    ParticleManager.SetParticleControlEnt(fx, 3, target.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, in_attach, Vector(), true);

    const world_distance = (attachment_world_origin(source.handle, out_attach) - attachment_world_origin(target.handle, in_attach) as Vector).Length();

    wait(world_distance / speed);

    ParticleManager.DestroyParticle(fx, false);
    ParticleManager.ReleaseParticleIndex(fx);
}

function tracking_projectile_to_point(source: Battle_Unit, target: XY, particle_path: string, speed: number) {
    const fx = ParticleManager.CreateParticle(particle_path, ParticleAttachment_t.PATTACH_CUSTOMORIGIN, source.handle);
    const out_attach = "attach_attack1";
    const world_location = battle_position_to_world_position_center(target) + Vector(0, 0, 128) as Vector;

    ParticleManager.SetParticleControlEnt(fx, 0, source.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, out_attach, Vector(), true);
    ParticleManager.SetParticleControl(fx, 1, world_location);
    ParticleManager.SetParticleControl(fx, 2, Vector(speed, 0, 0));
    ParticleManager.SetParticleControl(fx, 3, world_location);

    const world_distance = (attachment_world_origin(source.handle, out_attach) - world_location as Vector).Length();

    wait(world_distance / speed);

    ParticleManager.DestroyParticle(fx, false);
    ParticleManager.ReleaseParticleIndex(fx);
}

function pudge_hook(main_player: Main_Player, pudge: Battle_Unit, cast: Delta_Ability_Pudge_Hook) {
    function is_hook_hit(
        cast: Delta_Ability_Pudge_Hook_Deltas_Hit | Delta_Ability_Line_Ability_Miss
    ): cast is Delta_Ability_Pudge_Hook_Deltas_Hit {
        return cast.hit as any as number == 1; // Panorama passes booleans this way, meh
    }

    const target = cast.target_position;
    const hook_offset = Vector(0, 0, 96);
    const pudge_origin = pudge.handle.GetAbsOrigin() + hook_offset as Vector;
    const particle_path = "particles/units/heroes/hero_pudge/pudge_meathook.vpcf";
    const travel_direction = Vector(target.x - pudge.position.x, target.y - pudge.position.y).Normalized();
    const travel_speed = 1600;

    let travel_target: XY;

    if (is_hook_hit(cast.result)) {
        const [damage] = from_client_tuple(cast.result.deltas);
        const target = find_unit_by_id(damage.target_unit_id);

        if (!target) {
            log_chat_debug_message("Error, Pudge DAMAGE TARGET not found");
            return;
        }

        travel_target = target.position;
    } else {
        travel_target = cast.result.final_point;
    }

    turn_unit_towards_target(pudge, target);

    const chain_sound = "Hero_Pudge.AttackHookExtend";
    const hook_wearable = pudge.handle.GetTogglableWearable(DOTASlotType_t.DOTA_LOADOUT_TYPE_WEAPON);

    pudge.handle.StartGesture(GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_1);
    pudge.handle.EmitSound(chain_sound);

    hook_wearable.AddEffects(Effects.EF_NODRAW);

    wait(0.15);

    const distance_to_travel = battle_cell_size * Math.max(Math.abs(travel_target.x - pudge.position.x), Math.abs(travel_target.y - pudge.position.y));
    const time_to_travel = distance_to_travel / travel_speed;

    const chain = ParticleManager.CreateParticle(particle_path, ParticleAttachment_t.PATTACH_CUSTOMORIGIN, pudge.handle);
    ParticleManager.SetParticleControlEnt(chain, 0, pudge.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, "attach_weapon_chain_rt", pudge_origin, true);
    ParticleManager.SetParticleControl(chain, 1, pudge_origin + travel_direction * distance_to_travel as Vector);
    ParticleManager.SetParticleControl(chain, 2, Vector(travel_speed, distance_to_travel, 64));
    ParticleManager.SetParticleControl(chain, 3, Vector(time_to_travel * 2, 0, 0));
    ParticleManager.SetParticleControl(chain, 4, Vector(1, 0, 0));
    ParticleManager.SetParticleControl(chain, 5, Vector(0, 0, 0));
    ParticleManager.SetParticleControlEnt(chain, 7, pudge.handle, ParticleAttachment_t.PATTACH_CUSTOMORIGIN, undefined, pudge.handle.GetOrigin(), true);

    if (is_hook_hit(cast.result)) {
        const [damage, move] = from_client_tuple(cast.result.deltas);
        const target = find_unit_by_id(damage.target_unit_id);

        if (!target) {
            log_chat_debug_message("Error, Pudge DAMAGE TARGET not found");
            return;
        }

        wait(time_to_travel);
        play_delta(main_player, damage);

        pudge.handle.StopSound(chain_sound);

        unit_emit_sound(target, "Hero_Pudge.AttackHookImpact");
        unit_emit_sound(target, chain_sound);

        target.handle.StartGesture(GameActivity_t.ACT_DOTA_FLAIL);

        const move_target = find_unit_by_id(move.unit_id);

        if (!move_target) {
            log_chat_debug_message("Error, Pudge MOVE TARGET not found");
            return;
        }

        const impact_path = "particles/units/heroes/hero_pudge/pudge_meathook_impact.vpcf";
        const impact = ParticleManager.CreateParticle(impact_path, ParticleAttachment_t.PATTACH_CUSTOMORIGIN, move_target.handle);
        ParticleManager.SetParticleControlEnt(impact, 0, move_target.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, "attach_hitloc", Vector(), true);
        ParticleManager.ReleaseParticleIndex(impact);

        ParticleManager.SetParticleControlEnt(chain, 1, move_target.handle, ParticleAttachment_t.PATTACH_POINT_FOLLOW, "attach_hitloc", move_target.handle.GetOrigin() + hook_offset as Vector, true);

        const travel_start_time = GameRules.GetGameTime();
        const target_world_position = battle_position_to_world_position_center(move.to_position);
        const travel_position_start = move_target.handle.GetAbsOrigin();
        const travel_position_finish = GetGroundPosition(Vector(target_world_position.x, target_world_position.y), move_target.handle);

        while (true) {
            const now = GameRules.GetGameTime();
            const progress = Math.min(1, (now - travel_start_time) / time_to_travel);
            const travel_position = (travel_position_finish - travel_position_start) * progress + travel_position_start as Vector;

            move_target.handle.SetAbsOrigin(travel_position);

            if (now >= travel_start_time + time_to_travel) {
                break;
            }

            wait_one_frame();
        }

        target.handle.StopSound(chain_sound);
        target.handle.FadeGesture(GameActivity_t.ACT_DOTA_FLAIL);

        move_target.position = move.to_position;
    } else {
        wait(time_to_travel);

        ParticleManager.SetParticleControl(chain, 1, pudge_origin);

        pudge.handle.StopSound(chain_sound);
        EmitSoundOnLocationWithCaster(battle_position_to_world_position_center(travel_target), "Hero_Pudge.AttackHookRetractStop", pudge.handle);

        wait(time_to_travel);
    }

    hook_wearable.RemoveEffects(Effects.EF_NODRAW);
    pudge.handle.FadeGesture(GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_1);
    ParticleManager.ReleaseParticleIndex(chain);
}

function tide_ravage(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Ability_Tide_Ravage) {
    unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

    wait(0.1);

    unit_emit_sound(unit, "Ability.Ravage");
    shake_screen(unit.position, Shake.strong);

    const path = "particles/tide_ravage/tide_ravage.vpcf";
    const fx = ParticleManager.CreateParticle(path, ParticleAttachment_t.PATTACH_ABSORIGIN, unit.handle);
    const particle_delay = 0.1;
    const deltas_by_distance: Delta_Modifier_Applied<Ability_Effect_Tide_Ravage>[][] = [];
    const deltas = from_client_array(cast.deltas);

    for (let distance = 1; distance <= 5; distance++) {
        ParticleManager.SetParticleControl(fx, distance, Vector(distance * battle_cell_size * 0.85, 0, 0));
    }

    for (const delta of deltas) {
        const target = find_unit_by_id(delta.target_unit_id);

        if (!target) {
            log_chat_debug_message(`Target with id ${delta.target_unit_id} not found`);
            continue;
        }

        const from = target.position;
        const to = unit.position;
        const manhattan_distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

        let by_distance = deltas_by_distance[manhattan_distance];

        if (!by_distance) {
            by_distance = [];
            deltas_by_distance[manhattan_distance] = by_distance;
        }

        by_distance.push(delta);
    }

    function toss_target_up(target: Battle_Unit) {
        const toss_start_time = GameRules.GetGameTime();
        const toss_time = 0.4;
        const start_origin = target.handle.GetAbsOrigin();

        target.handle.StartGesture(GameActivity_t.ACT_DOTA_FLAIL);

        while (true) {
            const now = GameRules.GetGameTime();
            const progress = Math.min(1, (now - toss_start_time) / toss_time);
            const current_height = Math.sin(progress * Math.PI) * 260;

            target.handle.SetAbsOrigin(start_origin + Vector(0, 0, current_height) as Vector);

            if (now >= toss_start_time + toss_time) {
                break;
            }

            wait_one_frame();
        }

        target.handle.FadeGesture(GameActivity_t.ACT_DOTA_FLAIL);
    }

    let delta_id_counter = 0;

    const delta_completion_status: boolean[] = [];

    for (let distance = 1; distance <= 5; distance++) {
        const by_distance = deltas_by_distance[distance];

        if (!by_distance) continue;

        for (const delta of by_distance) {
            const effect = delta.effect;

            const [damage, stun] = from_client_tuple(effect.deltas);
            const target = find_unit_by_id(damage.target_unit_id);

            if (!target) {
                log_chat_debug_message(`Unit with id ${damage.target_unit_id} not found`);
                return;
            }

            const delta_id = delta_id_counter++;

            delta_completion_status[delta_id] = false;

            fork(() => {
                const path = "particles/units/heroes/hero_tidehunter/tidehunter_spell_ravage_hit.vpcf";
                const fx = ParticleManager.CreateParticle(path, ParticleAttachment_t.PATTACH_ABSORIGIN, target.handle);
                ParticleManager.ReleaseParticleIndex(fx);

                unit_emit_sound(target, "Hero_Tidehunter.RavageDamage");
                toss_target_up(target);

                delta_completion_status[delta_id] = true;
            });

            play_delta(main_player, damage);
            play_delta(main_player, stun);
        }

        wait(particle_delay);
    }

    unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

    ParticleManager.ReleaseParticleIndex(fx);

    wait_until(() => delta_completion_status.every(value => value));
}

function get_ranged_attack_spec(type: Unit_Type): Ranged_Attack_Spec | undefined {
    switch (type) {
        case Unit_Type.sniper: return {
            particle_path: "particles/units/heroes/hero_sniper/sniper_base_attack.vpcf",
            projectile_speed: 1600,
            attack_point: 0.1,
            shake_on_attack: Shake.weak
        };

        case Unit_Type.luna: return {
            particle_path: "particles/units/heroes/hero_luna/luna_moon_glaive.vpcf",
            projectile_speed: 900,
            attack_point: 0.4
        };
    }
}

function perform_basic_attack(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Ability_Basic_Attack) {
    const target = cast.target_position;

    function get_unit_pre_attack_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.pudge: return "Hero_Pudge.PreAttack";
            case Unit_Type.ursa: return "Hero_Ursa.PreAttack";
            case Unit_Type.tidehunter: return "hero_tidehunter.PreAttack";
        }
    }

    function get_unit_attack_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.pudge: return "Hero_Pudge.Attack";
            case Unit_Type.ursa: return "Hero_Ursa.Attack";
            case Unit_Type.sniper: return "Hero_Sniper.attack";
            case Unit_Type.luna: return "Hero_Luna.Attack";
            case Unit_Type.tidehunter: return "hero_tidehunter.Attack";
        }
    }

    function get_unit_ranged_impact_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.sniper: return "Hero_Sniper.ProjectileImpact";
            case Unit_Type.luna: return "Hero_Luna.ProjectileImpact";
        }
    }

    function get_unit_attack_vo(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.sniper: return "vo_sniper_attack";
            case Unit_Type.luna: return "vo_luna_attack";
            case Unit_Type.pudge: return "vo_pudge_attack";
            case Unit_Type.tidehunter: return "vo_tide_attack";
        }
    }

    function try_play_sound_for_unit(unit: Battle_Unit, supplier: (type: Unit_Type) => string | undefined, target: Battle_Unit = unit) {
        const sound = supplier(unit.type);

        if (sound) {
            unit_emit_sound(target, sound);
        }
    }

    const ranged_attack_spec = get_ranged_attack_spec(unit.type);

    function is_attack_hit(
        cast: Delta_Ability_Basic_Attack_Deltas_Hit | Delta_Ability_Line_Ability_Miss
    ): cast is Delta_Ability_Basic_Attack_Deltas_Hit {
        return cast.hit as any as number == 1; // Panorama passes booleans this way, meh
    }

    if (ranged_attack_spec) {
        try_play_sound_for_unit(unit, get_unit_attack_vo);
        turn_unit_towards_target(unit, target);
        wait(0.2);
        try_play_sound_for_unit(unit, get_unit_pre_attack_sound);
        unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK, ranged_attack_spec.attack_point);
        try_play_sound_for_unit(unit, get_unit_attack_sound);

        if (ranged_attack_spec.shake_on_attack) {
            shake_screen(unit.position, ranged_attack_spec.shake_on_attack);
        }

        if (is_attack_hit(cast.result)) {
            const delta = cast.result.delta;
            const target_unit = find_unit_by_id(delta.target_unit_id);

            if (!target_unit) {
                log_chat_debug_message(`Error: unit ${delta.target_unit_id} not found`);
                return;
            }

            tracking_projectile_to_unit(unit, target_unit, ranged_attack_spec.particle_path, ranged_attack_spec.projectile_speed);
            play_delta(main_player, delta);
            try_play_sound_for_unit(unit, get_unit_ranged_impact_sound, target_unit);

            if (ranged_attack_spec.shake_on_impact) {
                shake_screen(target_unit.position, ranged_attack_spec.shake_on_impact);
            }
        } else {
            tracking_projectile_to_point(unit, cast.result.final_point, ranged_attack_spec.particle_path, ranged_attack_spec.projectile_speed);
        }
    } else {
        try_play_sound_for_unit(unit, get_unit_attack_vo);
        turn_unit_towards_target(unit, target);
        wait(0.2);
        try_play_sound_for_unit(unit, get_unit_pre_attack_sound);
        unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK);

        if (is_attack_hit(cast.result)) {
            play_delta(main_player, cast.result.delta);
            shake_screen(target, Shake.weak);
            try_play_sound_for_unit(unit, get_unit_attack_sound);
        }
    }
}

function attachment_world_origin(unit: CDOTA_BaseNPC, attachment_name: string) {
    return unit.GetAttachmentOrigin(unit.ScriptLookupAttachment(attachment_name));
}

function play_ground_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Ground_Target_Ability) {
    switch (cast.ability_id) {
        case Ability_Id.basic_attack: {
            perform_basic_attack(main_player, unit, cast);
            break;
        }

        case Ability_Id.pudge_hook: {
            pudge_hook(main_player, unit, cast);
            break;
        }

        default: unreachable(cast);
    }
}

function apply_and_record_modifier(target: Battle_Unit, modifier_id: number, modifier_name: string) {
    print("Apply and record", modifier_id, modifier_name, "to", target.handle.GetName());
    target.handle.AddNewModifier(target.handle, undefined, modifier_name, {});
    battle.modifier_id_to_modifier_data[modifier_id] = {
        unit_id: target.id,
        modifier_name: modifier_name
    };
}

function unit_emit_sound(unit: Battle_Unit, sound: string) {
    unit.handle.EmitSound(sound);
}

function play_unit_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Unit_Target_Ability, target: Battle_Unit) {
    turn_unit_towards_target(unit, target.position);

    switch (cast.ability_id) {
        case Ability_Id.pudge_dismember: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CHANNEL_ABILITY_4);

            play_delta(main_player, cast.damage_delta);
            play_delta(main_player, cast.heal_delta);

            break;
        }

        case Ability_Id.tide_gush: {
            const fx = "particles/units/heroes/hero_tidehunter/tidehunter_gush.vpcf";

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.2);
            unit_emit_sound(unit, "Ability.GushCast");
            tracking_projectile_to_unit(unit, target, fx, 3000, "attach_attack2");
            unit_emit_sound(unit, "Ability.GushImpact");
            shake_screen(target.position, Shake.medium);

            const modifier_delta = cast.delta;
            const [damage] = from_client_tuple(modifier_delta.effect.deltas);

            apply_and_record_modifier(target, modifier_delta.modifier_id, "Modifier_Tide_Gush");

            play_delta(main_player, damage);

            break;
        }

        case Ability_Id.luna_lucent_beam: {
            const fx = "particles/units/heroes/hero_luna/luna_lucent_beam.vpcf";

            unit_emit_sound(unit, "Hero_Luna.LucentBeam.Cast");
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.6);

            const particle = ParticleManager.CreateParticle(fx, ParticleAttachment_t.PATTACH_ABSORIGIN, unit.handle);

            for (const control_point of [0, 1, 5]) {
                ParticleManager.SetParticleControl(particle, control_point, target.handle.GetAbsOrigin());
            }

            ParticleManager.SetParticleControl(particle, 6, unit.handle.GetAbsOrigin());
            ParticleManager.ReleaseParticleIndex(particle);

            shake_screen(target.position, Shake.medium);
            unit_emit_sound(unit, "Hero_Luna.LucentBeam.Target");
            play_delta(main_player, cast.delta);

            break;
        }

        default: unreachable(cast);
    }
}

function play_no_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Use_No_Target_Ability) {
    switch (cast.ability_id) {
        case Ability_Id.pudge_rot: {
            const particle_path = "particles/units/heroes/hero_pudge/pudge_rot.vpcf";
            const fx = ParticleManager.CreateParticle(particle_path, ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW, unit.handle);
            const snd = "pudge_ability_rot";

            ParticleManager.SetParticleControl(fx, 1, Vector(300, 1, 1));

            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_ROT);
            unit.handle.EmitSound(snd);

            wait(0.2);

            for (const delta of from_client_array(cast.deltas)) {
                play_delta(main_player, delta);
            }

            wait(1.0);

            unit.handle.StopSound(snd);
            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_ROT);

            ParticleManager.DestroyParticle(fx, false);
            ParticleManager.ReleaseParticleIndex(fx);

            break;
        }

        case Ability_Id.tide_anchor_smash: {
            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_3);

            wait(0.2);

            const path = "particles/units/heroes/hero_tidehunter/tidehunter_anchor_hero.vpcf";
            const fx = ParticleManager.CreateParticle(path, ParticleAttachment_t.PATTACH_ABSORIGIN, unit.handle);
            ParticleManager.ReleaseParticleIndex(fx);

            unit_emit_sound(unit, "Hero_Tidehunter.AnchorSmash");
            shake_screen(unit.position, Shake.weak);

            wait(0.2);

            for (const delta of from_client_array(cast.deltas)) {
                const [damage] = from_client_tuple(delta.effect.deltas);

                play_delta(main_player, damage);
            }

            wait(1);

            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_3);

            break;
        }

        case Ability_Id.tide_ravage: {
            tide_ravage(main_player, unit, cast);

            break;
        }

        case Ability_Id.luna_eclipse: {
            const fx = "particles/units/heroes/hero_luna/luna_eclipse.vpcf";
            const target_fx = "particles/units/heroes/hero_luna/luna_eclipse_impact.vpcf";
            const no_target_fx = "particles/units/heroes/hero_luna/luna_eclipse_impact_notarget.vpcf";
            const day_time = GameRules.GetTimeOfDay();

            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            unit_emit_sound(unit, "vo_luna_eclipse");
            wait(0.6);
            unit_emit_sound(unit, "Hero_Luna.Eclipse.Cast");

            GameRules.SetTimeOfDay(0);

            const eclipse_particle = ParticleManager.CreateParticle(fx, ParticleAttachment_t.PATTACH_ABSORIGIN, unit.handle);
            ParticleManager.SetParticleControl(eclipse_particle, 1, Vector(500, 0, 0));
            ParticleManager.SetParticleControl(eclipse_particle, 2, unit.handle.GetAbsOrigin());
            ParticleManager.SetParticleControl(eclipse_particle, 3, unit.handle.GetAbsOrigin());

            const deltas = from_client_array(cast.deltas);
            const beam_targets = deltas.map(delta => ({
                delta: delta,
                beams_remaining: -delta.value_delta
            }));

            while (beam_targets.length > 0) {
                const random_index = RandomInt(0, beam_targets.length - 1);
                const random_target = beam_targets[random_index];
                const target_unit = find_unit_by_id(random_target.delta.target_unit_id);

                random_target.beams_remaining--;

                if (target_unit) {
                    const particle = ParticleManager.CreateParticle(target_fx, ParticleAttachment_t.PATTACH_ABSORIGIN, target_unit.handle);

                    for (const control_point of [ 0, 1, 5 ]) {
                        ParticleManager.SetParticleControl(particle, control_point, target_unit.handle.GetAbsOrigin());
                    }

                    ParticleManager.ReleaseParticleIndex(particle);

                    unit_emit_sound(target_unit, "Hero_Luna.Eclipse.Target");
                    change_health(main_player, target_unit, target_unit.health - 1, -1);
                    shake_screen(target_unit.position, Shake.weak);
                }

                if (random_target.beams_remaining == 0) {
                    beam_targets.splice(random_index, 1);
                }

                wait(0.3);
            }

            if (cast.missed_beams > 0) {
                const distance = 4;

                const cells: XY[] = [];

                const unit_x = unit.position.x;
                const unit_y = unit.position.y;

                const min_x = Math.max(0, unit_x - distance);
                const min_y = Math.max(0, unit_y - distance);

                const max_x = Math.min(battle.grid_size.width, unit_x + distance);
                const max_y = Math.min(battle.grid_size.height, unit_y + distance);

                for (let x = min_x; x < max_x; x++) {
                    for (let y = min_y; y < max_y; y++) {
                        const xy = { x: x, y: y };

                        if ((x != unit_x || y != unit_y) && manhattan(xy, { x: unit_x, y: unit_y }) < distance) {
                            cells.push(xy);
                        }
                    }
                }

                for (let beams_remaining = cast.missed_beams; beams_remaining > 0; beams_remaining--) {
                    const position = battle_position_to_world_position_center(cells[RandomInt(0, cells.length - 1)]);
                    const particle = ParticleManager.CreateParticle(no_target_fx, ParticleAttachment_t.PATTACH_ABSORIGIN, unit.handle);

                    for (const control_point of [0, 1, 5]) {
                        ParticleManager.SetParticleControl(particle, control_point, position);
                    }

                    ParticleManager.ReleaseParticleIndex(particle);

                    EmitSoundOnLocationWithCaster(position, "Hero_Luna.Eclipse.NoTarget", unit.handle);

                    wait(0.3);
                }
            }

            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            ParticleManager.DestroyParticle(eclipse_particle, false);
            ParticleManager.ReleaseParticleIndex(eclipse_particle);

            GameRules.SetTimeOfDay(day_time);

            break;
        }

        default: unreachable(cast);
    }
}

function play_modifier_applied_delta(main_player: Main_Player, source: Battle_Unit, target: Battle_Unit, effect: Ability_Effect) {
    switch (effect.ability_id) {
        default: {
            log_chat_debug_message(`Error no modifier effect for ability ${effect.ability_id} found`);
        }
    }
}

function play_ability_effect_delta(main_player: Main_Player, effect: Ability_Effect) {
    switch (effect.ability_id) {
        case Ability_Id.tide_kraken_shell: {
            const unit = find_unit_by_id(effect.unit_id);

            if (unit) {
                const path = "particles/units/heroes/hero_tidehunter/tidehunter_krakenshell_purge.vpcf";
                const fx = ParticleManager.CreateParticle(path, ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW, unit.handle);

                unit_emit_sound(unit, "Hero_Tidehunter.KrakenShell");

                ParticleManager.ReleaseParticleIndex(fx);
            }

            break;
        }

        case Ability_Id.pudge_flesh_heap: {
            const [ health_bonus, heal ] = from_client_tuple(effect.deltas);
            const unit = find_unit_by_id(health_bonus.target_unit_id);

            if (unit) {
                const path = "particles/econ/items/bloodseeker/bloodseeker_eztzhok_weapon/bloodseeker_bloodbath_eztzhok.vpcf";
                const fx = ParticleManager.CreateParticle(path, ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW, unit.handle);
                ParticleManager.SetParticleControl(fx, 1, unit.handle.GetAbsOrigin());
                ParticleManager.ReleaseParticleIndex(fx);

                unit_emit_sound(unit, "pudge_ability_flesh_heap");

                play_delta(main_player, health_bonus);
                play_delta(main_player, heal);
            }

            break;
        }

        case Ability_Id.luna_moon_glaive: {
            const delta = effect.delta;
            const source = find_unit_by_id(delta.source_unit_id);
            const target = find_unit_by_id(delta.target_unit_id);
            const original_target = find_unit_by_id(effect.original_target_id);

            if (source && target && original_target) {
                const spec = get_ranged_attack_spec(source.type);

                if (spec) {
                    tracking_projectile_to_unit(original_target, target, spec.particle_path, spec.projectile_speed, "attach_hitloc");
                    unit_emit_sound(target, "Hero_Luna.MoonGlaive.Impact");
                }

                play_delta(main_player, delta);
            }

            break;
        }

        default: {
            log_chat_debug_message(`Error no ability effect for ability ${effect.ability_id} found`);
        }
    }
}

function turn_unit_towards_target(unit: Battle_Unit, towards: XY) {
    const towards_world_position = battle_position_to_world_position_center(towards);
    const desired_forward = ((towards_world_position - unit.handle.GetAbsOrigin()) * Vector(1, 1, 0) as Vector).Normalized();

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

function update_stun_visuals(unit: Battle_Unit) {
    if (unit.stunned_counter > 0) {
        print("Stun unit", unit.handle.GetName());
        unit.handle.AddNewModifier(unit.handle, undefined, "modifier_stunned", {});
    } else {
        print("Unstun unit", unit.handle.GetName());
        unit.handle.RemoveModifierByName("modifier_stunned");
    }
}

function unit_play_activity(unit: Battle_Unit, activity: GameActivity_t, wait_up_to = 0.4): number {
    unit.handle.StopFacing();
    unit.handle.Stop();
    unit.handle.ForcePlayActivityOnce(activity);

    const sequence = unit.handle.GetSequence();
    const sequence_duration = unit.handle.SequenceDuration(sequence);
    const start_time = GameRules.GetGameTime();

    while (GameRules.GetGameTime() - start_time < sequence_duration * wait_up_to) {
        if (unit.handle.GetSequence() != sequence) {
            unit.handle.ForcePlayActivityOnce(activity);
        }

        wait_one_frame();
    }

    const time_passed = GameRules.GetGameTime() - start_time;

    return sequence_duration - time_passed;
}

function change_health(main_player: Main_Player, target: Battle_Unit, new_value: number, value_delta: number) {
    const player = PlayerResource.GetPlayer(main_player.player_id);

    if (value_delta > 0) {
        SendOverheadEventMessage(player, Overhead_Event_Type.OVERHEAD_ALERT_HEAL, target.handle, value_delta, player);

    } else if (value_delta < 0) {
        SendOverheadEventMessage(player, Overhead_Event_Type.OVERHEAD_ALERT_DAMAGE, target.handle, -value_delta, player);
    }

    target.health = new_value;

    update_player_state_net_table(main_player);

    if (new_value == 0) {
        target.handle.ForceKill(false);
    }
}

function play_delta(main_player: Main_Player, delta: Delta, head: number = 0) {
    print(`Well delta type is: ${delta.type}`);

    switch (delta.type) {
        case Delta_Type.unit_spawn: {
            const fx = ParticleManager.CreateParticle("particles/hero_spawn.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, GameRules.GetGameModeEntity() as any as CDOTA_BaseNPC);
            ParticleManager.SetParticleControl(fx, 0, battle_position_to_world_position_center(delta.at_position));
            ParticleManager.ReleaseParticleIndex(fx);

            wait(0.25);

            shake_screen(delta.at_position, Shake.medium);

            const facing = delta.owner_id == main_player.remote_id ? { x: 0, y: -1 } : { x: 0, y : 1};
            const unit = spawn_unit_for_battle(delta.unit_type, delta.unit_id, delta.at_position, facing);

            unit_emit_sound(unit, "hero_spawn");

            unit.is_playing_a_delta = true;

            wait(0.25);

            unit.is_playing_a_delta = false;

            break;
        }

        case Delta_Type.unit_move: {
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
                        return (unit.handle.GetAbsOrigin() - world_position as Vector).Length2D() < battle_cell_size / 4;
                    });

                    if (guard_hit) {
                        log_chat_debug_message(`Failed waiting on MoveToPosition ${world_position.x}/${world_position.y}`);
                    }
                }

                unit.is_playing_a_delta = false;
            }

            break;
        }

        case Delta_Type.use_ground_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                attacker.is_playing_a_delta = true;

                play_ground_target_ability_delta(main_player, attacker, delta);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Delta_Type.use_unit_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (attacker && target) {
                attacker.is_playing_a_delta = true;

                play_unit_target_ability_delta(main_player, attacker, delta, target);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Delta_Type.use_no_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                attacker.is_playing_a_delta = true;

                play_no_target_ability_delta(main_player, attacker, delta);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Delta_Type.unit_force_move: {
            const unit = find_unit_by_id(delta.unit_id);
            const to = battle_position_to_world_position_center(delta.to_position);

            if (unit) {
                FindClearSpaceForUnit(unit.handle, to,  true);

                unit.position = delta.to_position;
            }

            break;
        }

        case Delta_Type.start_turn: {
            break;
        }

        case Delta_Type.end_turn: {
            break;
        }

        case Delta_Type.unit_field_change: {
            const unit = find_unit_by_id(delta.target_unit_id);

            if (unit) {
                if (delta.field == Unit_Field.state_stunned_counter) {
                    unit.stunned_counter = delta.new_value;

                    update_stun_visuals(unit);
                }

                if (delta.field == Unit_Field.level) {
                    unit.level = delta.new_value;

                    unit_emit_sound(unit, "hero_level_up");

                    const particle_path = "particles/generic_hero_status/hero_levelup.vpcf";
                    const fx = ParticleManager.CreateParticle(particle_path, ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW, unit.handle);

                    ParticleManager.ReleaseParticleIndex(fx);

                    update_player_state_net_table(main_player);
                }
            }

            break;
        }

        case Delta_Type.mana_change: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                unit.mana = delta.new_mana;

                if (delta.mana_change != 0) {
                    const player = PlayerResource.GetPlayer(main_player.player_id);

                    SendOverheadEventMessage(player, Overhead_Event_Type.OVERHEAD_ALERT_MANA_LOSS, unit.handle, delta.mana_change, player);
                }

                update_player_state_net_table(main_player);
            }

            break;
        }

        case Delta_Type.health_change: {
            const unit = find_unit_by_id(delta.target_unit_id);

            if (unit) {
                change_health(main_player, unit, delta.new_value, delta.value_delta);
            }

            break;
        }

        case Delta_Type.modifier_appled: {
            const source = find_unit_by_id(delta.source_unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (source && target) {
                play_modifier_applied_delta(main_player, source, target, delta.effect);

                update_player_state_net_table(main_player);
            }

            break;
        }

        case Delta_Type.modifier_removed: {
            const modifier_data = battle.modifier_id_to_modifier_data[delta.modifier_id];

            if (modifier_data) {
                const unit = find_unit_by_id(modifier_data.unit_id);

                if (unit) {
                    print("Remove modifier", delta.modifier_id, modifier_data.modifier_name, "from", unit.handle.GetName());

                    unit.handle.RemoveModifierByName(modifier_data.modifier_name);

                    delete battle.modifier_id_to_modifier_data[delta.modifier_id];
                }
            }

            break;
        }

        case Delta_Type.ability_effect_applied: {
            play_ability_effect_delta(main_player, delta.effect);

            break;
        }

        case Delta_Type.set_ability_cooldown_remaining: break;

        default: unreachable(delta);
    }
}

function load_battle_data() {
    const origin = Entities.FindByName(undefined, "battle_bottom_left").GetAbsOrigin();

    const camera_entity = CreateModifierThinker(
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
        camera_dummy: camera_entity,
        modifier_id_to_modifier_data: {}
    };
}

function fast_forward_from_snapshot(main_player: Main_Player, snapshot: Battle_Snapshot) {
    print("Fast forwarding from snapshot, new head", snapshot.delta_head);

    for (const unit of battle.units) {
        unit.handle.RemoveSelf();
    }

    battle.units = snapshot.units.map(unit => {
        const new_unit = spawn_unit_for_battle(unit.type, unit.id, unit.position, unit.facing);

        // TODO we need this to be typesafe, codegen a copy<T extends U, U>(source: T, target: U) function
        new_unit.health = unit.health;
        new_unit.level = unit.level;
        new_unit.mana = unit.mana;
        new_unit.stunned_counter = unit.stunned_counter;
        new_unit.handle.SetForwardVector(Vector(unit.facing.x, unit.facing.y));

        return new_unit;
    });

    battle.delta_head = snapshot.delta_head;

    update_player_state_net_table(main_player);

    // Otherwise the animations won't apply
    
    wait_one_frame();
    wait_one_frame();

    for (const unit of battle.units) {
        update_stun_visuals(unit);
    }
}