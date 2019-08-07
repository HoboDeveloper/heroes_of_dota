class Modifier_Euls_Scepter extends CDOTA_Modifier_Lua {
    OnCreated(): void {
        if (IsServer()) {
            this.StartIntervalThink(0);
        }
    }

    OnIntervalThink(): void {
        const current_angle = (GameRules.GetGameTime() * 16.0) % (Math.PI * 2);
        this.GetParent().SetForwardVector(Vector(Math.cos(current_angle), Math.sin(current_angle)))
    }

    DeclareFunctions(): modifierfunction[] {
        return [
            modifierfunction.MODIFIER_PROPERTY_VISUAL_Z_DELTA
        ]
    }

    GetVisualZDelta(): number {
        return 400
    }

    GetEffectName(): string {
        return "particles/euls_scepter/cyclone.vpcf";
    }

    GetEffectAttachType(): ParticleAttachment_t {
        return ParticleAttachment_t.PATTACH_ABSORIGIN;
    }
}

// TODO TSTL BUG
//@ts-ignore
Modifier_Euls_Scepter = Modifier_Euls_Scepter.prototype;