declare const enum Player_State {
    on_global_map = 0,
    in_battle = 1,
    not_logged_in = 2
}

declare const enum Delta_Type {
    health_change = 0,
    unit_move = 2,
    unit_spawn = 3,
    start_turn = 4,
    end_turn = 5,
    use_ground_target_ability = 7,
    use_unit_target_ability = 8,
    use_no_target_ability = 9,
    level_change = 10,
    modifier_removed = 12,
    set_ability_charges_remaining = 14,
    ability_effect_applied = 15,
    draw_card = 16,
    use_card = 17,
    rune_spawn = 18,
    rune_pick_up = 19,
    game_over = 20
}

declare const enum Action_Type {
    move = 2,
    end_turn = 3,
    ground_target_ability = 4,
    unit_target_ability = 5,
    use_no_target_ability = 6,
    use_hero_card = 7,
    pick_up_rune = 8
}

declare const enum Unit_Type {
    ursa = 0,
    sniper = 1,
    pudge = 2,
    tidehunter = 3,
    luna = 4,
    skywrath_mage = 5,
    dragon_knight = 6,
    lion = 7
}

declare const enum Modifier_Field {
    health_bonus = 1,
    attack_bonus = 2,
    armor_bonus = 3,
    move_points_bonus = 4,
    state_silenced_counter = 5,
    state_stunned_counter = 6,
    state_disarmed_counter = 7
}

declare const enum Rune_Type {
    double_damage = 0,
    regeneration = 1,
    bounty = 2,
    haste = 3
}

declare const enum Ability_Targeting_Type {
    line = 0,
    unit_in_manhattan_distance = 2,
    rectangular_area_around_caster = 3
}

declare const enum Ability_Target_Selector_Type {
    single_target = 0,
    rectangle = 1,
    line = 2,
    t_shape = 3
}

declare const enum Ability_Type {
    passive = 0,
    no_target = 1,
    target_ground = 2,
    target_unit = 3
}

declare const enum Card_Type {
    unknown = 0,
    hero = 1,
    spell = 2
}

declare const enum Modifier_Change_Type {
    field_change = 0,
    ability_swap = 1
}

type Unit_Stats = {
    armor: number
    health: number
    max_health: number
    attack_damage: number
    level: number
    move_points: number
    max_move_points: number
    attack_bonus: number
    state_stunned_counter: number
    state_silenced_counter: number
    state_disarmed_counter: number
}

type Unit_Definition = {
    health: number
    attack_damage: number
    move_points: number
    attack: Ability_Definition_Active
    abilities: Ability_Definition[]
    ability_bench: Ability_Definition[]
}

type Ability_Targeting_Line = {
    type: Ability_Targeting_Type.line
    line_length: number
    selector: Ability_Target_Selector
}

type Ability_Targeting_Target_In_Manhattan_Distance = {
    type: Ability_Targeting_Type.unit_in_manhattan_distance
    distance: number
    selector: Ability_Target_Selector
}

type Ability_Targeting_Rectangular_Area_Around_Caster = {
    type: Ability_Targeting_Type.rectangular_area_around_caster
    area_radius: number
    selector: Ability_Target_Selector
}

type Ability_Target_Selector_Single_Target = {
    type: Ability_Target_Selector_Type.single_target
}

type Ability_Target_Selector_Rectangle = {
    type: Ability_Target_Selector_Type.rectangle
    area_radius: number
}

type Ability_Target_Selector_Line = {
    type: Ability_Target_Selector_Type.line
    length: number
}

type Ability_Target_Selector_T_Shape = {
    type: Ability_Target_Selector_Type.t_shape
    stem_length: number
    arm_length: number
}

type Ability_Target_Selector =
    Ability_Target_Selector_Single_Target |
    Ability_Target_Selector_Rectangle |
    Ability_Target_Selector_Line |
    Ability_Target_Selector_T_Shape

type Ability_Targeting =
    Ability_Targeting_Line |
    Ability_Targeting_Target_In_Manhattan_Distance |
    Ability_Targeting_Rectangular_Area_Around_Caster

type Action_Move = {
    type: Action_Type.move
    unit_id: number
    to: {
        x: number
        y: number
    }
}

type Action_End_Turn = {
    type: Action_Type.end_turn
}

type Action_Ground_Target_Ability = {
    type: Action_Type.ground_target_ability
    ability_id: Ability_Id
    unit_id: number
    to: {
        x: number
        y: number
    }
}

type Action_Unit_Target_Ability = {
    type: Action_Type.unit_target_ability
    ability_id: Ability_Id
    unit_id: number
    target_id: number
}

