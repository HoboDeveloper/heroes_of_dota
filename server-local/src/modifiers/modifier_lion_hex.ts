class Modifier_Lion_Hex extends CDOTA_Modifier_Lua {
    DeclareFunctions(): modifierfunction[] {
        return [
            modifierfunction.MODIFIER_PROPERTY_MODEL_CHANGE
        ]
    }

    GetModifierModelChange(): string {
        return "models/props_gameplay/frog.vmdl";
    }

    OnDestroy(): void {
        if (IsServer()) {
            const fx = "particles/units/heroes/hero_lion/lion_spell_voodoo.vpcf";
            ParticleManager.ReleaseParticleIndex(ParticleManager.CreateParticle(fx, ParticleAttachment_t.PATTACH_ABSORIGIN, this.GetParent()));
        }
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Lion_Hex = Modifier_Lion_Hex.prototype;