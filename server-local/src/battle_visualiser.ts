type XY = {
    x: number
    y: number
}

type Battle = {
    id: number
    participants: Battle_Participant_Info[]
    players: Battle_Player[]
    deltas: Delta[]
    delta_paths: Move_Delta_Paths
    delta_head: number
    world_origin: Vector
    units: Battle_Unit[]
    runes: Rune[]
    shops: Shop[]
    grid_size: {
        width: number
        height: number
    };
    is_over: boolean
    camera_dummy: CDOTA_BaseNPC
    modifier_tied_fxs: Modifier_Tied_Fx[]
}

type Battle_Player = {
    id: number
    gold: number
}

type Battle_Unit = Visualizer_Unit_Data & {
    type: Unit_Type
    owner_remote_id: number
    handle: CDOTA_BaseNPC_Hero
    position: XY;
    modifiers: Modifier_Data[]
}

type Rune = {
    id: number
    type: Rune_Type
    handle: CDOTA_BaseNPC
    position: XY

    highlight_fx: FX
    rune_fx: FX
}

type Shop = {
    id: number
    handle: CDOTA_BaseNPC
}

declare const enum Shake {
    weak = 0,
    medium = 1,
    strong = 2
}

type Ranged_Attack_Spec = {
    particle_path: string
    projectile_speed: number
    attack_point: number
    shake_on_attack?: Shake
    shake_on_impact?: Shake
}

type Modifier_Tied_Fx = {
    fx: FX
    unit_id: number
    modifier_id: Modifier_Id
}

declare let battle: Battle;

const battle_cell_size = 144;
const rune_highlight = "particles/world_environmental_fx/rune_ambient_01.vpcf";

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
    const x = battle.world_origin.x + position.x * battle_cell_size + battle_cell_size / 2;
    const y = battle.world_origin.y + position.y * battle_cell_size + battle_cell_size / 2;

    return Vector(x, y, GetGroundHeight(Vector(x, y), undefined));
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

function unit_type_to_dota_unit_name(unit_type: Unit_Type): string {
    switch (unit_type) {
        case Unit_Type.ursa: return "npc_dota_hero_ursa";
        case Unit_Type.pudge: return "npc_dota_hero_pudge";
        case Unit_Type.sniper: return "npc_dota_hero_sniper";
        case Unit_Type.tidehunter: return "npc_dota_hero_tidehunter";
        case Unit_Type.luna: return "npc_dota_hero_luna";
        case Unit_Type.skywrath_mage: return "npc_dota_hero_skywrath_mage";
        case Unit_Type.dragon_knight: return "npc_dota_hero_dragon_knight";
        case Unit_Type.lion: return "npc_dota_hero_lion";
    }
}

function create_world_handle_for_battle_unit(type: Unit_Type, at: XY, facing: XY): CDOTA_BaseNPC_Hero {
    const world_location = battle_position_to_world_position_center(at);
    const handle = CreateUnitByName(unit_type_to_dota_unit_name(type), world_location, true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS) as CDOTA_BaseNPC_Hero;
    handle.SetBaseMoveSpeed(500);
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});
    handle.SetForwardVector(Vector(facing.x, facing.y));

    return handle;
}

function create_world_handle_for_rune(type: Rune_Type, at: XY): CDOTA_BaseNPC {
    const world_location = battle_position_to_world_position_center(at);
    const handle = CreateUnitByName("npc_dummy_unit", world_location, true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS);
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});

    function rune_model(): string {
        switch (type) {
            case Rune_Type.regeneration: return "models/props_gameplay/rune_regeneration01.vmdl";
            case Rune_Type.bounty: return "models/props_gameplay/rune_goldxp.vmdl";
            case Rune_Type.double_damage: return "models/props_gameplay/rune_doubledamage01.vmdl";
            case Rune_Type.haste: return "models/props_gameplay/rune_haste01.vmdl";
        }
    }

    const model = rune_model();

    handle.SetModel(model);
    handle.SetOriginalModel(model);
    handle.StartGesture(GameActivity_t.ACT_DOTA_IDLE);

    return handle;
}

function create_world_handle_for_shop(at: XY, facing: XY): CDOTA_BaseNPC {
    const world_location = battle_position_to_world_position_center(at);
    const handle = CreateUnitByName("npc_dummy_unit", world_location, true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS);
    const model = "models/heroes/shopkeeper/shopkeeper.vmdl";
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});
    handle.SetModel(model);
    handle.SetOriginalModel(model);
    handle.StartGesture(GameActivity_t.ACT_DOTA_IDLE);
    handle.SetForwardVector(Vector(facing.x, facing.y));

    return handle;
}

