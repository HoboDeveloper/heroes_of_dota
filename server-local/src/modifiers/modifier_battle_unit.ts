class Modifier_Battle_Unit extends CDOTA_Modifier_Lua {
    CheckState(): { [state: number]: boolean } {
        return {
            [modifierstate.MODIFIER_STATE_NO_HEALTH_BAR]: true,
            [modifierstate.MODIFIER_STATE_DISARMED]: true,
            [modifierstate.MODIFIER_STATE_INVULNERABLE]: true,
            [modifierstate.MODIFIER_STATE_FLYING_FOR_PATHING_PURPOSES_ONLY]: true
        }
    }

    DeclareFunctions(): modifierfunction[] {
        return [ modifierfunction.MODIFIER_PROPERTY_MODEL_SCALE ];
    }

    GetModifierModelScale(): number {
        return -15;
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Battle_Unit = Modifier_Battle_Unit.prototype;