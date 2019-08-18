type XY = {
    x: number
    y: number
}

type Battle = {
    id: number
    random_seed: number
    participants: Battle_Participant_Info[]
    players: Battle_Player[]
    deltas: Delta[]
    delta_paths: Move_Delta_Paths
    delta_head: number
    world_origin: Vector
    units: Battle_Unit[]
    runes: Rune[]
    shops: Shop[]
    trees: Tree[]
    grid_size: {
        width: number
        height: number
    };
    has_started: boolean
    is_over: boolean
    camera_dummy: CDOTA_BaseNPC
    modifier_tied_fxs: Modifier_Tied_Fx[]
}

type Battle_Player = {
    id: number
    gold: number
}

type Battle_Unit_Base = Unit_Stats & {
    id: number
    handle: CDOTA_BaseNPC_Hero
    position: XY;
    modifiers: Modifier_Data[]
    dead: boolean
    hidden: boolean
}

type Battle_Hero = Battle_Unit_Base & {
    supertype: Unit_Supertype.hero
    owner_remote_id: number
    level: number
    type: Hero_Type
}

type Battle_Creep = Battle_Unit_Base & {
    supertype: Unit_Supertype.creep
}

type Battle_Unit = Battle_Hero | Battle_Creep

type Tree = {
    id: number
    handle: CBaseEntity
    position: XY
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
    position: XY
}

const enum Shake {
    weak,
    medium,
    strong
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

function find_hero_by_id(id: number): Battle_Hero | undefined {
    const unit = find_unit_by_id(id);

    if (unit && unit.supertype == Unit_Supertype.hero) {
        return unit;
    }
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

function hero_type_to_dota_unit_name(hero_type: Hero_Type): string {
    return `npc_dota_hero_${get_hero_dota_name(hero_type)}`;
}

function creep_to_dota_unit_name(): string {
    return "hod_creep";
}

function create_world_handle_for_battle_unit(dota_unit_name: string, at: XY, facing: XY): CDOTA_BaseNPC_Hero {
    const world_location = battle_position_to_world_position_center(at);
    const handle = CreateUnitByName(dota_unit_name, world_location, true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS) as CDOTA_BaseNPC_Hero;
    handle.SetBaseMoveSpeed(500);
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});
    handle.SetForwardVector(Vector(facing.x, facing.y));
    handle.SetUnitCanRespawn(true);

    return handle;
}

function create_world_handle_for_rune(type: Rune_Type, at: XY): CDOTA_BaseNPC {
    const world_location = battle_position_to_world_position_center(at);
    const handle = CreateUnitByName("npc_dummy_unit", world_location, true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS);
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});
    handle.SetUnitCanRespawn(true);

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
    handle.SetUnitCanRespawn(true);

    return handle;
}

