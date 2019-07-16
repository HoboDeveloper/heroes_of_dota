type XY = {
    x: number,
    y: number
}

type Battle = {
    id: number,
    players: Battle_Participant_Info[],
    deltas: Delta[];
    delta_paths: Move_Delta_Paths;
    delta_head: number;
    world_origin: Vector;
    units: Battle_Unit[];
    grid_size: {
        width: number,
        height: number
    };
    is_over: boolean
    camera_dummy: CDOTA_BaseNPC;
}

type Battle_Unit = Shared_Visualizer_Unit_Data & {
    type: Unit_Type;
    owner_remote_id: number
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

declare let battle: Battle;

const battle_cell_size = 144;

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
        case Unit_Type.skywrath_mage: return "npc_dota_hero_skywrath_mage";

        default: return unreachable(unit_type);
    }
}

function spawn_unit_for_battle(unit_type: Unit_Type, unit_id: number, owner_id: number, at: XY, facing: XY): Battle_Unit {
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
        owner_remote_id: owner_id,
        is_playing_a_delta: false,
        level: 1,
        health: definition.health,
        max_health: definition.health,
        attack_bonus: 0,
        stunned_counter: 0,
        silenced_counter: 0,
        move_points: definition.move_points,
        max_move_points: definition.move_points,
        modifiers: []
    };

    battle.units.push(unit);

    return unit;
}

function tracking_projectile_to_unit(source: Battle_Unit, target: Battle_Unit, particle_path: string, speed: number, out_attach: string = "attach_attack1") {
    const in_attach = "attach_hitloc";
    const particle = fx(particle_path)
        .to_unit_attach_point(0, source, out_attach)
        .to_unit_attach_point(1, target, in_attach)
        .with_point_value(2, speed)
        .to_unit_attach_point(3, target, in_attach);

    const world_distance = (attachment_world_origin(source.handle, out_attach) - attachment_world_origin(target.handle, in_attach) as Vector).Length();

    wait(world_distance / speed);

    particle.destroy_and_release(false);
}

function tracking_projectile_to_point(source: Battle_Unit, target: XY, particle_path: string, speed: number) {
    const out_attach = "attach_attack1";
    const world_location = battle_position_to_world_position_center(target) + Vector(0, 0, 128) as Vector;

    const particle = fx(particle_path)
        .to_unit_attach_point(0, source, out_attach)
        .with_vector_value(1, world_location)
        .with_point_value(2, speed)
        .with_vector_value(3, world_location);

    const world_distance = (attachment_world_origin(source.handle, out_attach) - world_location as Vector).Length();

    wait(world_distance / speed);

    particle.destroy_and_release(false);
}