function create_fx_for_rune_handle(type: Rune_Type, handle: Handle_Provider): FX {
    switch (type) {
        case Rune_Type.regeneration: return fx_follow_unit("particles/generic_gameplay/rune_regeneration.vpcf", handle);
        case Rune_Type.bounty: return fx("particles/generic_gameplay/rune_bounty_first.vpcf")
            .follow_unit_origin(0, handle)
            .follow_unit_origin(1, handle)
            .follow_unit_origin(2, handle);
        case Rune_Type.double_damage: return fx_follow_unit("particles/generic_gameplay/rune_doubledamage.vpcf", handle);
        case Rune_Type.haste: return fx_follow_unit("particles/generic_gameplay/rune_haste.vpcf", handle);
    }
}

function destroy_rune(rune: Rune, destroy_effects_instantly: boolean) {
    rune.handle.RemoveSelf();
    rune.highlight_fx.destroy_and_release(destroy_effects_instantly);
    rune.rune_fx.destroy_and_release(destroy_effects_instantly);
}

function spawn_unit_for_battle(unit_type: Unit_Type, unit_id: number, owner_id: number, at: XY, facing: XY): Battle_Unit {
    const definition = unit_definition_by_type(unit_type);

    return {
        handle: create_world_handle_for_battle_unit(unit_type, at, facing),
        id: unit_id,
        type: unit_type,
        position: at,
        owner_remote_id: owner_id,
        level: 1,
        health: definition.health,
        max_health: definition.health,
        attack_damage: definition.attack_damage,
        attack_bonus: 0,
        armor: 0,
        state_stunned_counter: 0,
        state_silenced_counter: 0,
        state_disarmed_counter: 0,
        move_points: definition.move_points,
        max_move_points: definition.move_points,
        modifiers: []
    };
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

    type Ravage_Target = (Unit_Health_Change & Unit_Modifier_Application);

    const fx = fx_by_unit("particles/tide_ravage/tide_ravage.vpcf", caster);
    const particle_delay = 0.1;
    const deltas_by_distance: Ravage_Target[][] = [];

    // @HardcodedConstant
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

    const forks: Fork[] = [];

    for (let distance = 1; distance <= 5; distance++) {
        const by_distance = deltas_by_distance[distance];

        if (!by_distance) continue;

        for (const target_data of by_distance) {
            const target = find_unit_by_id(target_data.target_unit_id);

            if (!target) {
                log_chat_debug_message(`Target with id ${target_data.target_unit_id} not found`);
                continue;
            }

            forks.push(fork(() => {
                fx_by_unit("particles/units/heroes/hero_tidehunter/tidehunter_spell_ravage_hit.vpcf", target).release();
                unit_emit_sound(target, "Hero_Tidehunter.RavageDamage");
                toss_target_up(target);
            }));

            change_health(main_player, caster, target, target_data.change);
            apply_modifier(main_player, target, target_data.modifier);
        }

        wait(particle_delay);
    }

    caster.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

    wait_for_all_forks(forks);
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
        };

        case Unit_Type.lion: return {
            particle_path: "particles/units/heroes/hero_lion/lion_base_attack.vpcf",
            projectile_speed: 1200,
            attack_point: 0.4
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
        case Unit_Type.dragon_knight: return "vo_dragon_knight_deny";
        case Unit_Type.lion: return "vo_lion_deny";
    }
}

function try_play_sound_for_unit(unit: Battle_Unit, supplier: (type: Unit_Type) => string | undefined, target: Battle_Unit = unit) {
    const sound = supplier(unit.type);

    if (sound) {
        unit_emit_sound(target, sound);
    }
}

function highlight_grid_for_targeted_ability(unit: Battle_Unit, ability: Ability_Id, to: XY) {
    const event: Grid_Highlight_Targeted_Ability_Event = {
        unit_id: unit.id,
        ability_id: ability,
        from: unit.position,
        to: to
    };

    CustomGameEventManager.Send_ServerToAllClients("grid_highlight_targeted_ability", event)
}

function highlight_grid_for_no_target_ability(unit: Battle_Unit, ability: Ability_Id) {
    const event: Grid_Highlight_No_Target_Ability_Event = {
        unit_id: unit.id,
        ability_id: ability,
        from: unit.position,
    };

    CustomGameEventManager.Send_ServerToAllClients("grid_highlight_no_target_ability", event)
}

