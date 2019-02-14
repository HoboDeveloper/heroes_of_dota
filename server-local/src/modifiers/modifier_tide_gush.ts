class Modifier_Tide_Gush extends CDOTA_Modifier_Lua {
    GetStatusEffectName(): string {
        return "particles/status_fx/status_effect_gush.vpcf";
    }

    GetEffectName(): string {
        return "particles/units/heroes/hero_tidehunter/tidehunter_gush_slow.vpcf";
    }

    GetEffectAttachType(): ParticleAttachment_t {
        return ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW;
    }

    GetAttributes(): DOTAModifierAttribute_t {
        return DOTAModifierAttribute_t.MODIFIER_ATTRIBUTE_MULTIPLE
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Tide_Gush = Modifier_Tide_Gush.prototype;