function pudge_hook(main_player: Main_Player, pudge: Battle_Unit, cast: Delta_Ability_Pudge_Hook) {
    function is_hook_hit(cast: Pudge_Hook_Hit | Line_Ability_Miss): cast is Pudge_Hook_Hit {
        return cast.hit as any as number == 1; // Panorama passes booleans this way, meh
    }

    const target = cast.target_position;
    const hook_offset = Vector(0, 0, 96);
    const pudge_origin = pudge.handle.GetAbsOrigin() + hook_offset as Vector;
    const travel_direction = Vector(target.x - pudge.position.x, target.y - pudge.position.y).Normalized();
    const travel_speed = 1600;

    let travel_target: XY;

    if (is_hook_hit(cast.result)) {
        const target = find_unit_by_id(cast.result.target_unit_id);

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

    const chain = fx("particles/units/heroes/hero_pudge/pudge_meathook.vpcf")
        .to_unit_attach_point(0, pudge, "attach_weapon_chain_rt")
        .with_vector_value(1, pudge_origin + travel_direction * distance_to_travel as Vector)
        .with_point_value(2, travel_speed, distance_to_travel, 64)
        .with_point_value(3, time_to_travel * 2)
        .with_point_value(4, 1)
        .with_point_value(5)
        .to_unit_custom_origin(7, pudge);

    if (is_hook_hit(cast.result)) {
        const target = find_unit_by_id(cast.result.target_unit_id);

        if (!target) {
            log_chat_debug_message("Error, Pudge DAMAGE TARGET not found");
            return;
        }

        wait(time_to_travel);
        change_health(main_player, pudge, target, cast.result.damage_dealt);

        pudge.handle.StopSound(chain_sound);

        unit_emit_sound(target, "Hero_Pudge.AttackHookImpact");
        unit_emit_sound(target, chain_sound);

        target.handle.StartGesture(GameActivity_t.ACT_DOTA_FLAIL);

        fx("particles/units/heroes/hero_pudge/pudge_meathook_impact.vpcf")
            .to_unit_attach_point(0, target, "attach_hitloc")
            .release();

        chain.to_unit_attach_point(1, target, "attach_hitloc", target.handle.GetOrigin() + hook_offset as Vector);

        const travel_start_time = GameRules.GetGameTime();
        const target_world_position = battle_position_to_world_position_center(cast.result.move_target_to);
        const travel_position_start = target.handle.GetAbsOrigin();
        const travel_position_finish = GetGroundPosition(Vector(target_world_position.x, target_world_position.y), target.handle);

        while (true) {
            const now = GameRules.GetGameTime();
            const progress = Math.min(1, (now - travel_start_time) / time_to_travel);
            const travel_position = (travel_position_finish - travel_position_start) * progress + travel_position_start as Vector;

            target.handle.SetAbsOrigin(travel_position);

            if (now >= travel_start_time + time_to_travel) {
                break;
            }

            wait_one_frame();
        }

        target.handle.StopSound(chain_sound);
        target.handle.FadeGesture(GameActivity_t.ACT_DOTA_FLAIL);

        target.position = cast.result.move_target_to;
    } else {
        wait(time_to_travel);

        chain.with_vector_value(1, pudge_origin);

        pudge.handle.StopSound(chain_sound);
        EmitSoundOnLocationWithCaster(battle_position_to_world_position_center(travel_target), "Hero_Pudge.AttackHookRetractStop", pudge.handle);

        wait(time_to_travel);
    }

    hook_wearable.RemoveEffects(Effects.EF_NODRAW);
    pudge.handle.FadeGesture(GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_1);

    chain.release();
}

function tide_ravage(main_player: Main_Player, caster: Battle_Unit, cast: Delta_Ability_Tide_Ravage) {
    caster.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

    wait(0.1);

    unit_emit_sound(caster, "Ability.Ravage");
    shake_screen(caster.position, Shake.strong);

    const fx = fx_by_unit("particles/tide_ravage/tide_ravage.vpcf", caster);
    const particle_delay = 0.1;
    const deltas_by_distance: Ravage_Target[][] = [];

    for (let distance = 1; distance <= 5; distance++) {
        fx.with_point_value(distance, distance * battle_cell_size * 0.85);
    }

    fx.release();

    for (const target_data of from_client_array(cast.targets)) {
        const target = find_unit_by_id(target_data.target_unit_id);

        if (!target) {
            log_chat_debug_message(`Target with id ${target_data.target_unit_id} not found`);
            continue;
        }

        const from = caster.position;
        const to = target.position;
        const manhattan_distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

        let by_distance = deltas_by_distance[manhattan_distance];

        if (!by_distance) {
            by_distance = [];
            deltas_by_distance[manhattan_distance] = by_distance;
        }

        by_distance.push(target_data);
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

        for (const target_data of by_distance) {
            const target = find_unit_by_id(target_data.target_unit_id);

            if (!target) {
                log_chat_debug_message(`Target with id ${target_data.target_unit_id} not found`);
                continue;
            }

            const delta_id = delta_id_counter++;

            delta_completion_status[delta_id] = false;

            fork(() => {
                fx_by_unit("particles/units/heroes/hero_tidehunter/tidehunter_spell_ravage_hit.vpcf", target).release();
                unit_emit_sound(target, "Hero_Tidehunter.RavageDamage");
                toss_target_up(target);

                delta_completion_status[delta_id] = true;
            });

            change_health(main_player, caster, target, target_data.damage_dealt);
            apply_modifier(main_player, target, target_data.modifier);
        }

        wait(particle_delay);
    }

    caster.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

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

        case Unit_Type.skywrath_mage: return {
            particle_path: "particles/units/heroes/hero_skywrath_mage/skywrath_mage_base_attack.vpcf",
            projectile_speed: 800,
            attack_point: 0.5
        }
    }
}