function perform_basic_attack(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Ability_Basic_Attack) {
    const target = cast.target_position;

    function get_unit_pre_attack_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.pudge: return "Hero_Pudge.PreAttack";
            case Unit_Type.ursa: return "Hero_Ursa.PreAttack";
            case Unit_Type.tidehunter: return "hero_tidehunter.PreAttack";
            case Unit_Type.skywrath_mage: return "Hero_SkywrathMage.PreAttack";
            case Unit_Type.dragon_knight: return "Hero_DragonKnight.PreAttack";
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
            case Unit_Type.dragon_knight: return "Hero_DragonKnight.Attack";
            case Unit_Type.lion: return "Hero_Lion.Attack";
        }
    }

    function get_unit_ranged_impact_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.sniper: return "Hero_Sniper.ProjectileImpact";
            case Unit_Type.luna: return "Hero_Luna.ProjectileImpact";
            case Unit_Type.skywrath_mage: return "Hero_SkywrathMage.ProjectileImpact";
            case Unit_Type.lion: return "Hero_Lion.ProjectileImpact";
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
            case Unit_Type.dragon_knight: return "vo_dragon_knight_attack";
            case Unit_Type.lion: return "vo_lion_attack";
        }
    }

    const ranged_attack_spec = get_ranged_attack_spec(unit.type);

    function is_attack_hit(cast: Basic_Attack_Hit | Line_Ability_Miss): cast is Basic_Attack_Hit {
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
    highlight_grid_for_targeted_ability(unit, cast.ability_id, cast.target_position);

    const world_from = battle_position_to_world_position_center(unit.position);
    const world_to = battle_position_to_world_position_center(cast.target_position);
    const direction = ((world_to - world_from) as Vector).Normalized();

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
                total_time += tick_time * (-target.change.value_delta);
            }

            const world_target = battle_position_to_world_position_center(cast.target_position);

            EmitSoundOnLocationWithCaster(world_target, "Hero_SkywrathMage.MysticFlare", unit.handle);

            // @HardcodedConstant
            const square_side = 3;
            const circle_radius = square_side * battle_cell_size / 2;
            const arbitrary_long_duration = 100;
            const spell_fx = fx("particles/units/heroes/hero_skywrath_mage/skywrath_mage_mystic_flare_ambient.vpcf")
                .with_point_value(0, world_target.x, world_target.y, world_target.z)
                .with_point_value(1, circle_radius, arbitrary_long_duration, tick_time);

            const damaged_units = targets.map(target => ({
                unit_id: target.target_unit_id,
                damage_remaining: -target.change.value_delta
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

        case Ability_Id.dragon_knight_breathe_fire: {
            turn_unit_towards_target(unit, cast.target_position);
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.3);
            unit_emit_sound(unit, "Hero_DragonKnight.BreathFire");

            function fire_breath_projectile(distance_in_cells: number, from: Vector, direction: Vector) {
                const speed = 1500;
                const travel_time = battle_cell_size * distance_in_cells  / speed;
                const particle_velocity = direction * speed as Vector;

                const particle = fx("particles/units/heroes/hero_dragon_knight/dragon_knight_breathe_fire.vpcf")
                    .with_vector_value(0, from)
                    .with_forward_vector(0, direction)
                    .with_vector_value(1, particle_velocity);

                wait(travel_time);

                particle.destroy_and_release(false);
            }

            const stem_length = 3; // @HardcodedConstant
            const final_position = world_from + direction * (stem_length * battle_cell_size) as Vector;

            fire_breath_projectile(stem_length, world_from, direction);

            for (const target of from_client_array(cast.targets)) {
                const target_unit = find_unit_by_id(target.target_unit_id);

                if (target_unit) {
                    change_health(main_player, unit, target_unit, target.change);
                }
            }

            const arm_length = 2; // @HardcodedConstant
            const direction_left = Vector(-direction.y, direction.x, direction.z);

            let left_complete = false, right_complete = false;

            fork(() => {
                fire_breath_projectile(arm_length, final_position, direction_left);
                
                left_complete = true;
            });

            fork(() => {
                fire_breath_projectile(arm_length, final_position, -direction_left as Vector);

                right_complete = true;
            });
            
            wait_until(() => left_complete && right_complete);

            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form_attack: {
            unit_emit_sound(unit, "vo_dragon_knight_dragon_attack");
            turn_unit_towards_target(unit, cast.target_position);
            wait(0.2);
            unit_emit_sound(unit, "Hero_DragonKnight.ElderDragonShoot3.Attack");
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK);
            tracking_projectile_to_point(unit, cast.target_position, "particles/units/heroes/hero_dragon_knight/dragon_knight_dragon_tail_dragonform_proj.vpcf", 1200);

            for (const target of from_client_array(cast.targets)) {
                const target_unit = find_unit_by_id(target.target_unit_id);

                if (target_unit) {
                    change_health(main_player, unit, target_unit, target.change);
                }
            }

            unit_emit_sound(unit, "Hero_DragonKnight.ElderDragonShoot3.Attack");

            EmitSoundOnLocationWithCaster(battle_position_to_world_position_center(cast.target_position), "Hero_DragonKnight.ProjectileImpact", unit.handle);

            shake_screen(cast.target_position, Shake.medium);

            break;
        }

        case Ability_Id.lion_impale: {
            turn_unit_towards_target(unit, cast.target_position);
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.3);
            unit_emit_sound(unit, "Hero_Lion.Impale");

            // @HardcodedConstant
            const distance_to_travel = 3;
            const travel_speed = 1500;
            const start_time = GameRules.GetGameTime();
            const time_to_travel = distance_to_travel * battle_cell_size / travel_speed;
            const particle = fx("particles/units/heroes/hero_lion/lion_spell_impale.vpcf")
                .with_vector_value(0, battle_position_to_world_position_center(unit.position))
                .with_vector_value(1, direction * travel_speed as Vector);

            type Impale_Target = {
                unit: Battle_Unit
                change: Health_Change
                modifier: Modifier_Application
                was_hit: boolean
            }

            const targets: Impale_Target[] = [];

            for (const target of from_client_array(cast.targets)) {
                const target_unit = find_unit_by_id(target.target_unit_id);

                if (target_unit) {
                    targets.push({
                        unit: target_unit,
                        change: target.change,
                        modifier: target.modifier,
                        was_hit: false
                    })
                }
            }

            const forks: Fork[] = [];

            while (true) {
                const travelled_for = GameRules.GetGameTime() - start_time;
                const distance_travelled = travelled_for * travel_speed;

                if (travelled_for >= time_to_travel && targets.every(target => target.was_hit)) {
                    break;
                }

                for (const target of targets) {
                    if (target.was_hit) continue;

                    if (target.unit && distance_travelled > (target.unit.handle.GetAbsOrigin() - world_from as Vector).Length2D()) {
                        change_health(main_player, unit, target.unit, target.change);
                        apply_modifier(main_player, target.unit, target.modifier);

                        forks.push(fork(() => {
                            unit_emit_sound(target.unit, "Hero_Lion.ImpaleHitTarget");
                            toss_target_up(target.unit);
                            unit_emit_sound(target.unit, "Hero_Lion.ImpaleTargetLand");
                        }));

                        target.was_hit = true;
                    }
                }

                wait_one_frame();
            }

            particle.destroy_and_release(false);

            wait_for_all_forks(forks);

            break;
        }

        default: unreachable(cast);
    }
}

