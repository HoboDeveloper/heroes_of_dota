class Modifier_Dragon_Knight_Elder_Dragon extends CDOTA_Modifier_Lua {
    DeclareFunctions(): modifierfunction[] {
        return [
            modifierfunction.MODIFIER_PROPERTY_MODEL_CHANGE
        ]
    }

    GetModifierModelChange(): string {
        return "models/heroes/dragon_knight/dragon_knight_dragon.vmdl";
    }

    OnCreated(): void {
        if (IsServer()) {
            this.StartIntervalThink(0);
        }
    }

    OnIntervalThink(): void {
        this.GetParent().SetSkin(1);
        this.StartIntervalThink(-1);
    }

    OnDestroy(): void {
        if (IsServer()) {
            const fx = "particles/units/heroes/hero_dragon_knight/dragon_knight_transform_red.vpcf";
            ParticleManager.ReleaseParticleIndex(ParticleManager.CreateParticle(fx, ParticleAttachment_t.PATTACH_ABSORIGIN, this.GetParent()));
            this.GetParent().EmitSound("Hero_DragonKnight.ElderDragonForm.Revert");
        }
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Dragon_Knight_Elder_Dragon = Modifier_Dragon_Knight_Elder_Dragon.prototype;