function get_unit_deny_voice_line(type: Unit_Type): string {
    switch (type) {
        case Unit_Type.pudge: return "vo_pudge_deny";
        case Unit_Type.tidehunter: return "vo_tidehunter_deny";
        case Unit_Type.luna: return "vo_luna_deny";
        case Unit_Type.sniper: return "vo_sniper_deny";
        case Unit_Type.skywrath_mage: return "vo_skywrath_mage_deny";
        case Unit_Type.ursa: return "vo_ursa_deny";
    }
}

function try_play_sound_for_unit(unit: Battle_Unit, supplier: (type: Unit_Type) => string | undefined, target: Battle_Unit = unit) {
    const sound = supplier(unit.type);

    if (sound) {
        unit_emit_sound(target, sound);
    }
}

function perform_basic_attack(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Ability_Basic_Attack) {
    const target = cast.target_position;

    function get_unit_pre_attack_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.pudge: return "Hero_Pudge.PreAttack";
            case Unit_Type.ursa: return "Hero_Ursa.PreAttack";
            case Unit_Type.tidehunter: return "hero_tidehunter.PreAttack";
            case Unit_Type.skywrath_mage: return "Hero_SkywrathMage.PreAttack";
        }
    }

    function get_unit_attack_sound(type: Unit_Type): string {
        switch (type) {
            case Unit_Type.pudge: return "Hero_Pudge.Attack";
            case Unit_Type.ursa: return "Hero_Ursa.Attack";
            case Unit_Type.sniper: return "Hero_Sniper.attack";
            case Unit_Type.luna: return "Hero_Luna.Attack";
            case Unit_Type.tidehunter: return "hero_tidehunter.Attack";
            case Unit_Type.skywrath_mage: return "Hero_SkywrathMage.Attack";
        }
    }

    function get_unit_ranged_impact_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.sniper: return "Hero_Sniper.ProjectileImpact";
            case Unit_Type.luna: return "Hero_Luna.ProjectileImpact";
            case Unit_Type.skywrath_mage: return "Hero_SkywrathMage.ProjectileImpact";
        }
    }

    function get_unit_attack_vo(type: Unit_Type): string {
        switch (type) {
            case Unit_Type.sniper: return "vo_sniper_attack";
            case Unit_Type.luna: return "vo_luna_attack";
            case Unit_Type.pudge: return "vo_pudge_attack";
            case Unit_Type.tidehunter: return "vo_tide_attack";
            case Unit_Type.ursa: return "vo_ursa_attack";
            case Unit_Type.skywrath_mage: return "vo_skywrath_mage_attack";
        }
    }

    const ranged_attack_spec = get_ranged_attack_spec(unit.type);

    function is_attack_hit(cast: Basic_Attack_Hit | Line_Ability_Miss): cast is Basic_Attack_Hit {
        return cast.hit as any as number == 1; // Panorama passes booleans this way, meh
    }

    function highlight_grid() {
        const event: Grid_Highlight_Basic_Attack_Event = {
            unit_id: unit.id,
            from: unit.position,
            to: cast.target_position
        };

        CustomGameEventManager.Send_ServerToAllClients("grid_highlight_basic_attack", event)
    }

    if (ranged_attack_spec) {
        highlight_grid();
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
            const target_unit = find_unit_by_id(cast.result.target_unit_id);

            if (!target_unit) {
                log_chat_debug_message(`Error: unit ${cast.result.target_unit_id} not found`);
                return;
            }

            tracking_projectile_to_unit(unit, target_unit, ranged_attack_spec.particle_path, ranged_attack_spec.projectile_speed);
            change_health(main_player, unit, target_unit, cast.result.damage_dealt);
            try_play_sound_for_unit(unit, get_unit_ranged_impact_sound, target_unit);

            if (ranged_attack_spec.shake_on_impact) {
                shake_screen(target_unit.position, ranged_attack_spec.shake_on_impact);
            }
        } else {
            tracking_projectile_to_point(unit, cast.result.final_point, ranged_attack_spec.particle_path, ranged_attack_spec.projectile_speed);
        }
    } else {
        highlight_grid();
        try_play_sound_for_unit(unit, get_unit_attack_vo);
        turn_unit_towards_target(unit, target);
        wait(0.2);
        try_play_sound_for_unit(unit, get_unit_pre_attack_sound);
        unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK);

        if (is_attack_hit(cast.result)) {
            const target_unit = find_unit_by_id(cast.result.target_unit_id);

            if (target_unit) {
                change_health(main_player, unit, target_unit, cast.result.damage_dealt);
            }

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

        case Ability_Id.skywrath_mystic_flare: {
            turn_unit_towards_target(unit, cast.target_position);

            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            unit_emit_sound(unit, "vo_skywrath_mage_mystic_flare");
            unit_emit_sound(unit, "Hero_SkywrathMage.MysticFlare.Cast");
            wait(0.5);

            const targets = from_client_array(cast.targets);
            const tick_time = 0.12;

            let total_time = cast.damage_remaining * tick_time;

            for (const target of targets) {
                total_time += tick_time * (-target.damage_dealt.value_delta);
            }

            const world_target = battle_position_to_world_position_center(cast.target_position);

            EmitSoundOnLocationWithCaster(world_target, "Hero_SkywrathMage.MysticFlare", unit.handle);

            const square_side = 3;
            const circle_radius = square_side * battle_cell_size / 2;
            const arbitrary_long_duration = 100;
            const spell_fx = fx("particles/units/heroes/hero_skywrath_mage/skywrath_mage_mystic_flare_ambient.vpcf")
                .with_point_value(0, world_target.x, world_target.y, GetGroundHeight(world_target, undefined))
                .with_point_value(1, circle_radius, arbitrary_long_duration, tick_time);

            const damaged_units = targets.map(target => ({
                unit_id: target.target_unit_id,
                damage_remaining: -target.damage_dealt.value_delta
            }));

            while (damaged_units.length > 0) {
                const random_index = RandomInt(0, damaged_units.length - 1);
                const random_target = damaged_units[random_index];
                const target_unit = find_unit_by_id(random_target.unit_id);

                random_target.damage_remaining--;

                if (target_unit) {
                    fx_by_unit("particles/units/heroes/hero_skywrath_mage/skywrath_mage_mystic_flare.vpcf", target_unit).release();
                    unit_emit_sound(target_unit, "Hero_SkywrathMage.MysticFlare.Target");
                    change_health(main_player, unit, target_unit, { new_value: target_unit.health - 1, value_delta: -1 });
                }

                if (random_target.damage_remaining == 0) {
                    damaged_units.splice(random_index, 1);
                }

                wait(tick_time);
            }

            if (cast.damage_remaining > 0) {
                wait(cast.damage_remaining * tick_time);
            }

            StopSoundOn("Hero_SkywrathMage.MysticFlare", unit.handle);
            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            spell_fx.destroy_and_release(false);

            break;
        }

        default: unreachable(cast);
    }
}