function apply_modifier_changes(main_player: Main_Player, target: Battle_Unit, changes: Modifier_Change[], invert: boolean) {
    for (const change of changes) {
        switch (change.type) {
            case Modifier_Change_Type.field_change: {
                apply_modifier_field_change(target, change, invert);
                break;
            }
            
            case Modifier_Change_Type.ability_swap: {
                break;
            }
        }
    }

    update_state_visuals(target);
}

type Modifier_Visuals_Complex = {
    complex: true
    native_modifier_name: string
}

type Modifier_Visuals_Simple = {
    complex: false
    fx_applier: (this: void, unit: Battle_Unit) => FX
}

function modifier_id_to_visuals(id: Modifier_Id): Modifier_Visuals_Complex | Modifier_Visuals_Simple | undefined {
    function complex(name: string): Modifier_Visuals_Complex {
        return {
            complex: true,
            native_modifier_name: name
        }
    }

    function simple(fx_applier: (this: void, unit: Battle_Unit) => FX): Modifier_Visuals_Simple {
        return {
            complex: false,
            fx_applier: fx_applier
        }
    }

    switch (id) {
        case Modifier_Id.tide_gush: return complex("Modifier_Tide_Gush");
        case Modifier_Id.skywrath_ancient_seal: return simple(target =>
            fx("particles/units/heroes/hero_skywrath_mage/skywrath_mage_ancient_seal_debuff.vpcf")
                .follow_unit_overhead(0, target)
                .follow_unit_origin(1, target)
        );
        case Modifier_Id.dragon_knight_elder_dragon_form: return complex("Modifier_Dragon_Knight_Elder_Dragon");
        case Modifier_Id.lion_hex: return complex("Modifier_Lion_Hex");
        case Modifier_Id.rune_double_damage: return simple(target =>
            fx_follow_unit("particles/generic_gameplay/rune_doubledamage_owner.vpcf", target)
        );
        case Modifier_Id.rune_haste: return simple(target =>
            fx_follow_unit("particles/generic_gameplay/rune_haste_owner.vpcf", target)
        );
        case Modifier_Id.item_satanic: return simple(target =>
            fx_follow_unit("particles/items2_fx/satanic_buff.vpcf", target)
        );
    }
}