type Action_No_Target_Ability = {
    type: Action_Type.use_no_target_ability
    ability_id: Ability_Id
    unit_id: number
}

type Action_Use_Hero_Card = {
    type: Action_Type.use_hero_card
    card_id: number
    at: {
        x: number
        y: number
    }
}

type Action_Pick_Up_Rune = {
    type: Action_Type.pick_up_rune
    unit_id: number
    rune_id: number
}

type Turn_Action =
    Action_Move |
    Action_Ground_Target_Ability |
    Action_Unit_Target_Ability |
    Action_No_Target_Ability |
    Action_Use_Hero_Card |
    Action_Pick_Up_Rune |
    Action_End_Turn

type Card_Unknown = {
    type: Card_Type.unknown
    id: number
}

type Card_Hero = {
    type: Card_Type.hero
    unit_type: Unit_Type
    id: number
}

type Card_Spell = {
    type: Card_Type.spell
    id: number
}

type Card = Card_Unknown | Card_Hero | Card_Spell

type Deployment_Zone = {
    min_x: number
    min_y: number
    max_x: number
    max_y: number
    face_x: number
    face_y: number
}

type Battle_Participant_Info = {
    id: number
    name: string
    deployment_zone: Deployment_Zone
}

type Battle_Player = {
    id: number
    name: string
    hand: Card[]
    gold: number
    has_used_a_card_this_turn: boolean
    deployment_zone: Deployment_Zone
}

type Delta_Health_Change = {
    type: Delta_Type.health_change
    source_unit_id: number
    target_unit_id: number
    new_value: number
    value_delta: number
}

type Delta_Move = {
    type: Delta_Type.unit_move
    unit_id: number
    move_cost: number
    to_position: {
        x: number
        y: number
    }
}

type Delta_Spawn = {
    type: Delta_Type.unit_spawn
    unit_type: Unit_Type
    unit_id: number
    owner_id: number
    at_position: {
        x: number
        y: number
    }
}

type Delta_Ground_Target_Ability_Base = {
    type: Delta_Type.use_ground_target_ability
    unit_id: number
    target_position: {
        x: number
        y: number
    }
}

type Delta_Unit_Target_Ability_Base = {
    type: Delta_Type.use_unit_target_ability
    unit_id: number
    target_unit_id: number
}

type Delta_Use_No_Target_Ability_Base = {
    type: Delta_Type.use_no_target_ability
    unit_id: number
}

type Delta_Start_Turn = {
    type: Delta_Type.start_turn
}

type Delta_End_Turn = {
    type: Delta_Type.end_turn
}

type Delta_Level_Change = {
    type: Delta_Type.level_change
    unit_id: number
    new_level: number
}

type Delta_Modifier_Removed = {
    type: Delta_Type.modifier_removed
    modifier_handle_id: number
}

type Delta_Set_Ability_Charges_Remaining = {
    type: Delta_Type.set_ability_charges_remaining
    unit_id: number
    ability_id: Ability_Id
    charges_remaining: number
}

type Delta_Ability_Effect_Applied<T extends Ability_Effect> = {
    type: Delta_Type.ability_effect_applied
    effect: T
}

type Delta_Draw_Card = {
    type: Delta_Type.draw_card
    player_id: number
    card: Card
}

type Delta_Use_Card = {
    type: Delta_Type.use_card
    player_id: number
    card_id: number
}

type Delta_Rune_Spawn = {
    type: Delta_Type.rune_spawn
    rune_type: Rune_Type
    rune_id: number,
    at: {
        x: number
        y: number
    }
}

type Delta_Rune_Pick_Up_Base = {
    type: Delta_Type.rune_pick_up
    unit_id: number
    rune_id: number
}

type Delta_Regeneration_Rune_Pick_Up = Delta_Rune_Pick_Up_Base & {
    rune_type: Rune_Type.regeneration
    heal: Health_Change
}

type Delta_Double_Damage_Rune_Pick_Up = Delta_Rune_Pick_Up_Base & {
    rune_type: Rune_Type.double_damage
    modifier: Modifier_Application
}

type Delta_Haste_Rune_Pick_Up = Delta_Rune_Pick_Up_Base & {
    rune_type: Rune_Type.haste
    modifier: Modifier_Application
}

type Delta_Bounty_Rune_Pick_Up = Delta_Rune_Pick_Up_Base & {
    rune_type: Rune_Type.bounty
    gold_gained: number
}