function apply_modifier_changes(main_player: Main_Player, target: Battle_Unit, changes: Modifier_Change[], invert: boolean) {
    for (const change of changes) {
        const delta = invert ? -change.delta : change.delta;

        switch (change.field) {
            case Modifier_Field.move_points_bonus: {
                target.max_move_points += delta;
                target.move_points = Math.min(target.move_points, target.max_move_points);
                break;
            }

            case Modifier_Field.attack_bonus: {
                target.attack_bonus += delta;
                break;
            }

            case Modifier_Field.health_bonus: {
                target.max_health += delta;
                target.health = Math.min(target.health, target.max_health);
                break;
            }

            case Modifier_Field.state_stunned_counter: {
                target.stunned_counter += delta;

                update_state_visuals(target);
                break;
            }

            case Modifier_Field.state_silenced_counter: {
                target.silenced_counter += delta;

                update_state_visuals(target);
                break;
            }

            case Modifier_Field.armor_bonus: {
                break;
            }

            default: unreachable(change.field);
        }
    }
}

function modifier_id_to_visual_modifier(id: Modifier_Id): string | undefined {
    switch (id) {
        case Modifier_Id.tide_gush: return "Modifier_Tide_Gush";
    }
}

function apply_modifier(main_player: Main_Player, target: Battle_Unit, modifier: Modifier_Application) {
    const modifier_changes = from_client_array(modifier.changes);
    const visual_modifier = modifier_id_to_visual_modifier(modifier.modifier_id);

    print(`Apply and record ${modifier.modifier_handle_id} (${visual_modifier}) to ${target.handle.GetName()}`);

    if (visual_modifier) {
        target.handle.AddNewModifier(target.handle, undefined, visual_modifier, {});
    }

    target.modifiers.push({
        modifier_id: modifier.modifier_id,
        modifier_handle_id: modifier.modifier_handle_id,
        changes: modifier_changes
    });

    apply_modifier_changes(main_player, target, modifier_changes, false);
    update_player_state_net_table(main_player);
}