function try_apply_modifier_visuals(target: Battle_Unit, modifier_id: Modifier_Id) {
    const visuals = modifier_id_to_visuals(modifier_id);

    if (!visuals) {
        return;
    }

    if (visuals.complex) {
        target.handle.AddNewModifier(target.handle, undefined, visuals.native_modifier_name, {});
    } else {
        battle.modifier_tied_fxs.push({
            unit_id: target.id,
            modifier_id: modifier_id,
            fx: visuals.fx_applier(target)
        })
    }
}

function apply_modifier(main_player: Main_Player, target: Battle_Unit, modifier: Modifier_Application) {
    const modifier_changes = from_client_array(modifier.changes);

    print(`Apply and record ${modifier.modifier_handle_id} to ${target.handle.GetName()}`);

    try_apply_modifier_visuals(target, modifier.modifier_id);

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
    highlight_grid_for_targeted_ability(unit, cast.ability_id, target.position);

    switch (cast.ability_id) {
        case Ability_Id.pudge_dismember: {
            function loop_health_change(target: Battle_Unit, change: Health_Change) {
                const loops = 4;
                const length = Math.abs(change.new_value - target.health);
                const direction = change.value_delta / length;
                const change_per_loop = Math.ceil(length / loops);

                let remaining = length;

                while (remaining != 0) {
                    const delta = (remaining > change_per_loop ? change_per_loop : remaining) * direction;

                    change_health(main_player, unit, target, { new_value: target.health + delta, value_delta: delta });

                    remaining = Math.max(0, remaining - change_per_loop);

                    wait(0.6);
                }
            }

            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CHANNEL_ABILITY_4);

            wait_for_all_forks([
                fork(() => loop_health_change(target, cast.damage_dealt)),
                fork(() => loop_health_change(unit, cast.health_restored))
            ]);

            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CHANNEL_ABILITY_4);

            break;
        }

        case Ability_Id.tide_gush: {
            const fx = "particles/units/heroes/hero_tidehunter/tidehunter_gush.vpcf";

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.2);
            unit_emit_sound(unit, "Ability.GushCast");
            tracking_projectile_to_unit(unit, target, fx, 3000, "attach_attack2");
            unit_emit_sound(unit, "Ability.GushImpact");
            shake_screen(target.position, Shake.medium);
            apply_modifier(main_player, target, cast.modifier);
            change_health(main_player, unit, target, cast.damage_dealt);

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

        case Ability_Id.skywrath_ancient_seal: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_3, 0.4);
            unit_emit_sound(target, "Hero_SkywrathMage.AncientSeal.Target");
            apply_modifier(main_player, target, cast.modifier);

            break;
        }

        case Ability_Id.dragon_knight_dragon_tail: {
            fx("particles/units/heroes/hero_dragon_knight/dragon_knight_dragon_tail.vpcf")
                .to_unit_attach_point(2, unit, "attach_attack2")
                .with_vector_value(3, unit.handle.GetForwardVector())
                .to_unit_attach_point(4, target, "attach_hitloc")
                .release();

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_2, 0.4);
            unit_emit_sound(target, "Hero_DragonKnight.DragonTail.Target");
            apply_modifier(main_player, target, cast.modifier);
            change_health(main_player, unit, target, cast.damage_dealt);
            shake_screen(target.position, Shake.medium);

            break;
        }

        case Ability_Id.lion_hex: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_2, 0.4);
            unit_emit_sound(target, "Hero_Lion.Voodoo");
            unit_emit_sound(target, "Hero_Lion.Hex.Target");
            apply_modifier(main_player, target, cast.modifier);
            shake_screen(target.position, Shake.weak);
            fx_by_unit("particles/units/heroes/hero_lion/lion_spell_voodoo.vpcf", target).release();

            break;
        }

        case Ability_Id.lion_finger_of_death: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_4, 0.4);
            unit_emit_sound(unit, "Hero_Lion.FingerOfDeath");

            fx("particles/units/heroes/hero_lion/lion_spell_finger_of_death.vpcf")
                .to_unit_attach_point(0, unit, "attach_attack2")
                .to_unit_attach_point(1, target, "attach_hitloc")
                .to_unit_attach_point(2, target, "attach_hitloc")
                .release();

            wait(0.1);

            unit_emit_sound(target, "Hero_Lion.FingerOfDeathImpact");
            change_health(main_player, unit, target, cast.damage_dealt);
            shake_screen(target.position, Shake.medium);

            break;
        }

        default: unreachable(cast);
    }
}