function create_world_handle_for_tree(tree_id: number, at: XY): CBaseEntity {
    const models = [
        "models/props_tree/cypress/tree_cypress010.vmdl",
        "models/props_tree/cypress/tree_cypress008.vmdl"
    ];

    const r_variance = ((battle.random_seed + tree_id) * 2) % 20 - 10;
    const g_variance = ((battle.random_seed + tree_id) * 3) % 20 - 10;
    const random_model = models[(battle.random_seed + tree_id) % models.length];

    const entity = SpawnEntityFromTableSynchronous("prop_dynamic", {
        origin: battle_position_to_world_position_center(at),
        model: random_model
    }) as CBaseModelEntity;

    entity.SetRenderColor(80 + r_variance, 90 + g_variance, 30);

    return entity;
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

function unit_base(unit_id: number, dota_unit_name: string, definition: Unit_Definition, at: XY, facing: XY): Battle_Unit_Base {
    return {
        handle: create_world_handle_for_battle_unit(dota_unit_name, at, facing),
        id: unit_id,
        position: at,
        health: definition.health,
        max_health: definition.health,
        attack_damage: definition.attack_damage,
        attack_bonus: 0,
        armor: 0,
        state_stunned_counter: 0,
        state_silenced_counter: 0,
        state_disarmed_counter: 0,
        state_out_of_the_game_counter: 0,
        move_points: definition.move_points,
        move_points_bonus: 0,
        max_move_points: definition.move_points,
        modifiers: [],
        dead: false,
        hidden: false
    };
}

function spawn_creep_for_battle(unit_id: number, definition: Unit_Definition, at: XY, facing: XY): Battle_Creep {
    const base = unit_base(unit_id, creep_to_dota_unit_name(), definition, at, facing);

    return assign<Battle_Unit_Base, Battle_Creep>(base, {
        supertype: Unit_Supertype.creep
    })
}

function spawn_hero_for_battle(hero_type: Hero_Type, unit_id: number, owner_id: number, at: XY, facing: XY): Battle_Hero {
    const definition = unit_definition_by_type(hero_type);
    const base = unit_base(unit_id, hero_type_to_dota_unit_name(hero_type), definition, at, facing);

    return assign<Battle_Unit_Base, Battle_Hero>(base, {
        supertype: Unit_Supertype.hero,
        type: hero_type,
        owner_remote_id: owner_id,
        level: 1
    });
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

function do_each_frame_for(time: number, action: (progress: number) => void) {
    const start_time = GameRules.GetGameTime();

    while (true) {
        const now = GameRules.GetGameTime();
        const progress = Math.min(1, (now - start_time) / time);

        action(progress);

        if (progress == 1) {
            break;
        }

        wait_one_frame();
    }
}

function toss_target_up(target: Battle_Unit) {
    const toss_time = 0.4;
    const start_origin = target.handle.GetAbsOrigin();

    target.handle.StartGesture(GameActivity_t.ACT_DOTA_FLAIL);

    do_each_frame_for(toss_time, progress => {
        const current_height = Math.sin(progress * Math.PI) * 260;

        target.handle.SetAbsOrigin(start_origin + Vector(0, 0, current_height) as Vector);
    });

    target.handle.FadeGesture(GameActivity_t.ACT_DOTA_FLAIL);
}

function linear_projectile_with_targets<T>(
    from: XY,
    towards: XY,
    travel_speed: number,
    distance_in_cells: number,
    fx_path: string,
    targets: T[],
    position_getter: (target: T) => Vector,
    action: (target: T) => void
) {
    const start_time = GameRules.GetGameTime();
    const time_to_travel = distance_in_cells * battle_cell_size / travel_speed;
    const world_from = battle_position_to_world_position_center(from);
    const direction = Vector(towards.x - from.x, towards.y - from.y).Normalized();

    const particle = fx(fx_path)
        .with_vector_value(0, world_from)
        .with_forward_vector(0, direction)
        .with_vector_value(1, direction * travel_speed as Vector);

    type Target_Record = {
        target: T
        was_hit: boolean
    }

    const target_records: Target_Record[] = [];

    for (const target of targets) {
        target_records.push({
            target: target,
            was_hit: false
        })
    }

    while (true) {
        const travelled_for = GameRules.GetGameTime() - start_time;
        const distance_travelled = travelled_for * travel_speed;

        if (travelled_for >= time_to_travel && target_records.every(target => target.was_hit)) {
            break;
        }

        for (const record of target_records) {
            if (record.was_hit) continue;

            if (distance_travelled > (position_getter(record.target) - world_from as Vector).Length2D()) {
                action(record.target);

                record.was_hit = true;
            }
        }

        wait_one_frame();
    }

    particle.destroy_and_release(false);
}

type Replace_Target_Unit_Id<T> = Pick<T, Exclude<keyof T, "target_unit_id">> & { unit: Battle_Unit };

function filter_and_map_existing_units<T extends { target_unit_id: number }>(array: T[]): Replace_Target_Unit_Id<T>[] {
    const result: Replace_Target_Unit_Id<T>[] = [];

    for (const member of array) {
        const unit = find_unit_by_id(member.target_unit_id);

        if (unit) {
            const replaced: table = {};
            replaced.unit = unit;

            for (const key in member) {
                replaced[key] = member[key];
            }

            result.push(replaced as Replace_Target_Unit_Id<T>);

            /* This would be enough AND typesafe if it worked in TSTL
            result.push({
                ...member,
                unit: unit
            });
             */
        }
    }

    return result;
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

        const target_world_position = battle_position_to_world_position_center(cast.result.move_target_to);
        const travel_position_start = target.handle.GetAbsOrigin();
        const travel_position_finish = GetGroundPosition(Vector(target_world_position.x, target_world_position.y), target.handle);

        do_each_frame_for(time_to_travel, progress => {
            const travel_position = (travel_position_finish - travel_position_start) * progress + travel_position_start as Vector;

            target.handle.SetAbsOrigin(travel_position);
        });

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

function starfall_drop_star_on_unit(main_player: Main_Player, caster: Battle_Unit, target: Battle_Unit, change: Health_Change) {
    const fx = fx_by_unit("particles/units/heroes/hero_mirana/mirana_starfall_attack.vpcf", target);

    wait(0.5);

    unit_emit_sound(caster, "Ability.StarfallImpact");
    change_health(main_player, caster, target, change);

    fx.destroy_and_release(false);
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

function get_ranged_attack_spec(unit: Battle_Unit): Ranged_Attack_Spec | undefined {
    switch (unit.supertype) {
        case Unit_Supertype.hero: {
            switch (unit.type) {
                case Hero_Type.sniper: return {
                    particle_path: "particles/units/heroes/hero_sniper/sniper_base_attack.vpcf",
                    projectile_speed: 1600,
                    attack_point: 0.1,
                    shake_on_attack: Shake.weak
                };

                case Hero_Type.luna: return {
                    particle_path: "particles/units/heroes/hero_luna/luna_moon_glaive.vpcf",
                    projectile_speed: 900,
                    attack_point: 0.4
                };

                case Hero_Type.skywrath_mage: return {
                    particle_path: "particles/units/heroes/hero_skywrath_mage/skywrath_mage_base_attack.vpcf",
                    projectile_speed: 800,
                    attack_point: 0.5
                };

                case Hero_Type.lion: return {
                    particle_path: "particles/units/heroes/hero_lion/lion_base_attack.vpcf",
                    projectile_speed: 1200,
                    attack_point: 0.4
                };

                case Hero_Type.mirana: return {
                    particle_path: "particles/units/heroes/hero_mirana/mirana_base_attack.vpcf",
                    projectile_speed: 1400,
                    attack_point: 0.3
                };

                case Hero_Type.vengeful_spirit: return {
                    particle_path: "particles/units/heroes/hero_vengeful/vengeful_base_attack.vpcf",
                    projectile_speed: 1400,
                    attack_point: 0.3
                }
            }

            break;
        }

        case Unit_Supertype.creep: {
            return;
        }
    }
}

function try_play_random_sound_for_hero(unit: Battle_Unit, supplier: (sounds: Hero_Sounds) => string[], target: Battle_Unit = unit) {
    if (unit.supertype != Unit_Supertype.hero) {
        return;
    }

    // TODO use pseudo random
    const sounds = supplier(hero_sounds_by_hero_type(unit.type));
    const random_sound = sounds[RandomInt(0, sounds.length - 1)];

    unit_emit_sound(target, random_sound);
}

function try_play_sound_for_hero(unit: Battle_Unit, supplier: (type: Hero_Type) => string | undefined, target: Battle_Unit = unit) {
    if (unit.supertype != Unit_Supertype.hero) {
        return;
    }

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

    function get_unit_pre_attack_sound(type: Hero_Type): string | undefined {
        switch (type) {
            case Hero_Type.pudge: return "Hero_Pudge.PreAttack";
            case Hero_Type.ursa: return "Hero_Ursa.PreAttack";
            case Hero_Type.tidehunter: return "hero_tidehunter.PreAttack";
            case Hero_Type.skywrath_mage: return "Hero_SkywrathMage.PreAttack";
            case Hero_Type.dragon_knight: return "Hero_DragonKnight.PreAttack";
            case Hero_Type.dark_seer: return "Hero_DarkSeer.PreAttack";
        }
    }

    function get_unit_attack_sound(type: Hero_Type): string {
        switch (type) {
            case Hero_Type.pudge: return "Hero_Pudge.Attack";
            case Hero_Type.ursa: return "Hero_Ursa.Attack";
            case Hero_Type.sniper: return "Hero_Sniper.attack";
            case Hero_Type.luna: return "Hero_Luna.Attack";
            case Hero_Type.tidehunter: return "hero_tidehunter.Attack";
            case Hero_Type.skywrath_mage: return "Hero_SkywrathMage.Attack";
            case Hero_Type.dragon_knight: return "Hero_DragonKnight.Attack";
            case Hero_Type.lion: return "Hero_Lion.Attack";
            case Hero_Type.mirana: return "Hero_Mirana.Attack";
            case Hero_Type.vengeful_spirit: return "Hero_VengefulSpirit.Attack";
            case Hero_Type.dark_seer: return "Hero_DarkSeer.Attack";
        }
    }

    function get_unit_ranged_impact_sound(type: Hero_Type): string | undefined {
        switch (type) {
            case Hero_Type.sniper: return "Hero_Sniper.ProjectileImpact";
            case Hero_Type.luna: return "Hero_Luna.ProjectileImpact";
            case Hero_Type.skywrath_mage: return "Hero_SkywrathMage.ProjectileImpact";
            case Hero_Type.lion: return "Hero_Lion.ProjectileImpact";
            case Hero_Type.mirana: return "Hero_Mirana.ProjectileImpact";
            case Hero_Type.vengeful_spirit: return "Hero_VengefulSpirit.ProjectileImpact";
        }
    }

    const ranged_attack_spec = get_ranged_attack_spec(unit);

    function is_attack_hit(cast: Basic_Attack_Hit | Line_Ability_Miss): cast is Basic_Attack_Hit {
        return cast.hit as any as number == 1; // Panorama passes booleans this way, meh
    }

    if (ranged_attack_spec) {
        try_play_sound_for_hero(unit, get_unit_pre_attack_sound);
        unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK, ranged_attack_spec.attack_point);
        try_play_sound_for_hero(unit, get_unit_attack_sound);

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
            try_play_sound_for_hero(unit, get_unit_ranged_impact_sound, target_unit);

            if (ranged_attack_spec.shake_on_impact) {
                shake_screen(target_unit.position, ranged_attack_spec.shake_on_impact);
            }
        } else {
            tracking_projectile_to_point(unit, cast.result.final_point, ranged_attack_spec.particle_path, ranged_attack_spec.projectile_speed);
        }
    } else {
        try_play_sound_for_hero(unit, get_unit_pre_attack_sound);
        unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK);

        if (is_attack_hit(cast.result)) {
            const target_unit = find_unit_by_id(cast.result.target_unit_id);

            if (target_unit) {
                change_health(main_player, unit, target_unit, cast.result.damage_dealt);
            }

            shake_screen(target, Shake.weak);
            try_play_sound_for_hero(unit, get_unit_attack_sound);
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
    const distance = ((world_to - world_from) as Vector).Length2D();
    const direction = ((world_to - world_from) as Vector).Normalized();

    turn_unit_towards_target(unit, cast.target_position);

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
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.3);
            unit_emit_sound(unit, "Hero_Lion.Impale");

            // TODO :VoiceOver

            const targets = filter_and_map_existing_units(from_client_array(cast.targets));
            const forks: Fork[] = [];

            // @HardcodedConstant
            const distance = 3;
            const fx = "particles/units/heroes/hero_lion/lion_spell_impale.vpcf";
            const from = unit.position;
            const to = cast.target_position;

            linear_projectile_with_targets(from, to, 1500, distance, fx, targets, target => target.unit.handle.GetAbsOrigin(), target => {
                change_health(main_player, unit, target.unit, target.change);
                apply_modifier(main_player, target.unit, target.modifier);

                forks.push(fork(() => {
                    unit_emit_sound(target.unit, "Hero_Lion.ImpaleHitTarget");
                    toss_target_up(target.unit);
                    unit_emit_sound(target.unit, "Hero_Lion.ImpaleTargetLand");
                }));
            });

            wait_for_all_forks(forks);

            break;
        }

        case Ability_Id.mirana_arrow: {
            function is_arrow_hit(cast: Mirana_Arrow_Hit | Line_Ability_Miss): cast is Mirana_Arrow_Hit {
                return cast.hit as any as number == 1; // Panorama passes booleans this way, meh
            }

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_2);

            let travel_target: XY;

            if (is_arrow_hit(cast.result)) {
                const target = find_unit_by_id(cast.result.stun.target_unit_id);

                if (!target) {
                    log_chat_debug_message("Mirana arrow target not found");
                    return;
                }

                travel_target = target.position;
            } else {
                travel_target = cast.result.final_point;
            }

            const world_to = battle_position_to_world_position_center(travel_target);
            const distance = (world_to - world_from as Vector).Length2D();

            const travel_speed = 1300;
            const time_to_travel = distance / travel_speed;
            const particle = fx("particles/units/heroes/hero_mirana/mirana_spell_arrow.vpcf")
                .to_location(0, unit.position)
                .with_vector_value(1, direction * travel_speed as Vector)
                .with_forward_vector(0, unit.handle.GetForwardVector());

            const loop_sound = "Hero_Mirana.Arrow";

            unit_emit_sound(unit, "Hero_Mirana.ArrowCast");
            unit_emit_sound(unit, loop_sound);

            wait(time_to_travel);

            if (is_arrow_hit(cast.result)) {
                const target = find_unit_by_id(cast.result.stun.target_unit_id);

                if (target) {
                    apply_modifier(main_player, target, cast.result.stun.modifier);
                }

                unit_emit_sound(unit, "Hero_Mirana.ArrowImpact");
            }

            // TODO :VoiceOver hit/miss voicelines

            unit_stop_sound(unit, loop_sound);

            particle.destroy_and_release(false);

            break;
        }

        case Ability_Id.mirana_leap: {
            const travel_speed = 2400;
            const time_to_travel = distance / travel_speed;
            const peak_height = Math.min(250, distance / 5);
            const animation_length = 0.5;
            const animation_speed = animation_length / time_to_travel;

            print(peak_height);

            function parabolic(x: number) {
                const nx = (x * 2 - 1);
                return 1 - nx * nx;
            }

            unit_emit_sound(unit, "Ability.Leap");

            unit.handle.StartGestureWithPlaybackRate(GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_3, animation_speed);

            do_each_frame_for(time_to_travel, progress => {
                const position_now = world_from + (direction * distance * progress) as Vector;
                position_now.z = world_from.z + parabolic(progress) * peak_height;

                unit.handle.SetAbsOrigin(position_now);
            });

            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_3);
            unit.handle.StartGesture(GameActivity_t.ACT_MIRANA_LEAP_END);
            unit.handle.SetAbsOrigin(world_to);

            unit.position = cast.target_position;

            fx_by_unit("particles/dev/library/base_dust_hit.vpcf", unit).release();
            unit_emit_sound(unit, "eul_scepter_drop");

            wait(0.5);

            unit.handle.FadeGesture(GameActivity_t.ACT_MIRANA_LEAP_END);

            break;
        }

        case Ability_Id.venge_wave_of_terror: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_2);
            unit_emit_sound(unit, "Hero_VengefulSpirit.WaveOfTerror");

            // @HardcodedConstant
            const distance = 5;
            const fx = "particles/units/heroes/hero_vengeful/vengeful_wave_of_terror.vpcf";
            const from = unit.position;
            const to = cast.target_position;
            const targets = filter_and_map_existing_units(from_client_array(cast.targets));

            linear_projectile_with_targets(from, to, 2000, distance, fx, targets, target => target.unit.handle.GetAbsOrigin(), target => {
                change_health(main_player, unit, target.unit, target.change);
                apply_modifier(main_player, target.unit, target.modifier);
            });

            break;
        }

        case Ability_Id.dark_seer_vacuum: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1);
            unit_emit_sound(unit, "Hero_Dark_Seer.Vacuum");

            // @HardcodedConstant
            const radius = 2;

            fx("particles/units/heroes/hero_dark_seer/dark_seer_vacuum.vpcf")
                .with_vector_value(0, world_to)
                .with_point_value(1, (radius + 0.5) * battle_cell_size)
                .release();

            const targets = filter_and_map_existing_units(from_client_array(cast.targets));

            wait_for_all_forks(targets.map(target => fork(() => {
                const world_from = target.unit.handle.GetAbsOrigin();
                const world_to_actual = battle_position_to_world_position_center(target.move_to);
                const distance_to_cast_point = (world_to - world_from as Vector).Length2D();
                const distance_to_actual_position = (world_to - world_to_actual as Vector).Length2D();

                if (distance_to_cast_point != 0) {
                    const travel_speed_to_cast_point = 1000;

                    do_each_frame_for(distance_to_cast_point / travel_speed_to_cast_point, progress => {
                        target.unit.handle.SetAbsOrigin(world_from + (world_to - world_from) * progress as Vector);
                    });
                }

                if (distance_to_actual_position != 0) {
                    const travel_speed_to_actual_position = 800;

                    do_each_frame_for(distance_to_actual_position / travel_speed_to_actual_position, progress => {
                        target.unit.handle.SetAbsOrigin(world_to + (world_to_actual - world_to) * progress as Vector);
                    });
                }

                target.unit.position = target.move_to;
                target.unit.handle.SetAbsOrigin(world_to_actual);
            })));

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

    function follow(path: string) {
        return simple(target => fx_follow_unit(path, target));
    }

    switch (id) {
        case Modifier_Id.tide_gush: return complex("Modifier_Tide_Gush");
        case Modifier_Id.skywrath_ancient_seal: return simple(target =>
            fx("particles/units/heroes/hero_skywrath_mage/skywrath_mage_ancient_seal_debuff.vpcf")
                .follow_unit_overhead(0, target)
                .follow_unit_origin(1, target)
        );
        case Modifier_Id.skywrath_concussive_shot: return follow("particles/units/heroes/hero_skywrath_mage/skywrath_mage_concussive_shot_slow_debuff.vpcf");
        case Modifier_Id.dragon_knight_elder_dragon_form: return complex("Modifier_Dragon_Knight_Elder_Dragon");
        case Modifier_Id.lion_hex: return complex("Modifier_Lion_Hex");
        case Modifier_Id.venge_wave_of_terror: return follow("particles/units/heroes/hero_vengeful/vengeful_wave_of_terror_recipient.vpcf");
        case Modifier_Id.dark_seer_ion_shell: return simple(
            target => fx("particles/units/heroes/hero_dark_seer/dark_seer_ion_shell.vpcf")
                .to_unit_attach_point(0, target, "attach_hitloc")
                .with_point_value(1, 50, 50, 50)
        );
        case Modifier_Id.dark_seer_surge: return follow("particles/units/heroes/hero_dark_seer/dark_seer_surge.vpcf");
        case Modifier_Id.rune_double_damage: return follow("particles/generic_gameplay/rune_doubledamage_owner.vpcf");
        case Modifier_Id.rune_haste: return follow("particles/generic_gameplay/rune_haste_owner.vpcf");
        case Modifier_Id.item_satanic: return follow("particles/items2_fx/satanic_buff.vpcf");
        case Modifier_Id.item_mask_of_madness: return follow("particles/items2_fx/mask_of_madness.vpcf");
        case Modifier_Id.item_armlet: return follow("particles/items_fx/armlet.vpcf");
        case Modifier_Id.spell_euls_scepter: return complex("Modifier_Euls_Scepter");
        case Modifier_Id.spell_mekansm: return follow("particles/items_fx/buckler.vpcf");
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

function unit_stop_sound(unit: Battle_Unit, sound: string) {
    unit.handle.StopSound(sound);
}

function battle_emit_sound(sound: string) {
    EmitSoundOnLocationWithCaster(battle.camera_dummy.GetAbsOrigin(), sound, battle.camera_dummy);
}

function play_unit_target_ability_delta(main_player: Main_Player, caster: Battle_Unit, cast: Delta_Unit_Target_Ability, target: Battle_Unit) {
    turn_unit_towards_target(caster, target.position);
    highlight_grid_for_targeted_ability(caster, cast.ability_id, target.position);

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

                    change_health(main_player, caster, target, { new_value: target.health + delta, value_delta: delta });

                    remaining = Math.max(0, remaining - change_per_loop);

                    wait(0.6);
                }
            }

            caster.handle.StartGesture(GameActivity_t.ACT_DOTA_CHANNEL_ABILITY_4);

            wait_for_all_forks([
                fork(() => loop_health_change(target, cast.damage_dealt)),
                fork(() => loop_health_change(caster, cast.health_restored))
            ]);

            caster.handle.FadeGesture(GameActivity_t.ACT_DOTA_CHANNEL_ABILITY_4);

            break;
        }

        case Ability_Id.tide_gush: {
            const fx = "particles/units/heroes/hero_tidehunter/tidehunter_gush.vpcf";

            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.2);
            unit_emit_sound(caster, "Ability.GushCast");
            tracking_projectile_to_unit(caster, target, fx, 3000, "attach_attack2");
            unit_emit_sound(caster, "Ability.GushImpact");
            shake_screen(target.position, Shake.medium);
            apply_modifier(main_player, target, cast.modifier);
            change_health(main_player, caster, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.luna_lucent_beam: {
            unit_emit_sound(caster, "Hero_Luna.LucentBeam.Cast");
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.6);

            fx("particles/units/heroes/hero_luna/luna_lucent_beam.vpcf")
                .to_unit_origin(0, target)
                .to_unit_origin(1, target)
                .to_unit_origin(5, target)
                .to_unit_origin(6, caster)
                .release();

            shake_screen(target.position, Shake.medium);
            unit_emit_sound(caster, "Hero_Luna.LucentBeam.Target");
            change_health(main_player, caster, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.skywrath_ancient_seal: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_3, 0.4);
            unit_emit_sound(target, "Hero_SkywrathMage.AncientSeal.Target");
            apply_modifier(main_player, target, cast.modifier);

            break;
        }

        case Ability_Id.dragon_knight_dragon_tail: {
            fx("particles/units/heroes/hero_dragon_knight/dragon_knight_dragon_tail.vpcf")
                .to_unit_attach_point(2, caster, "attach_attack2")
                .with_vector_value(3, caster.handle.GetForwardVector())
                .to_unit_attach_point(4, target, "attach_hitloc")
                .release();

            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_2, 0.4);
            unit_emit_sound(target, "Hero_DragonKnight.DragonTail.Target");
            apply_modifier(main_player, target, cast.modifier);
            change_health(main_player, caster, target, cast.damage_dealt);
            shake_screen(target.position, Shake.medium);

            break;
        }

        case Ability_Id.lion_hex: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_2, 0.4);
            unit_emit_sound(target, "Hero_Lion.Voodoo");
            unit_emit_sound(target, "Hero_Lion.Hex.Target");
            apply_modifier(main_player, target, cast.modifier);
            shake_screen(target.position, Shake.weak);
            fx_by_unit("particles/units/heroes/hero_lion/lion_spell_voodoo.vpcf", target).release();

            break;
        }

        case Ability_Id.lion_finger_of_death: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_4, 0.4);
            unit_emit_sound(caster, "Hero_Lion.FingerOfDeath");

            fx("particles/units/heroes/hero_lion/lion_spell_finger_of_death.vpcf")
                .to_unit_attach_point(0, caster, "attach_attack2")
                .to_unit_attach_point(1, target, "attach_hitloc")
                .to_unit_attach_point(2, target, "attach_hitloc")
                .release();

            wait(0.1);

            unit_emit_sound(target, "Hero_Lion.FingerOfDeathImpact");
            change_health(main_player, caster, target, cast.damage_dealt);
            shake_screen(target.position, Shake.medium);

            break;
        }

        case Ability_Id.venge_magic_missile: {
            const projectile_fx = "particles/units/heroes/hero_vengeful/vengeful_magic_missle.vpcf";

            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.4);
            unit_emit_sound(caster, "Hero_VengefulSpirit.MagicMissile");
            tracking_projectile_to_unit(caster, target, projectile_fx, 1400, "attach_attack2");
            unit_emit_sound(target, "Hero_VengefulSpirit.MagicMissileImpact");
            change_health(main_player, caster, target, cast.damage_dealt);
            apply_modifier(main_player, target, cast.modifier);
            shake_screen(target.position, Shake.medium);

            break;
        }

        case Ability_Id.venge_nether_swap: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_4);
            unit_emit_sound(caster, "Hero_VengefulSpirit.NetherSwap");

            fx("particles/units/heroes/hero_vengeful/vengeful_nether_swap.vpcf")
                .to_unit_origin(0, caster)
                .to_unit_origin(1, target);

            fx("particles/units/heroes/hero_vengeful/vengeful_nether_swap_target.vpcf")
                .to_unit_origin(0, target)
                .to_unit_origin(1, caster);

            const caster_position = caster.position;
            const target_position = target.position;

            const caster_world_position = caster.handle.GetAbsOrigin();
            const target_world_position = target.handle.GetAbsOrigin();

            target.position = caster_position;
            caster.position = target_position;

            target.handle.SetAbsOrigin(caster_world_position);
            caster.handle.SetAbsOrigin(target_world_position);

            caster.handle.StartGesture(GameActivity_t.ACT_DOTA_CHANNEL_END_ABILITY_4);

            wait(0.7);

            caster.handle.FadeGesture(GameActivity_t.ACT_DOTA_CHANNEL_END_ABILITY_4);

            break;
        }

        case Ability_Id.dark_seer_ion_shell: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_2);
            unit_emit_sound(target, "Hero_Dark_Seer.Ion_Shield_Start");
            apply_modifier(main_player, target, cast.modifier);

            break;
        }

        case Ability_Id.dark_seer_surge: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_3);
            unit_emit_sound(caster, "Hero_Dark_Seer.Surge");
            apply_modifier(main_player, target, cast.modifier);

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
                    apply_modifier(main_player, target, effect.modifier);
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

            const beam_targets = filter_and_map_existing_units(from_client_array(cast.targets))
                .filter(target => target.change.value_delta != 0)
                .map(target => ({
                    target: target,
                    beams_remaining: -target.change.value_delta
                }));

            while (beam_targets.length > 0) {
                const random_index = RandomInt(0, beam_targets.length - 1);
                const random_target = beam_targets[random_index];
                const target_unit = random_target.target.unit;

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

        case Ability_Id.mirana_starfall: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.8);
            fx_by_unit("particles/units/heroes/hero_mirana/mirana_starfall_circle.vpcf", unit).release();
            unit_emit_sound(unit, "Ability.Starfall");

            wait_for_all_forks(from_client_array(cast.targets).map(target => fork(() => {
                const target_unit = find_unit_by_id(target.target_unit_id);

                if (target_unit) {
                    starfall_drop_star_on_unit(main_player, unit, target_unit, target.change);
                }
            })));

            break;
        }

        default: unreachable(cast);
    }
}