function unit_emit_sound(unit: Battle_Unit, sound: string) {
    unit.handle.EmitSound(sound);
}

function play_unit_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Unit_Target_Ability, target: Battle_Unit) {
    turn_unit_towards_target(unit, target.position);

    switch (cast.ability_id) {
        case Ability_Id.pudge_dismember: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CHANNEL_ABILITY_4);

            change_health(main_player, unit, target, cast.damage_dealt);
            change_health(main_player, unit, unit, cast.health_restored);

            break;
        }

        case Ability_Id.tide_gush: {
            const fx = "particles/units/heroes/hero_tidehunter/tidehunter_gush.vpcf";
            const { damage_dealt, modifier } = cast;

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.2);
            unit_emit_sound(unit, "Ability.GushCast");
            tracking_projectile_to_unit(unit, target, fx, 3000, "attach_attack2");
            unit_emit_sound(unit, "Ability.GushImpact");
            shake_screen(target.position, Shake.medium);
            apply_modifier(main_player, target, modifier);
            change_health(main_player, unit, target, damage_dealt);

            break;
        }

        case Ability_Id.luna_lucent_beam: {
            unit_emit_sound(unit, "Hero_Luna.LucentBeam.Cast");
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.6);

            fx("particles/units/heroes/hero_luna/luna_lucent_beam.vpcf")
                .to_unit_origin(0, target)
                .to_unit_origin(1, target)
                .to_unit_origin(5, target)
                .to_unit_origin(6, unit)
                .release();

            shake_screen(target.position, Shake.medium);
            unit_emit_sound(unit, "Hero_Luna.LucentBeam.Target");
            change_health(main_player, unit, target, cast.damage_dealt);

            break;
        }

        default: unreachable(cast);
    }
}

