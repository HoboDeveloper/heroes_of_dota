class Modifier_Damage_Effect extends CDOTA_Modifier_Lua {
    GetStatusEffectName(): string {
        return "particles/status_effect_dmg.vpcf";
    }

    StatusEffectPriority(): number {
        return 2;
    }
}