function play_no_target_spell_delta(main_player: Main_Player, cast: Delta_Use_No_Target_Spell) {
    switch (cast.spell_id) {
        case Spell_Id.mekansm: {
            battle_emit_sound("DOTA_Item.Mekansm.Activate");

            for (const effect of from_client_array(cast.targets)) {
                const target = find_unit_by_id(effect.target_unit_id);

                if (target) {
                    fx_follow_unit("particles/items2_fx/mekanism.vpcf", target).release();
                    unit_emit_sound(target, "DOTA_Item.Mekansm.Target");
                    apply_modifier(main_player, target, effect.modifier);
                    change_health(main_player, target, target, effect.change);
                }
            }

            break;
        }

        default: unreachable(cast.spell_id);
    }
}

function play_unit_target_spell_delta(main_player: Main_Player, caster: Battle_Player, target: Battle_Unit, cast: Delta_Use_Unit_Target_Spell) {
    switch (cast.spell_id) {
        case Spell_Id.buyback: {
            target.dead = false;

            battle_emit_sound("buyback_use");
            change_gold(main_player, caster, cast.gold_change);
            change_health(main_player, target, target, cast.heal);
            apply_modifier(main_player, target, cast.modifier);

            break;
        }

        case Spell_Id.town_portal_scroll: {
            const particle = fx("particles/items2_fx/teleport_start.vpcf")
                .with_vector_value(0, target.handle.GetAbsOrigin())
                .with_point_value(2, 255, 255, 255);

            target.handle.StartGesture(GameActivity_t.ACT_DOTA_TELEPORT);

            unit_emit_sound(target, "Portal.Loop_Disappear");

            wait(3);

            unit_stop_sound(target, "Portal.Loop_Disappear");
            unit_emit_sound(target, "Portal.Hero_Disappear");

            target.handle.FadeGesture(GameActivity_t.ACT_DOTA_TELEPORT);

            change_health(main_player, target, target, cast.heal);
            apply_modifier(main_player, target, cast.modifier);

            particle.destroy_and_release(false);

            break;
        }

        case Spell_Id.euls_scepter: {
            unit_emit_sound(target, "DOTA_Item.Cyclone.Activate");
            apply_modifier(main_player, target, cast.modifier);

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
                const spec = get_ranged_attack_spec(source);

                if (spec) {
                    tracking_projectile_to_unit(original_target, target, spec.particle_path, spec.projectile_speed, "attach_hitloc");
                    unit_emit_sound(target, "Hero_Luna.MoonGlaive.Impact");
                }

                change_health(main_player, source, target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.mirana_starfall: {
            const source = find_unit_by_id(effect.source_unit_id);
            const target = find_unit_by_id(effect.target_unit_id);

            if (source && target) {
                wait(0.25);
                starfall_drop_star_on_unit(main_player, source, target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.dark_seer_ion_shell: {
            const source = find_unit_by_id(effect.source_unit_id);
            const targets = filter_and_map_existing_units(from_client_array(effect.targets));

            if (source) {
                for (const target of targets) {
                    change_health(main_player, source, target.unit, target.change);
                    fx("particles/units/heroes/hero_dark_seer/dark_seer_ion_shell_damage.vpcf")
                        .follow_unit_origin(0, source)
                        .to_unit_attach_point(1, target.unit, "attach_hitloc")
                        .release();
                }

                wait(1);
            }

            break;
        }

        default: unreachable(effect);
    }
}

function play_rune_pickup_delta(main_player: Main_Player, unit: Battle_Hero, delta: Delta_Rune_Pick_Up) {
    switch (delta.rune_type) {
        case Rune_Type.bounty: {
            fx("particles/generic_gameplay/rune_bounty_owner.vpcf")
                .follow_unit_origin(0, unit)
                .follow_unit_origin(1, unit)
                .release();

            const player = array_find(battle.players, player => player.id == unit.owner_remote_id);

            if (player) {
                change_gold(main_player, player, delta.gold_gained);
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

function play_item_equip_delta(main_player: Main_Player, hero: Battle_Hero, delta: Delta_Equip_Item) {
    wait(0.3);

    unit_emit_sound(hero, "Item.PickUpShop");
    try_play_random_sound_for_hero(hero, sounds => sounds.purchase);

    switch (delta.item_id) {
        case Item_Id.assault_cuirass: {
            apply_modifier(main_player, hero, delta.modifier);
            break;
        }

        case Item_Id.boots_of_travel: {
            apply_modifier(main_player, hero, delta.modifier);
            break;
        }

        case Item_Id.divine_rapier: {
            apply_modifier(main_player, hero, delta.modifier);
            break;
        }

        case Item_Id.heart_of_tarrasque: {
            apply_modifier(main_player, hero, delta.modifier);
            break;
        }

        case Item_Id.satanic: {
            apply_modifier(main_player, hero, delta.modifier);
            unit_emit_sound(hero, "equip_satanic");
            break;
        }

        case Item_Id.tome_of_knowledge: {
            change_hero_level(main_player, hero, delta.new_level);
            break;
        }

        case Item_Id.refresher_shard: {
            fx("particles/items2_fx/refresher.vpcf").to_unit_attach_point(0, hero, "attach_hitloc").release();
            unit_emit_sound(hero, "equip_refresher");

            break;
        }

        case Item_Id.mask_of_madness: {
            apply_modifier(main_player, hero, delta.modifier);
            unit_emit_sound(hero, "DOTA_Item.MaskOfMadness.Activate");

            break;
        }

        case Item_Id.armlet: {
            apply_modifier(main_player, hero, delta.modifier);
            unit_emit_sound(hero, "DOTA_Item.Armlet.Activate");

            break;
        }

        default: unreachable(delta);
    }

    wait(1.2);
}

function turn_unit_towards_target(unit: Battle_Unit, towards: XY) {
    const towards_world_position = battle_position_to_world_position_center(towards);
    const desired_forward = ((towards_world_position - unit.handle.GetAbsOrigin()) * Vector(1, 1, 0) as Vector).Normalized();

    if (desired_forward.Length2D() == 0) {
        return;
    }

    while (true) {
        unit.handle.FaceTowards(towards_world_position);

        if (desired_forward.Dot(unit.handle.GetForwardVector()) > 0.95) {
            break;
        }

        wait_one_frame();
    }
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

    const was_hidden = unit.hidden;

    let unit_hidden = false;

    for (const modifier of unit.modifiers) {
        if (modifier.modifier_id == Modifier_Id.returned_to_hand) {
            unit_hidden = true;
        }
    }

    unit.hidden = unit_hidden;
    unit.handle.SetBaseMoveSpeed(Math.max(100, 500 + unit.move_points_bonus * 100));

    if (was_hidden != unit_hidden) {
        if (unit_hidden) {
            unit.handle.AddNoDraw();
        } else {
            unit.handle.RemoveNoDraw();
        }
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

        try_play_random_sound_for_hero(target, sounds => sounds.pain);

        number_particle(-value_delta, 250, 70, 70);
    }

    target.health = Math.max(0, Math.min(target.max_health, change.new_value));

    update_player_state_net_table(main_player);

    if (target.health == 0 && !target.dead) {
        if (source.supertype != Unit_Supertype.creep) {
            // TODO only show this when killing actual enemies
            fx("particles/generic_gameplay/lasthit_coins.vpcf").to_unit_origin(1, target).release();
            fx_follow_unit("particles/generic_gameplay/lasthit_coins_local.vpcf", source)
                .to_unit_origin(1, target)
                .to_unit_attach_point(2, source, "attach_hitloc")
                .release();
        }

        if (source.supertype != Unit_Supertype.creep && target.supertype != Unit_Supertype.creep) {
            if (source.owner_remote_id == target.owner_remote_id) {
                try_play_random_sound_for_hero(source, sounds => sounds.deny);
            }
        }

        try_play_random_sound_for_hero(source, sounds => sounds.kill);

        target.dead = true;
        target.handle.ForceKill(false);
    }
}

function move_unit(main_player: Main_Player, unit: Battle_Unit, path: XY[]) {
    for (const cell of path) {
        const world_position = battle_position_to_world_position_center(cell);

        unit.handle.MoveToPosition(world_position);

        wait_until(() => {
            return (unit.handle.GetAbsOrigin() - world_position as Vector).Length2D() < unit.handle.GetBaseMoveSpeed() / 10;
        });

        unit.move_points = unit.move_points - 1;

        update_player_state_net_table(main_player);
    }
}

function change_hero_level(main_player: Main_Player, hero: Battle_Hero, new_level: number) {
    hero.level = new_level;

    unit_emit_sound(hero, "hero_level_up");
    fx_by_unit("particles/generic_hero_status/hero_levelup.vpcf", hero).release();
    try_play_random_sound_for_hero(hero, sounds => sounds.level_up);

    update_player_state_net_table(main_player);
}

function change_gold(main_player: Main_Player, player: Battle_Player, change: number) {
    if (player.id == main_player.remote_id && battle.has_started) {
        battle_emit_sound("General.Coins");
    }

    player.gold += change;

    update_player_state_net_table(main_player);
}

function on_modifier_removed(unit: Battle_Unit, modifier_id: Modifier_Id) {
    if (modifier_id == Modifier_Id.spell_euls_scepter) {
        const handle = unit.handle;
        const ground = battle_position_to_world_position_center(unit.position);
        const delta_z = handle.GetAbsOrigin().z - ground.z;
        const fall_time = 0.45;

        function f(x: number) {
            return ((1 - Math.sin(x * 6 - 6)/(x * 6 - 6)) + (1 - x * x)) / 2;
        }

        do_each_frame_for(fall_time, progress => {
            handle.SetAbsOrigin(Vector(ground.x, ground.y, f(progress) * delta_z + ground.z));
        });

        handle.SetAbsOrigin(ground);

        unit_emit_sound(unit, "eul_scepter_drop");
        fx_by_unit("particles/dev/library/base_dust_hit.vpcf", unit).release();
    }

    if (modifier_id == Modifier_Id.dark_seer_ion_shell) {
        unit_emit_sound(unit, "Hero_Dark_Seer.Ion_Shield_end");
    }
}

function remove_modifier(main_player: Main_Player, unit: Battle_Unit, modifier: Modifier_Data, array_index: number) {
    const modifier_visuals = modifier_id_to_visuals(modifier.modifier_id);

    if (modifier_visuals) {
        print(`Remove modifier ${modifier.modifier_handle_id} ${modifier_visuals} from ${unit.handle.GetName()}`);

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

    on_modifier_removed(unit, modifier.modifier_id);

    unit.modifiers.splice(array_index, 1);

    apply_modifier_changes(main_player, unit, modifier.changes, true);
}

function add_activity_translation(target: Battle_Unit, translation: Activity_Translation, duration: number) {
    const parameters: Modifier_Activity_Translation_Params = {
        translation: translation,
        duration: duration
    };

    target.handle.AddNewModifier(target.handle, undefined, "Modifier_Activity_Translation", parameters);
}

function play_delta(main_player: Main_Player, delta: Delta, head: number) {
    switch (delta.type) {
        case Delta_Type.hero_spawn: {
            const owner = array_find(battle.participants, player => player.id == delta.owner_id);
            if (!owner) break;

            fx("particles/hero_spawn.vpcf")
                .to_location(0, delta.at_position)
                .release();

            wait(0.25);

            shake_screen(delta.at_position, Shake.medium);

            const facing = { x: owner.deployment_zone.face_x, y: owner.deployment_zone.face_y };
            const unit = spawn_hero_for_battle(delta.hero_type, delta.unit_id, delta.owner_id, delta.at_position, facing);

            if (delta.hero_type == Hero_Type.mirana) {
                add_activity_translation(unit, Activity_Translation.ti8, 1.0);
            }

            unit.handle.ForcePlayActivityOnce(GameActivity_t.ACT_DOTA_SPAWN);

            battle.units.push(unit);

            if (battle.has_started) {
                try_play_random_sound_for_hero(unit, sounds => sounds.spawn);
            }

            unit_emit_sound(unit, "hero_spawn");

            unit.handle.AddNewModifier(unit.handle, undefined, "Modifier_Damage_Effect", { duration: 0.2 });

            fx_by_unit("particles/dev/library/base_dust_hit.vpcf", unit).release();

            update_player_state_net_table(main_player);

            if (battle.has_started) {
                wait(1.5);
            } else {
                wait(0.25);
            }

            break;
        }

        case Delta_Type.creep_spawn: {
            const unit = spawn_creep_for_battle(delta.unit_id, creep_definition(), delta.at_position, delta.facing);
            unit.handle.AddNewModifier(unit.handle, undefined, "Modifier_Damage_Effect", { duration: 0.2 });

            battle.units.push(unit);

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
                handle: create_world_handle_for_shop(delta.at, delta.facing),
                position: delta.at
            });

            break;
        }

        case Delta_Type.tree_spawn: {
            battle.trees.push({
                id: delta.tree_id,
                handle: create_world_handle_for_tree(delta.tree_id, delta.at_position),
                position: delta.at_position
            });

            break;
        }

        case Delta_Type.hero_spawn_from_hand: {
            const unit = find_hero_by_id(delta.hero_id);
            if (!unit) break;

            const owner = array_find(battle.participants, player => player.id == unit.owner_remote_id);
            if (!owner) break;

            const facing = { x: owner.deployment_zone.face_x, y: owner.deployment_zone.face_y };

            const in_hand_modifier = array_find_index(unit.modifiers, modifier => modifier.modifier_id == Modifier_Id.returned_to_hand);
            if (in_hand_modifier == -1) break;

            if (!unit.handle.IsAlive()) {
                unit.handle.RespawnUnit();
            }

            const world_at = battle_position_to_world_position_center(delta.at_position);

            if (delta.source_spell_id == Spell_Id.town_portal_scroll) {
                const particle = fx("particles/items2_fx/teleport_end.vpcf")
                    .with_vector_value(0, world_at)
                    .with_vector_value(1, world_at)
                    .with_point_value(2, 255, 255, 255)
                    .to_unit_custom_origin(3, unit)
                    .with_point_value(4, 0.75, 0, 0)
                    .with_vector_value(5, world_at);

                unit_emit_sound(unit, "Portal.Loop_Appear");

                wait(3);

                unit_stop_sound(unit, "Portal.Loop_Appear");
                unit_emit_sound(unit, "Portal.Hero_Appear");

                particle.destroy_and_release(false);
            }

            if (delta.source_spell_id == Spell_Id.buyback) {
                const particle = fx("particles/econ/events/fall_major_2016/teleport_start_fm06_godrays.vpcf")
                    .to_location(0, delta.at_position);

                unit_emit_sound(unit, "buyback_respawn");

                wait(2.5);

                fx_by_unit("particles/items_fx/aegis_respawn.vpcf", unit).release();

                particle.destroy_and_release(false);
            }

            remove_modifier(main_player, unit, unit.modifiers[in_hand_modifier], in_hand_modifier);

            FindClearSpaceForUnit(unit.handle, world_at, true);
            unit.handle.FaceTowards(unit.handle.GetAbsOrigin() + Vector(facing.x, facing.y) * 100 as Vector);

            update_player_state_net_table(main_player);

            const gesture = (() => {
                if (delta.source_spell_id == Spell_Id.town_portal_scroll) return GameActivity_t.ACT_DOTA_TELEPORT_END;
                if (delta.source_spell_id == Spell_Id.buyback) return GameActivity_t.ACT_DOTA_SPAWN;
            })();

            if (gesture != undefined) {
                unit.handle.StartGesture(gesture);
                wait(1.5);
                unit.handle.FadeGesture(gesture);
            }

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
            const unit = find_hero_by_id(delta.unit_id);
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
                change_gold(main_player, player, delta.change);
            }

            break;
        }

        case Delta_Type.purchase_item: {
            const unit = find_hero_by_id(delta.unit_id);

            if (!unit) break;

            const player = array_find(battle.players, player => player.id == unit.owner_remote_id);

            if (!player) break;

            player.gold -= delta.gold_cost;

            break;
        }

        case Delta_Type.equip_item: {
            const hero = find_hero_by_id(delta.unit_id);

            if (hero) {
                play_item_equip_delta(main_player, hero, delta);
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

        case Delta_Type.use_unit_target_spell: {
            const player = array_find(battle.players, player => player.id == delta.player_id);
            const target = find_unit_by_id(delta.target_id);

            if (player && target) {
                play_unit_target_spell_delta(main_player, player, target, delta);
            }

            break;
        }

        case Delta_Type.use_no_target_spell: {
            play_no_target_spell_delta(main_player, delta);

            break;
        }

        case Delta_Type.start_turn: {
            for (const unit of battle.units) {
                unit.move_points = unit.max_move_points + unit.move_points_bonus;
            }

            if (delta.of_player_id == main_player.remote_id) {
                CustomGameEventManager.Send_ServerToAllClients("show_start_turn_ui", {});
            }

            update_player_state_net_table(main_player);
            break;
        }

        case Delta_Type.end_turn: {
            break;
        }

        case Delta_Type.level_change: {
            const hero = find_hero_by_id(delta.unit_id);

            if (hero) {
                change_hero_level(main_player, hero, delta.new_level);
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
                            remove_modifier(main_player, unit, modifier, index);;

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

        case Delta_Type.draw_spell_card: break;
        case Delta_Type.draw_hero_card: break;
        case Delta_Type.use_card: break;
        case Delta_Type.set_ability_charges_remaining: break;

        case Delta_Type.game_start: {
            battle.has_started = true;
            break;
        }

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

function use_cheat(cheat: string) {
    const parts = cheat.split(" ");

    function create_or_destroy<T extends { position: XY, handle: CBaseEntity }>(things: T[], at: XY, supplier: () => T) {
        const at_index = array_find_index(things, thing => thing.position.x == at.x && thing.position.y == at.y);

        if (at_index != -1) {
            things[at_index].handle.RemoveSelf();
            things.splice(at_index, 1);
        } else {
            things.push(supplier());
        }
    }

    switch (parts[0]) {
        case "tree": {
            const at = {
                x: tonumber(parts[1]),
                y: tonumber(parts[2])
            };

            create_or_destroy(battle.trees, at, () => {
                const tree: Tree = {
                    id: 0,
                    handle: create_world_handle_for_tree(RandomInt(0, 420), at),
                    position: at
                };

                return tree;
            });

            break;
        }

        case "rune": {
            const at = {
                x: tonumber(parts[1]),
                y: tonumber(parts[2])
            };

            create_or_destroy(battle.runes, at, () => {
                const rune: Rune = {
                    id: 0,
                    type: Rune_Type.double_damage,
                    handle: create_world_handle_for_rune(Rune_Type.double_damage, at),
                    position: at,
                    highlight_fx: fx(""),
                    rune_fx: fx("")
                };

                return rune;
            });

            break;
        }

        case "shop": {
            const at = {
                x: tonumber(parts[1]),
                y: tonumber(parts[2])
            };

            create_or_destroy(battle.shops, at, () => {
                const shop: Shop = {
                    id: 0,
                    handle: create_world_handle_for_shop(at, { x: 0, y: 1 }),
                    position: at,
                };

                return shop;
            });

            break;
        }

        case "dump": {
            let result = "";

            for (const tree of battle.trees) {
                result += `tree(${tree.position.x}, ${tree.position.y}),\n`;
            }

            for (const shop of battle.shops) {
                result += `shop(${shop.position.x}, ${shop.position.y}, up),\n`;
            }

            for (const rune of battle.runes) {
                result += `rune(${rune.position.x}, ${rune.position.y}),\n`;
            }

            for (const creep of battle.units) {
                if (creep.supertype == Unit_Supertype.creep) {
                    result += `creep(${creep.position.x}, ${creep.position.y}, up),\n`;
                }
            }

            print(result);

            break;
        }
    }
}

function periodically_update_battle() {
    for (const rune of battle.runes) {
        // Double damage rune doesn't spin by itself because Valve
        if (rune.type == Rune_Type.double_damage) {
            const current_angle = ((GameRules.GetGameTime() * -2.0) % (Math.PI * 2));
            rune.handle.SetForwardVector(Vector(Math.cos(current_angle), Math.sin(current_angle)));
        }
    }
}

function clean_battle_world_handles() {
    for (const unit of battle.units) {
        unit.handle.RemoveSelf();
    }

    for (const rune of battle.runes) {
        destroy_rune(rune, true);
    }

    for (const shop of battle.shops) {
        shop.handle.RemoveSelf();
    }

    for (const tree of battle.trees) {
        tree.handle.Kill();
    }

    for (const fx of battle.modifier_tied_fxs) {
        fx.fx.destroy_and_release(true);
    }

    battle.units = [];
    battle.shops = [];
    battle.runes = [];
    battle.trees = [];
    battle.modifier_tied_fxs = [];
}

function reinitialize_battle(world_origin: Vector, camera_entity: CDOTA_BaseNPC) {
    battle = {
        id: -1,
        random_seed: 0,
        deltas: [],
        players: [],
        participants: [],
        delta_paths: {},
        delta_head: 0,
        world_origin: world_origin,
        units: [],
        runes: [],
        shops: [],
        trees: [],
        grid_size: {
            width: 0,
            height: 0
        },
        has_started: false,
        is_over: false,
        camera_dummy: camera_entity,
        modifier_tied_fxs: []
    };
}

function fast_forward_from_snapshot(main_player: Main_Player, snapshot: Battle_Snapshot) {
    print("Fast forwarding from snapshot, new head", snapshot.delta_head);

    clean_battle_world_handles();

    function unit_snapshot_to_dota_unit_name(snapshot: Unit_Snapshot): string {
        switch (snapshot.supertype) {
            case Unit_Supertype.hero: return hero_type_to_dota_unit_name(snapshot.type);
            case Unit_Supertype.creep: return creep_to_dota_unit_name();
        }
    }

    battle.players = snapshot.players.map(player => ({
        id: player.id,
        gold: player.gold
    }));

    battle.units = snapshot.units.map(unit => {
        const stats = unit as Unit_Stats;
        const base: Battle_Unit_Base = assign(stats, {
            id: unit.id,
            dead: unit.health <= 0,
            position: unit.position,
            handle: create_world_handle_for_battle_unit(unit_snapshot_to_dota_unit_name(unit), unit.position, unit.facing),
            modifiers: from_client_array(unit.modifiers).map(modifier => ({
                modifier_id: modifier.modifier_id,
                modifier_handle_id: modifier.modifier_handle_id,
                changes: from_client_array(modifier.changes)
            })),
            hidden: false // We will update it in update_state_visuals
        });

        switch (unit.supertype) {
            case Unit_Supertype.hero: {
                return assign<Battle_Unit_Base, Battle_Hero>(base, {
                    supertype: Unit_Supertype.hero,
                    level: unit.level,
                    type: unit.type,
                    owner_remote_id: unit.owner_id
                });
            }

            case Unit_Supertype.creep: {
                return assign<Battle_Unit_Base, Battle_Creep>(base, {
                    supertype: Unit_Supertype.creep
                });
            }
        }
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
        handle: create_world_handle_for_shop(shop.position, shop.facing),
        position: shop.position
    }));

    battle.trees = snapshot.trees.map(tree => ({
        id: tree.id,
        handle: create_world_handle_for_tree(tree.id, tree.position),
        position: tree.position
    }));

    battle.delta_head = snapshot.delta_head;

    // Otherwise the animations won't apply
    
    wait_one_frame();
    wait_one_frame();

    for (const unit of battle.units) {
        update_state_visuals(unit);

        for (const modifier of unit.modifiers) {
            try_apply_modifier_visuals(unit, modifier.modifier_id);
        }
    }

    update_player_state_net_table(main_player);
}