function play_no_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Use_No_Target_Ability) {
    switch (cast.ability_id) {
        case Ability_Id.pudge_rot: {
            const particle = fx("particles/units/heroes/hero_pudge/pudge_rot.vpcf")
                .follow_unit_origin(0, unit)
                .with_point_value(1, 300, 1, 1);
            
            const sound = "pudge_ability_rot";

            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_ROT);
            unit.handle.EmitSound(sound);

            wait(0.2);

            for (const target_data of from_client_array(cast.targets)) {
                const target = find_unit_by_id(target_data.target_unit_id);

                if (target) {
                    change_health(main_player, unit, target, target_data.damage_dealt);
                }
            }

            wait(1.0);

            unit.handle.StopSound(sound);
            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_ROT);

            particle.destroy_and_release(false);

            break;
        }

        case Ability_Id.tide_anchor_smash: {
            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_3);

            wait(0.2);

            fx_by_unit("particles/units/heroes/hero_tidehunter/tidehunter_anchor_hero.vpcf", unit).release();
            unit_emit_sound(unit, "Hero_Tidehunter.AnchorSmash");
            shake_screen(unit.position, Shake.weak);

            wait(0.2);

            for (const effect of from_client_array(cast.targets)) {
                const target = find_unit_by_id(effect.target_unit_id);

                if (target) {
                    change_health(main_player, unit, target, effect.damage_dealt);
                    apply_modifier(main_player, unit, effect.modifier);
                }
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
            const day_time = GameRules.GetTimeOfDay();

            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            unit_emit_sound(unit, "vo_luna_eclipse");
            wait(0.6);
            unit_emit_sound(unit, "Hero_Luna.Eclipse.Cast");

            GameRules.SetTimeOfDay(0);

            const eclipse_fx = fx_by_unit("particles/units/heroes/hero_luna/luna_eclipse.vpcf", unit)
                .with_point_value(1, 500)
                .to_unit_origin(2, unit)
                .to_unit_origin(3, unit);

            const beam_targets = from_client_array(cast.targets).map(delta => ({
                delta: delta,
                beams_remaining: -delta.damage_dealt.value_delta
            }));

            while (beam_targets.length > 0) {
                const random_index = RandomInt(0, beam_targets.length - 1);
                const random_target = beam_targets[random_index];
                const target_unit = find_unit_by_id(random_target.delta.target_unit_id);

                random_target.beams_remaining--;

                if (target_unit) {
                    fx("particles/units/heroes/hero_luna/luna_eclipse_impact.vpcf")
                        .to_unit_origin(0, target_unit)
                        .to_unit_origin(1, target_unit)
                        .to_unit_origin(5, target_unit)
                        .release();

                    unit_emit_sound(target_unit, "Hero_Luna.Eclipse.Target");
                    change_health(main_player, unit, target_unit, { new_value: target_unit.health - 1, value_delta: -1 });
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
                    const position = cells[RandomInt(0, cells.length - 1)];

                    fx("particles/units/heroes/hero_luna/luna_eclipse_impact_notarget.vpcf")
                        .to_location(0, position)
                        .to_location(1, position)
                        .to_location(5, position)
                        .release();

                    EmitSoundOnLocationWithCaster(battle_position_to_world_position_center(position), "Hero_Luna.Eclipse.NoTarget", unit.handle);

                    wait(0.3);
                }
            }

            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            eclipse_fx.destroy_and_release(false);

            GameRules.SetTimeOfDay(day_time);

            break;
        }

        case Ability_Id.skywrath_concussive_shot: {
            function is_shot_hit(cast: Concussive_Shot_Hit | Concussive_Shot_Miss): cast is Concussive_Shot_Hit {
                return cast.hit as any as number == 1; // Panorama passes booleans this way, meh
            }

            const projectile_fx = "particles/units/heroes/hero_skywrath_mage/skywrath_mage_concussive_shot.vpcf";

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_2, 0.1);
            unit_emit_sound(unit, "Hero_SkywrathMage.ConcussiveShot.Cast");

            if (is_shot_hit(cast.result)) {
                const target = find_unit_by_id(cast.result.target_unit_id);

                if (target) {
                    tracking_projectile_to_unit(unit, target, projectile_fx, 1200, "attach_attack2");
                    unit_emit_sound(target, "Hero_SkywrathMage.ConcussiveShot.Target");
                    change_health(main_player, unit, target, cast.result.damage);
                    apply_modifier(main_player, target, cast.result.modifier);
                    shake_screen(target.position, Shake.weak);
                }
            } else {
                const failure_fx = "particles/units/heroes/hero_skywrath_mage/skywrath_mage_concussive_shot_failure.vpcf";

                fx(failure_fx)
                    .follow_unit_origin(0, unit)
                    .release();
            }

            break;
        }

        default: unreachable(cast);
    }
}