function play_no_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Use_No_Target_Ability) {
    highlight_grid_for_no_target_ability(unit, cast.ability_id);

    switch (cast.ability_id) {
        case Ability_Id.pudge_rot: {
            const particle = fx_follow_unit("particles/units/heroes/hero_pudge/pudge_rot.vpcf", unit).with_point_value(1, 300, 1, 1);
            const sound = "pudge_ability_rot";

            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_ROT);
            unit.handle.EmitSound(sound);

            wait(0.2);

            for (const target_data of from_client_array(cast.targets)) {
                const target = find_unit_by_id(target_data.target_unit_id);

                if (target) {
                    change_health(main_player, unit, target, target_data.change);
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
                    change_health(main_player, unit, target, effect.change);
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
                beams_remaining: -delta.change.value_delta
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
                // @HardcodedConstant
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

                fx_follow_unit(failure_fx, unit).release();
            }

            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form: {
            unit_emit_sound(unit, "vo_dragon_knight_elder_dragon_form");
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.8);
            fx_by_unit("particles/units/heroes/hero_dragon_knight/dragon_knight_transform_red.vpcf", unit).release();
            unit_emit_sound(unit, "Hero_DragonKnight.ElderDragonForm");
            apply_modifier(main_player, unit, cast.modifier);

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

function play_rune_pickup_delta(main_player: Main_Player, unit: Battle_Unit, delta: Delta_Rune_Pick_Up) {
    switch (delta.rune_type) {
        case Rune_Type.bounty: {
            fx("particles/generic_gameplay/rune_bounty_owner.vpcf")
                .follow_unit_origin(0, unit)
                .follow_unit_origin(1, unit)
                .release();

            const player = array_find(battle.players, player => player.id == unit.owner_remote_id);

            if (player) {
                player.gold += delta.gold_gained;
            }

            unit_emit_sound(unit, "Rune.Bounty");
            wait(0.5);

            break;
        }

        case Rune_Type.double_damage: {
            unit_emit_sound(unit, "Rune.DD");
            apply_modifier(main_player, unit, delta.modifier);
            wait(0.5);

            break;
        }

        case Rune_Type.haste: {
            unit_emit_sound(unit, "Rune.Haste");
            apply_modifier(main_player, unit, delta.modifier);
            wait(0.5);

            break;
        }

        case Rune_Type.regeneration: {
            const target = delta.heal.new_value;
            const direction = delta.heal.value_delta / Math.abs(delta.heal.value_delta);
            const particle = fx("particles/generic_gameplay/rune_regen_owner.vpcf")
                .follow_unit_origin(0, unit)
                .follow_unit_origin(1, unit);

            unit_emit_sound(unit, "Rune.Regen");

            while (unit.health != target) {
                change_health(main_player, unit, unit, { value_delta: direction, new_value: unit.health + direction });

                wait(0.25);
            }

            particle.destroy_and_release(false);

            wait(0.25);

            break;
        }
    }
}

function play_item_equip_delta(main_player: Main_Player, unit: Battle_Unit, delta: Delta_Equip_Item) {
    wait(0.3);

    unit_emit_sound(unit, "Item.PickUpShop");

    switch (delta.item_id) {
        case Item_Id.assault_cuirass: {
            apply_modifier(main_player, unit, delta.modifier);
            break;
        }

        case Item_Id.boots_of_travel: {
            apply_modifier(main_player, unit, delta.modifier);
            break;
        }

        case Item_Id.divine_rapier: {
            apply_modifier(main_player, unit, delta.modifier);
            break;
        }

        case Item_Id.heart_of_tarrasque: {
            apply_modifier(main_player, unit, delta.modifier);
            break;
        }

        case Item_Id.satanic: {
            apply_modifier(main_player, unit, delta.modifier);
            unit_emit_sound(unit, "equip_satanic");
            break;
        }

        case Item_Id.tome_of_knowledge: {
            change_unit_level(main_player, unit, delta.new_level);
            break;
        }

        case Item_Id.refresher_shard: {
            fx("particles/items2_fx/refresher.vpcf").to_unit_attach_point(0, unit, "attach_hitloc").release();
            unit_emit_sound(unit, "equip_refresher");

            break;
        }
    }

    wait(1.2);
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
    update_specific_state_visuals(unit, unit.state_stunned_counter, "modifier_stunned");
    update_specific_state_visuals(unit, unit.state_silenced_counter, "modifier_silence");
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

function change_health(main_player: Main_Player, source: Battle_Unit, target: Battle_Unit, change: Health_Change) {
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

function move_unit(main_player: Main_Player, unit: Battle_Unit, path: XY[]) {
    for (const cell of path) {
        const world_position = battle_position_to_world_position_center(cell);

        unit.handle.MoveToPosition(world_position);

        wait_until(() => {
            return (unit.handle.GetAbsOrigin() - world_position as Vector).Length2D() < battle_cell_size / 4;
        });

        unit.move_points = unit.move_points - 1;

        update_player_state_net_table(main_player);
    }
}

function change_unit_level(main_player: Main_Player, unit: Battle_Unit, new_level: number) {
    unit.level = new_level;

    unit_emit_sound(unit, "hero_level_up");
    fx_by_unit("particles/generic_hero_status/hero_levelup.vpcf", unit).release();
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
                    case Unit_Type.dragon_knight: return "vo_dragon_knight_spawn";
                    case Unit_Type.lion: return "vo_lion_spawn";
                }
            }

            fx("particles/hero_spawn.vpcf")
                .to_location(0, delta.at_position)
                .release();

            wait(0.25);

            shake_screen(delta.at_position, Shake.medium);

            const owner = array_find(battle.participants, player => player.id == delta.owner_id)!;
            const facing = { x: owner.deployment_zone.face_x, y: owner.deployment_zone.face_y };
            const unit = spawn_unit_for_battle(delta.unit_type, delta.unit_id, delta.owner_id, delta.at_position, facing);

            battle.units.push(unit);

            unit_emit_sound(unit, unit_type_to_spawn_sound(unit.type));
            unit_emit_sound(unit, "hero_spawn");

            unit.handle.AddNewModifier(unit.handle, undefined, "Modifier_Damage_Effect", { duration: 0.2 });

            fx_by_unit("particles/dev/library/base_dust_hit.vpcf", unit).release();

            wait(0.25);

            break;
        }

        case Delta_Type.rune_spawn: {
            const handle = create_world_handle_for_rune(delta.rune_type, delta.at);

            battle.runes.push({
                id: delta.rune_id,
                type: delta.rune_type,
                position: delta.at,
                handle: handle,
                highlight_fx: fx_follow_unit(rune_highlight, { handle: handle }),
                rune_fx: create_fx_for_rune_handle(delta.rune_type, { handle: handle })
            });

            break;
        }

        case Delta_Type.shop_spawn: {
            battle.shops.push({
                id: delta.shop_id,
                handle: create_world_handle_for_shop(delta.at, delta.facing)
            });

            break;
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(delta.unit_id);
            const path = battle.delta_paths[head];

            if (!unit) break;
            if (!path) break;

            unit.position = delta.to_position;

            move_unit(main_player, unit, path);

            break;
        }

        case Delta_Type.rune_pick_up: {
            const unit = find_unit_by_id(delta.unit_id);
            const rune_index = array_find_index(battle.runes, rune => rune.id == delta.rune_id);
            const path = battle.delta_paths[head];

            if (rune_index == -1) break;
            if (!unit) break;
            if (!path) break;

            const rune = battle.runes[rune_index];

            unit.position = rune.position;

            move_unit(main_player, unit, path);
            destroy_rune(rune, false);

            battle.runes.splice(rune_index, 1);

            play_rune_pickup_delta(main_player, unit, delta);

            break;
        }

        case Delta_Type.gold_change: {
            const player = array_find(battle.players, player => player.id == delta.player_id);

            if (player) {
                player.gold += delta.change;
            }

            break;
        }

        case Delta_Type.purchase_item: {
            const unit = find_unit_by_id(delta.unit_id);

            if (!unit) break;

            const player = array_find(battle.players, player => player.id == unit.owner_remote_id);

            if (!player) break;

            player.gold -= delta.gold_cost;

            break;
        }

        case Delta_Type.equip_item: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                play_item_equip_delta(main_player, unit, delta);
            }

            break;
        }

        case Delta_Type.use_ground_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                play_ground_target_ability_delta(main_player, attacker, delta);
            }

            break;
        }

        case Delta_Type.use_unit_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (attacker && target) {
                play_unit_target_ability_delta(main_player, attacker, delta, target);
            }

            break;
        }

        case Delta_Type.use_no_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                play_no_target_ability_delta(main_player, attacker, delta);
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
                change_unit_level(main_player, unit, delta.new_level);
                update_player_state_net_table(main_player);
                wait(1);
            }

            break;
        }

        case Delta_Type.health_change: {
            const source = find_unit_by_id(delta.source_unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (source && target) {
                change_health(main_player, source, target, delta); // TODO use Health_Change
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
                            const modifier_visuals = modifier_id_to_visuals(modifier.modifier_id);

                            if (modifier_visuals) {
                                print(`Remove modifier ${delta.modifier_handle_id} ${modifier_visuals} from ${unit.handle.GetName()}`);

                                if (modifier_visuals.complex) {
                                    unit.handle.RemoveModifierByName(modifier_visuals.native_modifier_name);
                                } else {
                                    for (let fx_index = 0; fx_index < battle.modifier_tied_fxs.length; fx_index++) {
                                        const fx = battle.modifier_tied_fxs[fx_index];

                                        if (fx.modifier_id == modifier.modifier_id && fx.unit_id == unit.id) {
                                            fx.fx.destroy_and_release(false);

                                            battle.modifier_tied_fxs.splice(fx_index, 1);

                                            break;
                                        }
                                    }
                                }
                            }

                            unit.modifiers.splice(index, 1);

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

        case Delta_Type.draw_card: break;
        case Delta_Type.use_card: break;
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

function periodically_update_battle() {
    for (const rune of battle.runes) {
        // Double damage rune doesn't spin by itself because Valve
        if (rune.type == Rune_Type.double_damage) {
            const current_angle = (GameRules.GetGameTime() % (Math.PI * 2)) * 2.0;
            rune.handle.SetForwardVector(Vector(Math.cos(current_angle), Math.sin(current_angle)))
        }
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
        participants: [],
        delta_paths: {},
        delta_head: 0,
        world_origin: origin,
        units: [],
        runes: [],
        shops: [],
        grid_size: {
            width: 0,
            height: 0
        },
        is_over: false,
        camera_dummy: camera_entity,
        modifier_tied_fxs: []
    };
}

function fast_forward_from_snapshot(main_player: Main_Player, snapshot: Battle_Snapshot) {
    print("Fast forwarding from snapshot, new head", snapshot.delta_head);

    // TODO remove particles
    for (const unit of battle.units) {
        unit.handle.RemoveSelf();
    }

    for (const rune of battle.runes) {
        destroy_rune(rune, true);
    }

    for (const shop of battle.shops) {
        shop.handle.RemoveSelf();
    }

    battle.players = snapshot.players.map(player => ({
        id: player.id,
        gold: player.gold
    }));

    battle.units = snapshot.units.map(unit => {
        const restored_unit: Battle_Unit = {
            id: unit.id,
            type: unit.type,
            armor: unit.armor,
            health: unit.health,
            max_health: unit.max_health,
            move_points: unit.move_points,
            max_move_points: unit.max_move_points,
            attack_damage: unit.attack_damage,
            attack_bonus: unit.attack_bonus,
            level: unit.level,
            state_stunned_counter: unit.state_stunned_counter,
            state_silenced_counter: unit.state_silenced_counter,
            state_disarmed_counter: unit.state_disarmed_counter,
            modifiers: from_client_array(unit.modifiers).map(modifier => ({
                modifier_id: modifier.modifier_id,
                modifier_handle_id: modifier.modifier_handle_id,
                changes: from_client_array(modifier.changes)
            })),
            position: unit.position,
            owner_remote_id: unit.owner_id,
            handle: create_world_handle_for_battle_unit(unit.type, unit.position, unit.facing)
        };

        battle.units.push(restored_unit);

        return restored_unit;
    });

    battle.runes = snapshot.runes.map(rune => {
        const handle = create_world_handle_for_rune(rune.type, rune.position);
        return {
            id: rune.id,
            type: rune.type,
            handle: handle,
            position: rune.position,
            highlight_fx: fx_follow_unit(rune_highlight, { handle: handle }),
            rune_fx: create_fx_for_rune_handle(rune.type, { handle: handle })
        };
    });

    battle.shops = snapshot.shops.map(shop => ({
        id: shop.id,
        handle: create_world_handle_for_shop(shop.position, shop.facing)
    }));

    battle.delta_head = snapshot.delta_head;

    update_player_state_net_table(main_player);

    // Otherwise the animations won't apply
    
    wait_one_frame();
    wait_one_frame();

    for (const unit of battle.units) {
        update_state_visuals(unit);

        for (const modifier of unit.modifiers) {
            try_apply_modifier_visuals(unit, modifier.modifier_id);
        }
    }
}