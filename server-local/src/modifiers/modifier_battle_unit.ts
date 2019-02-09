class Modifier_Battle_Unit extends CDOTA_Modifier_Lua {
    CheckState(): { [state: number]: boolean } {
        return {
            [modifierstate.MODIFIER_STATE_NO_HEALTH_BAR]: true,
            [modifierstate.MODIFIER_STATE_DISARMED]: true,
            [modifierstate.MODIFIER_STATE_INVULNERABLE]: true
        }
    }

    DeclareFunctions(): modifierfunction[] {
        return [ modifierfunction.MODIFIER_PROPERTY_MODEL_SCALE ];
    }

    GetModifierModelScale(): number {
        return -15;
    }
}