function play_ability_effect_delta(main_player: Main_Player, effect: Ability_Effect) {
    switch (effect.ability_id) {
        case Ability_Id.luna_moon_glaive: {
            const source = find_unit_by_id(effect.source_unit_id);
            const target = find_unit_by_id(effect.target_unit_id);
            const original_target = find_unit_by_id(effect.original_target_id);

            if (source && target && original_target) {
                const spec = get_ranged_attack_spec(source.type);

                if (spec) {
                    tracking_projectile_to_unit(original_target, target, spec.particle_path, spec.projectile_speed, "attach_hitloc");
                    unit_emit_sound(target, "Hero_Luna.MoonGlaive.Impact");
                }

                change_health(main_player, source, target, effect.damage_dealt);
            }

            break;
        }

        default: unreachable(effect.ability_id);
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

function update_specific_state_visuals(unit: Battle_Unit, counter: number, associated_modifier: string) {
    if (counter > 0) {
        if (!unit.handle.HasModifier(associated_modifier)) {
            unit.handle.AddNewModifier(unit.handle, undefined, associated_modifier, {});
        }
    } else {
        unit.handle.RemoveModifierByName(associated_modifier);
    }
}

function update_state_visuals(unit: Battle_Unit) {
    update_specific_state_visuals(unit, unit.stunned_counter, "modifier_stunned");
    update_specific_state_visuals(unit, unit.silenced_counter, "modifier_silenced");
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

function change_health(main_player: Main_Player, source: Battle_Unit, target: Battle_Unit, change: Value_Change) {
    function number_particle(amount: number, r: number, g: number, b: number) {
        fx("particles/msg_damage.vpcf")
            .to_unit_origin(0, target)
            .with_point_value(1, 0, amount)
            .with_point_value(2, Math.max(1, amount / 1.5), 1)
            .with_point_value(3, r, g, b)
            .release()
    }

    const value_delta = change.value_delta;

    if (value_delta > 0) {
        number_particle(value_delta,100, 255, 50);
    } else if (value_delta < 0) {
        target.handle.AddNewModifier(target.handle, undefined, "Modifier_Damage_Effect", { duration: 0.2 });

        number_particle(-value_delta, 250, 70, 70);
    }

    target.health = change.new_value;

    update_player_state_net_table(main_player);

    if (change.new_value == 0) {
        if (source.owner_remote_id == target.owner_remote_id) {
            unit_emit_sound(source, get_unit_deny_voice_line(source.type));
        }

        target.handle.ForceKill(false);
    }
}

function play_delta(main_player: Main_Player, delta: Delta, head: number = 0) {
    print(`Well delta type is: ${delta.type}`);

    switch (delta.type) {
        case Delta_Type.unit_spawn: {
            function unit_type_to_spawn_sound(type: Unit_Type): string {
                switch (type) {
                    case Unit_Type.pudge: return "vo_pudge_spawn";
                    case Unit_Type.sniper: return "vo_sniper_spawn";
                    case Unit_Type.luna: return "vo_luna_spawn";
                    case Unit_Type.skywrath_mage: return "vo_skywrath_mage_spawn";
                    case Unit_Type.tidehunter: return "vo_tide_spawn";
                    case Unit_Type.ursa: return "vo_ursa_spawn";
                }
            }

            fx("particles/hero_spawn.vpcf")
                .to_location(0, delta.at_position)
                .release();

            wait(0.25);

            shake_screen(delta.at_position, Shake.medium);

            const owner = array_find(battle.players, player => player.id == delta.owner_id)!;
            const facing = { x: owner.deployment_zone.face_x, y: owner.deployment_zone.face_y };
            const unit = spawn_unit_for_battle(delta.unit_type, delta.unit_id, delta.owner_id, delta.at_position, facing);

            unit_emit_sound(unit, unit_type_to_spawn_sound(unit.type));
            unit_emit_sound(unit, "hero_spawn");

            unit.handle.AddNewModifier(unit.handle, undefined, "Modifier_Damage_Effect", { duration: 0.2 });

            fx_by_unit("particles/dev/library/base_dust_hit.vpcf", unit).release();

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

                    unit.move_points = unit.move_points - 1;

                    update_player_state_net_table(main_player);
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

        case Delta_Type.start_turn: {
            for (const unit of battle.units) {
                unit.move_points = unit.max_move_points;
            }

            update_player_state_net_table(main_player);
            break;
        }

        case Delta_Type.end_turn: {
            break;
        }

        case Delta_Type.level_change: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                unit.level = delta.new_level;

                unit_emit_sound(unit, "hero_level_up");
                fx_by_unit("particles/generic_hero_status/hero_levelup.vpcf", unit).release();
                update_player_state_net_table(main_player);
                wait(1);
            }

            break;
        }

        case Delta_Type.health_change: {
            const source = find_unit_by_id(delta.source_unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (source && target) {
                change_health(main_player, source, target, delta); // TODO use Value_Change
            }

            break;
        }

        case Delta_Type.modifier_removed: {
            // TODO uncomment break to label once TSTL supports it and code is migrated to the newer version
            // modifier_search: {
                for (const unit of battle.units) {
                    for (let index = 0; index < unit.modifiers.length; index++) {
                        const modifier = unit.modifiers[index];

                        if (modifier.modifier_handle_id == delta.modifier_handle_id) {
                            const modifier_visuals = modifier_id_to_visual_modifier(modifier.modifier_id);

                            if (modifier_visuals) {
                                print(`Remove modifier ${delta.modifier_handle_id} ${modifier_visuals} from ${unit.handle.GetName()}`);

                                unit.handle.RemoveModifierByName(modifier_visuals);
                            }

                            unit.modifiers.splice(index);

                            apply_modifier_changes(main_player, unit, modifier.changes, true);

                            // break modifier_search;
                        }
                    }
                }
            // }

            break;
        }

        case Delta_Type.ability_effect_applied: {
            play_ability_effect_delta(main_player, delta.effect);

            break;
        }

        case Delta_Type.draw_card: {
            break;
        }

        case Delta_Type.use_card: {
            break;
        }

        case Delta_Type.set_ability_charges_remaining: break;

        case Delta_Type.game_over: {
            const event: Game_Over_Event = {
                winner_player_id: delta.winner_player_id
            };

            CustomGameEventManager.Send_ServerToAllClients("show_game_over_screen", event);

            wait(5);

            battle.is_over = true;

            break;
        }

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
        id: -1,
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
        is_over: false,
        camera_dummy: camera_entity
    };
}

function fast_forward_from_snapshot(main_player: Main_Player, snapshot: Battle_Snapshot) {
    print("Fast forwarding from snapshot, new head", snapshot.delta_head);

    for (const unit of battle.units) {
        unit.handle.RemoveSelf();
    }

    battle.units = snapshot.units.map(unit => {
        const new_unit = spawn_unit_for_battle(unit.type, unit.id, unit.owner_id, unit.position, unit.facing);

        // TODO we need this to be typesafe, codegen a copy<T extends U, U>(source: T, target: U) function
        new_unit.health = unit.health;
        new_unit.level = unit.level;
        new_unit.stunned_counter = unit.stunned_counter;
        new_unit.attack_bonus = unit.attack_bonus;
        new_unit.max_health = unit.max_health;
        new_unit.move_points = unit.move_points;
        new_unit.max_move_points = unit.max_move_points;
        new_unit.modifiers = from_client_array(unit.modifiers).map(modifier => ({
            modifier_id: modifier.modifier_id,
            modifier_handle_id: modifier.modifier_handle_id,
            changes: from_client_array(modifier.changes)
        }));

        return new_unit;
    });

    battle.delta_head = snapshot.delta_head;

    update_player_state_net_table(main_player);

    // Otherwise the animations won't apply
    
    wait_one_frame();
    wait_one_frame();

    for (const unit of battle.units) {
        update_state_visuals(unit);

        for (const modifier of unit.modifiers) {
            const modifier_visuals = modifier_id_to_visual_modifier(modifier.modifier_id);

            if (modifier_visuals) {
                unit.handle.AddNewModifier(unit.handle, undefined, modifier_visuals, {});
            }
        }
    }
}