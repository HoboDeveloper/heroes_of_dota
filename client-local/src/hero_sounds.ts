type Hero_Sounds = {
    file: string
    spawn: string[]
    move: string[]
    kill: string[]
    deny: string[]
    pain: string[]
    attack: string[]
    not_yet: string[]
    level_up: string[]
    purchase: string[]
}

function hero_sounds_by_hero_type(hero_type: Hero_Type): Hero_Sounds {
    // ^".*

    function range(prefix: string, last_num: number): string[] {
        const sounds: string[] = [];

        for (let index = 1; index <= last_num; index++) {
            sounds.push(`${prefix}_${index < 10 ? "0" + index : index}`);
        }

        return sounds;
    }

    switch (hero_type) {
        // @ts-ignore
        case Hero_Type.ursa: return {

        };

        // @ts-ignore
        case Hero_Type.sniper: return {

        };

        case Hero_Type.pudge: return {
            file: "soundevents/voscripts/game_sounds_vo_pudge.vsndevts",
            spawn: range("pudge_pud_spawn", 11),
            move: range("pudge_pud_move", 17),
            attack: range("pudge_pud_attack", 16),
            level_up: range("pudge_pud_level", 11),
            kill: range("pudge_pud_kill", 11),
            deny: range("pudge_pud_deny", 12),
            not_yet: range("pudge_pud_notyet", 3),
            pain: range("pudge_pud_pain", 7),
            purchase: range("pudge_pud_purch", 5)
        };

        case Hero_Type.tidehunter: return {
            file: "soundevents/voscripts/game_sounds_vo_tidehunter.vsndevts",
            spawn: range("tidehunter_tide_spawn", 9),
            move: range("tidehunter_tide_move", 9),
            attack: range("tidehunter_tide_attack", 11),
            level_up: range("tidehunter_tide_level", 25),
            kill: range("tidehunter_tide_kill", 12),
            deny: range("tidehunter_tide_deny", 8),
            not_yet: range("tidehunter_tide_notyet", 9),
            pain: range("tidehunter_tide_pain", 5),
            purchase: range("tidehunter_tide_purch", 3)
        };

        case Hero_Type.luna: return {
            file: "soundevents/voscripts/game_sounds_vo_luna.vsndevts",
            spawn: range("luna_luna_spawn", 4),
            move: range("luna_luna_move", 20),
            attack: range("luna_luna_attack", 28),
            level_up: range("luna_luna_levelup", 10),
            kill: range("luna_luna_kill", 11),
            deny: range("luna_luna_deny", 13),
            not_yet: range("luna_luna_notyet", 9),
            pain: range("luna_luna_pain", 11),
            purchase: range("luna_luna_purch", 3)
        };

        case Hero_Type.skywrath_mage: return {
            file: "soundevents/voscripts/game_sounds_vo_skywrath_mage.vsndevts",
            spawn: range("skywrath_mage_drag_spawn", 4),
            move: range("skywrath_mage_drag_move", 22),
            attack: range("skywrath_mage_drag_attack", 14),
            level_up: range("skywrath_mage_drag_levelup", 10),
            kill: range("skywrath_mage_drag_kill", 12),
            deny: range("skywrath_mage_drag_deny", 16),
            not_yet: range("skywrath_mage_drag_notyet", 9),
            pain: range("skywrath_mage_drag_pain", 9),
            purchase: range("skywrath_mage_drag_purch", 3)
        };

        case Hero_Type.dragon_knight: return {
            // TODO dragon form
            file: "soundevents/voscripts/game_sounds_vo_dragon_knight.vsndevts",
            spawn: range("dragon_knight_drag_spawn", 4),
            move: range("dragon_knight_drag_move", 13),
            attack: range("dragon_knight_dragon_attack", 10),
            level_up: range("dragon_knight_dragon_level", 7),
            kill: range("dragon_knight_drag_kill", 13),
            deny: range("dragon_knight_drag_deny", 9),
            not_yet: range("dragon_knight_drag_notyet", 9),
            pain: range("dragon_knight_dragon_pain", 8),
            purchase: range("dragon_knight_drag_purch", 3)
        };

        case Hero_Type.lion: return {
            file: "soundevents/voscripts/game_sounds_vo_lion.vsndevts",
            spawn: range("lion_lion_spawn", 6),
            move: range("lion_lion_move", 13),
            attack: range("lion_lion_attack", 14),
            level_up: range("lion_lion_level", 7),
            kill: range("lion_lion_kill", 11),
            deny: range("lion_lion_deny", 10),
            not_yet: range("lion_lion_notyet", 10),
            pain: range("lion_lion_pain", 10),
            purchase: range("lion_lion_purc", 3)
        };
    }
}