type Delta_Rune_Pick_Up =
    Delta_Regeneration_Rune_Pick_Up |
    Delta_Double_Damage_Rune_Pick_Up |
    Delta_Haste_Rune_Pick_Up |
    Delta_Bounty_Rune_Pick_Up

type Delta_Game_Over = {
    type: Delta_Type.game_over
    winner_player_id: number
}

type Delta =
    Delta_Health_Change |
    Delta_Move |
    Delta_Spawn |
    Delta_Ground_Target_Ability |
    Delta_Unit_Target_Ability |
    Delta_Use_No_Target_Ability |
    Delta_Level_Change |
    Delta_Modifier_Removed |
    Delta_Set_Ability_Charges_Remaining |
    Delta_Ability_Effect_Applied<Ability_Effect> |
    Delta_Rune_Pick_Up |
    Delta_Draw_Card |
    Delta_Use_Card |
    Delta_Rune_Spawn |
    Delta_Start_Turn |
    Delta_End_Turn |
    Delta_Game_Over

type Modifier_Change_Field_Change = {
    type: Modifier_Change_Type.field_change
    field: Modifier_Field
    delta: number
}

type Modifier_Change_Ability_Swap = {
    type: Modifier_Change_Type.ability_swap
    original_ability: Ability_Id
    swap_to: Ability_Id
}

type Modifier_Change = Modifier_Change_Field_Change | Modifier_Change_Ability_Swap

type Modifier_Application = {
    modifier_handle_id: number
    modifier_id: Modifier_Id
    changes: Modifier_Change[]
    duration?: number
}

type Movement_History_Entry = {
    order_x: number
    order_y: number
    location_x: number
    location_y: number
}

type Query_Deltas_Request = {
    access_token: string
    battle_id: number
    since_delta: number
}

type Query_Deltas_Response = {
    deltas: Delta[]
}

type Take_Battle_Action_Request = {
    access_token: string
    action: Turn_Action
}

type Take_Battle_Action_Response = {
    previous_head: number
    deltas: Delta[]
}

type Submit_Player_Movement_Request = {
    dedicated_server_key: string
    access_token: string
    current_location: {
        x: number
        y: number
    }
    movement_history: Movement_History_Entry[]
}

type Submit_Player_Movement_Response = {}

type Authorize_Steam_User_Request = {
    steam_id: string
    steam_user_name: string
    dedicated_server_key: string
}

type Authorize_Steam_User_Response = {
    id: number
    token: string
}

type Get_Player_State_Request = {
    access_token: string
}

type Query_Players_Movement_Request = {
    dedicated_server_key: string
    access_token: string
}

type Player_Movement_Data = {
    id: number
    player_name: string // TODO might want to move id:name connection into a separate request
    movement_history: Movement_History_Entry[]
    current_location: {
        x: number
        y: number
    }
}

type Query_Players_Movement_Response = Player_Movement_Data[]

type Get_Player_Characters_Request = {
    access_token: string
}

type Create_New_Character_Response = Character_Data
type Get_Player_Characters_Response = Character_Data[]

type Character_Data = {
    id: number
}

type Create_New_Character_Request = {
    access_token: string
}

type Login_With_Character_Request = {
    access_token: string
    character_id: number
}

type Login_With_Character_Response = {}

type Player_State_Not_Logged_In_Data = {
    state: Player_State.not_logged_in
}

type Player_State_On_Global_Map_Data = {
    state: Player_State.on_global_map
    player_position: {
        x: number
        y: number
    }
}

type Player_State_In_Battle_Data = {
    state: Player_State.in_battle
    battle_id: number
    grid_size: {
        width: number
        height: number
    }
    participants: Battle_Participant_Info[]
}

type Player_State_Data = Player_State_Not_Logged_In_Data | Player_State_On_Global_Map_Data | Player_State_In_Battle_Data

type Attack_Player_Request = {
    dedicated_server_key: string
    access_token: string
    target_player_id: number
}

type Attack_Player_Response = Player_State_Data

type Submit_Chat_Message_Request = {
    access_token: string
    message: string
}

type Submit_Chat_Message_Response = Pull_Pending_Chat_Messages_Response

type Pull_Pending_Chat_Messages_Request = {
    access_token: string
}

type Pull_Pending_Chat_Messages_Response = {
    messages: Chat_Message[]
}

type Chat_Message = {
    from_player_id: number
    from_player_name: string
    message: string
}

type Battle_Cheat_Command_Request = {
    access_token: string
    cheat: string
    selected_unit_id: number
}

declare function copy<T>(arg: T): T;
declare function enum_to_string(enum_member: any): string;
declare function enum_values<T>(): T[];